// Creates a Razorpay Order for a SOCIETY plan and records a matching
// `pending` invoice in billing_history.
//
// This is the sibling of create-subscription-order, and it repeats that
// function's hardening rather than trusting it: server-side pricing so a
// tampered request body cannot buy a building for one rupee, identity
// from the JWT, and resume-don't-duplicate for a reopened checkout
// including the pay-then-close recovery path.
//
// What is different from Pro, and why it matters: the thing being bought
// belongs to a COMMUNITY, not to the buyer. So on top of "are you signed
// in" there is "do you administer this specific society" -- checked
// server-side against community_members, because the client telling us it
// is an admin proves nothing. Anyone can call this endpoint with any
// community_id.
//
// One-time payment (Orders API), not a Razorpay Subscription, for the
// same reason as Pro: recurring billing needs dashboard-managed plan ids
// and renewal webhooks this stack does not have. The society runs until
// current_period_end and an admin renews.
//
// Requires: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID") ?? "";
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET") ?? "";

// Rupees first (GST rounded to the rupee, matching what the UI shows),
// then paise for Razorpay. Change the price here and nowhere else.
const PLAN_PRICING: Record<string, { baseRupees: number; periodMonths: number; label: string }> = {
  society_annual: { baseRupees: 4999, periodMonths: 12, label: "Society Plan (annual)" },
};

interface OrderRequest {
  plan?: string;
  communityId?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status,
    });

  try {
    if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
      return json(
        { error: "Payments are not configured yet. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET as Supabase secrets." },
        501
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Not authenticated" }, 401);

    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData?.user) return json({ error: "Not authenticated" }, 401);
    const userId = userData.user.id;

    const body: OrderRequest = await req.json().catch(() => ({}));
    const plan = String(body.plan ?? "society_annual");
    const communityId = String(body.communityId ?? "");
    const pricing = PLAN_PRICING[plan];
    if (!pricing) return json({ error: "Unknown plan." }, 400);
    if (!communityId) return json({ error: "Which society is this for?" }, 400);

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // The authorization that matters. Not "is this person an owner" but
    // "does this person run THIS society" -- the community_id came from
    // the request body and is otherwise unverified.
    const { data: membership } = await serviceClient
      .from("community_members")
      .select("role, status")
      .eq("community_id", communityId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!membership || membership.role !== "admin" || membership.status !== "approved") {
      return json({ error: "Only an admin of this society can start its plan." }, 403);
    }

    const { data: community } = await serviceClient
      .from("communities")
      .select("id, name, status")
      .eq("id", communityId)
      .maybeSingle();
    if (!community) return json({ error: "Society not found." }, 404);
    if (community.status !== "active") {
      return json({ error: "This society is still being reviewed by Bhavan." }, 409);
    }

    // Do not sell a plan to a building that already has one running. The
    // renewal path extends the existing period instead.
    const { data: currentSub } = await serviceClient
      .from("community_subscriptions")
      .select("status, current_period_end")
      .eq("community_id", communityId)
      .maybeSingle();
    const currentEnd = currentSub?.current_period_end ? new Date(currentSub.current_period_end) : null;
    const alreadyActive =
      currentSub?.status === "active" && (!currentEnd || currentEnd > new Date());

    const { data: profile } = await serviceClient
      .from("users")
      .select("name, email")
      .eq("id", userId)
      .maybeSingle();

    const baseRupees = pricing.baseRupees;
    const gstRupees = Math.round(baseRupees * 0.18);
    const totalRupees = baseRupees + gstRupees;
    const amountPaise = baseRupees * 100;
    const gstPaise = gstRupees * 100;
    const totalPaise = totalRupees * 100;

    const payloadFor = (billingRowId: string, orderId: string) => ({
      billingRowId,
      orderId,
      amount: totalPaise,
      currency: "INR",
      keyId: RAZORPAY_KEY_ID,
      ownerName: profile?.name || "Society admin",
      ownerEmail: profile?.email || userData.user.email || "",
      planLabel: `${pricing.label} - ${community.name}`,
      isRenewal: alreadyActive,
    });

    // Resume an unpaid order for this society rather than creating a new
    // one every time checkout is reopened.
    const { data: existing, error: existingError } = await serviceClient
      .from("billing_history")
      .select("id, razorpay_order_id, total_amount")
      .eq("community_id", communityId)
      .eq("plan", plan)
      .eq("status", "pending")
      .not("razorpay_order_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingError) return json({ error: existingError.message }, 500);

    if (existing?.razorpay_order_id && existing.total_amount === totalPaise) {
      // Pay-then-close recovery: the money may already have been taken
      // while the invoice is still pending. Razorpay refuses a paid order
      // at checkout, which would otherwise leave this society permanently
      // unable to buy. Ask Razorpay what actually happened first.
      const payRes = await fetch(
        `https://api.razorpay.com/v1/orders/${existing.razorpay_order_id}/payments`,
        { headers: { Authorization: `Basic ${btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`)}` } }
      );
      const payBody = await payRes.json().catch(() => ({}));
      const captured = Array.isArray(payBody?.items)
        ? payBody.items.find((p: { status?: string }) => p.status === "captured")
        : null;

      if (captured) {
        return json({
          alreadyPaid: true,
          billingRowId: existing.id,
          orderId: existing.razorpay_order_id,
          paymentId: captured.id,
          planLabel: pricing.label,
        });
      }

      return json(payloadFor(existing.id, existing.razorpay_order_id));
    }

    const receipt = `soc_${communityId.slice(0, 8)}_${Date.now()}`;
    const orderRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`)}`,
      },
      body: JSON.stringify({
        amount: totalPaise,
        currency: "INR",
        receipt,
        notes: {
          community_id: communityId,
          paid_by: userId,
          plan,
          product: "bhavan_society_subscription",
        },
      }),
    });
    const order = await orderRes.json().catch(() => ({}));
    if (!orderRes.ok || !order?.id) {
      return json({ error: order?.error?.description || "Razorpay could not create this order." }, 502);
    }

    const periodStart = new Date();
    const periodEnd = new Date(periodStart);
    periodEnd.setMonth(periodEnd.getMonth() + pricing.periodMonths);

    const { data: invoiceRow, error: insertError } = await serviceClient
      .from("billing_history")
      .insert({
        owner_id: userId,
        community_id: communityId,
        invoice_number: `INV-${periodStart.getFullYear()}-${String(order.id).slice(-6).toUpperCase()}`,
        plan,
        amount: amountPaise,
        gst_amount: gstPaise,
        total_amount: totalPaise,
        currency: "INR",
        status: "pending",
        razorpay_order_id: order.id,
        billing_period_start: periodStart.toISOString().slice(0, 10),
        billing_period_end: periodEnd.toISOString().slice(0, 10),
      })
      .select("id")
      .single();
    if (insertError) return json({ error: insertError.message }, 500);

    return json(payloadFor(invoiceRow.id, order.id));
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});

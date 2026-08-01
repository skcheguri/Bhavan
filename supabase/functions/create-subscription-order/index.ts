// Creates a real Razorpay Order for an owner's Pro subscription purchase
// and records a matching `pending` invoice in billing_history.
//
// Pricing is a server-side table keyed by plan -- never trusted from the
// request body, so a caller can't buy Pro for one rupee by tampering with
// the request. Identity comes from the caller's JWT. This is the same
// hardening pattern as create-rent-payment-order.
//
// This is deliberately a ONE-TIME payment (Razorpay Orders API), not a
// recurring Razorpay Subscription: recurring billing needs dashboard-
// managed plan ids plus renewal webhooks this stack doesn't have yet.
// Pro simply runs until current_period_end and the owner renews manually.
//
// Requires the same two secrets as the rent-payment functions:
//   RAZORPAY_KEY_ID
//   RAZORPAY_KEY_SECRET

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID") ?? "";
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET") ?? "";

// Rupee math first (matches what the UI displays: GST rounded to the
// rupee), then converted to paise for Razorpay and billing_history.
const PLAN_PRICING: Record<string, { baseRupees: number; periodMonths: number; label: string }> = {
  pro_monthly: { baseRupees: 199, periodMonths: 1, label: "Pro Monthly" },
  pro_annual: { baseRupees: 999, periodMonths: 12, label: "Pro Annual" },
};

interface OrderRequest {
  plan?: string;
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
      return json({ error: "Payments are not configured yet. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET as Supabase secrets." }, 501);
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
    const plan = String(body.plan ?? "");
    const pricing = PLAN_PRICING[plan];
    if (!pricing) return json({ error: "Unknown plan. Choose pro_monthly or pro_annual." }, 400);

    // billing_history has no INSERT policy for clients (correctly -- an
    // invoice should only ever be written by this function), so DB work
    // runs service-role after the ownership checks above/below.
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Pro plans are an owner-side product.
    const { data: profile } = await serviceClient
      .from("users")
      .select("role, name, email")
      .eq("id", userId)
      .maybeSingle();
    if (!profile || (profile.role !== "owner" && profile.role !== "landlord")) {
      return json({ error: "Pro plans are available to property owners only." }, 403);
    }

    const baseRupees = pricing.baseRupees;
    const gstRupees = Math.round(baseRupees * 0.18);
    const totalRupees = baseRupees + gstRupees;
    const amountPaise = baseRupees * 100;
    const gstPaise = gstRupees * 100;
    const totalPaise = totalRupees * 100;

    // Resume an existing unpaid order for this plan instead of creating a
    // duplicate every time the checkout is reopened.
    const { data: existing, error: existingError } = await serviceClient
      .from("billing_history")
      .select("id, razorpay_order_id, total_amount")
      .eq("owner_id", userId)
      .eq("plan", plan)
      .eq("status", "pending")
      .not("razorpay_order_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingError) return json({ error: existingError.message }, 500);

    if (existing?.razorpay_order_id && existing.total_amount === totalPaise) {
      // Recovery for pay-then-close: if the browser died between the
      // Razorpay success callback and verify-subscription-payment, the
      // invoice is still `pending` while the money HAS been taken.
      // Handing the same order id back to Checkout fails (Razorpay
      // refuses an already-paid order), which used to leave the user
      // permanently unable to buy that plan. Ask Razorpay what actually
      // happened before assuming the order is still payable.
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

      return json({
        billingRowId: existing.id,
        orderId: existing.razorpay_order_id,
        amount: totalPaise,
        currency: "INR",
        keyId: RAZORPAY_KEY_ID,
        ownerName: profile.name || "Owner",
        ownerEmail: profile.email || userData.user.email || "",
        planLabel: pricing.label,
      });
    }

    const receipt = `sub_${userId.slice(0, 8)}_${Date.now()}`;
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
        notes: { owner_id: userId, plan, product: "bhavan_pro_subscription" },
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

    return json({
      billingRowId: invoiceRow.id,
      orderId: order.id,
      amount: totalPaise,
      currency: "INR",
      keyId: RAZORPAY_KEY_ID,
      ownerName: profile.name || "Owner",
      ownerEmail: profile.email || userData.user.email || "",
      planLabel: pricing.label,
    });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});

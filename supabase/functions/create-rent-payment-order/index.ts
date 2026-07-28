// Creates a real Razorpay Order for a tenant's rent payment and records
// a matching `pending` row in rent_payments. The amount, tenant and
// owner are all derived server-side from the tenant's own
// rental_agreements row -- never trusted from the request body, so a
// caller can't pay an arbitrary amount into an arbitrary owner's
// account by tampering with the request.
//
// Runs with the caller's own JWT (not the service role) so RLS scopes
// the agreement lookup and the rent_payments insert to their own rows.
// Requires two secrets (`supabase secrets set NAME=value`):
//   RAZORPAY_KEY_ID
//   RAZORPAY_KEY_SECRET

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID") ?? "";
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET") ?? "";

interface OrderRequest {
  agreementId?: string;
  month?: string;
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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) return json({ error: "Not authenticated" }, 401);
    const userId = userData.user.id;

    const body: OrderRequest = await req.json().catch(() => ({}));
    const agreementId = String(body.agreementId ?? "");
    const month = String(body.month ?? "").trim();
    if (!agreementId || !month) {
      return json({ error: "agreementId and month are required" }, 400);
    }

    // RLS ("Tenants can read agreements naming them") plus this explicit
    // filter both scope the lookup to the caller's own tenancy.
    const { data: agreement, error: agreementError } = await supabase
      .from("rental_agreements")
      .select("id, owner_id, tenant_id, tenant_name, tenant_email, monthly_rent")
      .eq("id", agreementId)
      .eq("tenant_id", userId)
      .maybeSingle();

    if (agreementError) return json({ error: agreementError.message }, 500);
    if (!agreement) return json({ error: "No rental agreement found for you with that id." }, 404);

    const amountPaise = Math.round(Number(agreement.monthly_rent ?? 0) * 100);
    if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
      return json({ error: "This agreement has no valid monthly rent set." }, 400);
    }

    const tenantName = agreement.tenant_name || userData.user.email || "Tenant";
    const tenantEmail = agreement.tenant_email || userData.user.email || "";

    // Don't create a new order (or a new DB row) every time this is
    // called -- a tenant re-clicking "Pay Rent Now" after cancelling
    // Checkout, or after a transient failure, should resume the same
    // pending order rather than pile up duplicates in their history.
    // Razorpay orders don't expire, so an older pending one is still
    // payable.
    const { data: existing, error: existingError } = await supabase
      .from("rent_payments")
      .select("id, status, razorpay_order_id")
      .eq("tenant_id", userId)
      .eq("agreement_id", agreementId)
      .eq("month", month)
      .in("status", ["pending", "paid"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingError) return json({ error: existingError.message }, 500);

    if (existing?.status === "paid") {
      return json({ error: `You've already paid rent for ${month}.` }, 409);
    }

    if (existing?.status === "pending" && existing.razorpay_order_id) {
      return json({
        paymentRowId: existing.id,
        orderId: existing.razorpay_order_id,
        amount: amountPaise,
        currency: "INR",
        keyId: RAZORPAY_KEY_ID,
        tenantName,
        tenantEmail,
      });
    }

    const receipt = `rent_${agreementId.slice(0, 8)}_${Date.now()}`;
    const orderRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`)}`,
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency: "INR",
        receipt,
        notes: {
          agreement_id: agreementId,
          tenant_id: userId,
          owner_id: agreement.owner_id,
          month,
        },
      }),
    });
    const order = await orderRes.json().catch(() => ({}));
    if (!orderRes.ok || !order?.id) {
      return json({ error: order?.error?.description || "Razorpay could not create this order." }, 502);
    }

    const { data: paymentRow, error: insertError } = await supabase
      .from("rent_payments")
      .insert({
        tenant_id: userId,
        owner_id: agreement.owner_id,
        agreement_id: agreementId,
        amount: amountPaise,
        month,
        payment_mode: "razorpay",
        status: "pending",
        razorpay_order_id: order.id,
      })
      .select("id")
      .single();

    if (insertError) return json({ error: insertError.message }, 500);

    return json({
      paymentRowId: paymentRow.id,
      orderId: order.id,
      amount: amountPaise,
      currency: "INR",
      keyId: RAZORPAY_KEY_ID,
      tenantName,
      tenantEmail,
    });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});

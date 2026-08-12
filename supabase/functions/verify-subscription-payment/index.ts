// Verifies a Razorpay Checkout success callback for a Pro subscription
// purchase server-side, and only then marks the invoice paid and
// activates (or extends) the owner's subscription.
//
// Same trust model as verify-rent-payment: the client-side handler
// callback is not proof of payment -- only the HMAC signature (which
// requires the account's key secret to forge) authorizes the state
// change, and the DB writes run service-role because no RLS policy
// grants clients any write on billing_history or owner_subscriptions
// (correctly -- this function is the one thing allowed to).
//
// Requires: RAZORPAY_KEY_SECRET

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyRazorpaySignature } from "../../../src/lib/payments/razorpaySignature.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID") ?? "";
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET") ?? "";

const PLAN_PERIOD_MONTHS: Record<string, number> = {
  pro_monthly: 1,
  pro_annual: 12,
};

interface VerifyRequest {
  billingRowId?: string;
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  razorpay_signature?: string;
  recoverPaidOrder?: boolean;
}

// Recovery path for a payment that succeeded but was never verified
// (browser closed mid-checkout), where no signature is available.
// `recoverPaidOrder` is a CLIENT-SUPPLIED flag and therefore proves
// nothing on its own -- so instead of trusting it, we ask Razorpay
// directly whether this payment exists, is captured, and belongs to this
// order. That is strictly stronger than a signature the client hands us.
async function confirmPaymentWithRazorpay(
  paymentId: string,
  orderId: string
): Promise<{ ok: boolean; error?: string }> {
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    return { ok: false, error: "Payments are not configured." };
  }
  const res = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Basic ${btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`)}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: body?.error?.description || "Could not confirm this payment with Razorpay." };
  if (body?.status !== "captured") return { ok: false, error: `This payment is not captured (status: ${body?.status}).` };
  if (body?.order_id !== orderId) return { ok: false, error: "This payment belongs to a different order." };
  return { ok: true };
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
    if (!RAZORPAY_KEY_SECRET) {
      return json({ error: "Payments are not configured yet." }, 501);
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

    const body: VerifyRequest = await req.json().catch(() => ({}));
    const { billingRowId, razorpay_order_id, razorpay_payment_id, razorpay_signature, recoverPaidOrder } = body;
    if (!billingRowId || !razorpay_order_id || !razorpay_payment_id) {
      return json({ error: "Missing payment verification fields." }, 400);
    }

    if (recoverPaidOrder) {
      const confirmed = await confirmPaymentWithRazorpay(razorpay_payment_id, razorpay_order_id);
      if (!confirmed.ok) {
        return json({ error: confirmed.error || "Could not confirm this payment." }, 400);
      }
    } else {
      if (!razorpay_signature) {
        return json({ error: "Missing payment verification fields." }, 400);
      }
      const signatureOk = await verifyRazorpaySignature(
        RAZORPAY_KEY_SECRET,
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature
      );
      if (!signatureOk) {
        return json({ error: "Payment verification failed. Please contact support before retrying." }, 400);
      }
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: invoice, error: invoiceError } = await serviceClient
      .from("billing_history")
      .select("id, owner_id, plan, status, razorpay_order_id, razorpay_payment_id")
      .eq("id", billingRowId)
      .maybeSingle();
    if (invoiceError) return json({ error: invoiceError.message }, 500);
    if (!invoice) return json({ error: "Invoice not found." }, 404);
    if (invoice.owner_id !== userId) return json({ error: "This invoice does not belong to you." }, 403);
    if (invoice.razorpay_order_id !== razorpay_order_id) {
      return json({ error: "Order mismatch for this invoice." }, 400);
    }

    // Idempotent success: a retried callback for an already-processed
    // payment shouldn't error out or double-extend the period.
    if (invoice.status === "paid") {
      if (invoice.razorpay_payment_id === razorpay_payment_id) {
        return json({ success: true, alreadyProcessed: true });
      }
      return json({ error: "This invoice has already been paid." }, 409);
    }
    // 'failed' is a valid state to fulfil from: Razorpay lets the same
    // order be retried, so a payment.failed may have marked this invoice
    // failed just before the retry that is now succeeding.
    if (invoice.status !== "pending" && invoice.status !== "failed") {
      return json({ error: "This invoice is not payable." }, 409);
    }

    const periodMonths = PLAN_PERIOD_MONTHS[invoice.plan];
    if (!periodMonths) return json({ error: "Invoice has an unknown plan." }, 400);

    // Claim the invoice atomically. The .eq("status","pending") makes
    // this a compare-and-set, and selecting the affected rows is what
    // tells us whether WE won -- without that check, two concurrent
    // verifications (double-click, retried callback) both proceeded and
    // each extended the period, granting two months for one payment.
    const { data: claimed, error: updateInvoiceError } = await serviceClient
      .from("billing_history")
      .update({
        status: "paid",
        razorpay_payment_id,
        paid_at: new Date().toISOString(),
      })
      .eq("id", invoice.id)
      .in("status", ["pending", "failed"])
      .select("id");
    if (updateInvoiceError) return json({ error: updateInvoiceError.message }, 500);
    if (!claimed || claimed.length === 0) {
      // Someone else claimed it between our read and this write.
      return json({ success: true, alreadyProcessed: true });
    }

    // Renewing before expiry extends from the current period end, not
    // from today -- an owner paying early must not lose remaining days.
    const { data: existingSub } = await serviceClient
      .from("owner_subscriptions")
      .select("id, status, current_period_end")
      .eq("owner_id", userId)
      .maybeSingle();

    const now = new Date();
    const existingEnd = existingSub?.current_period_end ? new Date(existingSub.current_period_end) : null;
    const extendFrom = existingSub?.status === "active" && existingEnd && existingEnd > now ? existingEnd : now;
    const periodEnd = new Date(extendFrom);
    periodEnd.setMonth(periodEnd.getMonth() + periodMonths);

    const subscriptionFields = {
      plan: invoice.plan,
      status: "active",
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
      cancel_at_period_end: false,
      updated_at: now.toISOString(),
    };

    // Upsert on the owner_id unique constraint (migration 069) rather
    // than branching on "does a row exist" -- that read-then-insert could
    // race into two rows for one owner, and every later .maybeSingle()
    // errors on multiple rows, which rendered a PAYING customer as free.
    const { error: subError } = await serviceClient
      .from("owner_subscriptions")
      .upsert({ owner_id: userId, ...subscriptionFields }, { onConflict: "owner_id" });
    if (subError) return json({ error: subError.message }, 500);

    // Best-effort back-link from the invoice to the subscription row.
    const { data: subRow } = await serviceClient
      .from("owner_subscriptions")
      .select("id")
      .eq("owner_id", userId)
      .maybeSingle();
    if (subRow) {
      await serviceClient.from("billing_history").update({ subscription_id: subRow.id }).eq("id", invoice.id);
    }

    return json({ success: true, plan: invoice.plan, currentPeriodEnd: periodEnd.toISOString() });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});

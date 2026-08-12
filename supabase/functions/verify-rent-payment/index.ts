// Verifies a Razorpay Checkout success callback server-side and only
// then marks the matching rent_payments row as paid.
//
// Razorpay's `handler` callback fires client-side and is not proof of
// payment by itself -- a malicious client could call it (or this
// endpoint) with a fabricated payment id without ever paying. The HMAC
// signature Razorpay returns alongside order_id/payment_id can only be
// produced by someone holding the account's key secret, so verifying it
// here is what actually authorizes the status change. This is also why
// the DB write below uses the service role: no RLS policy grants
// tenants UPDATE on rent_payments (correctly -- only a verified
// signature should be able to flip a payment to "paid"), and this
// function's whole job is to be the thing that's allowed to.
//
// Requires the same two secrets as create-rent-payment-order:
//   RAZORPAY_KEY_ID
//   RAZORPAY_KEY_SECRET

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyRazorpaySignature } from "../../../src/lib/payments/razorpaySignature.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID") ?? "";
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET") ?? "";

interface VerifyRequest {
  paymentRowId?: string;
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  razorpay_signature?: string;
  recoverPaidOrder?: boolean;
}

// Recovery path for a payment that succeeded but was never verified
// (browser closed mid-checkout), where no signature is available.
// `recoverPaidOrder` is CLIENT-SUPPLIED and proves nothing on its own,
// so we ask Razorpay directly whether this payment exists, is captured,
// and belongs to this order -- strictly stronger than a client signature.
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
    const { paymentRowId, razorpay_order_id, razorpay_payment_id, razorpay_signature, recoverPaidOrder } = body;
    if (!paymentRowId || !razorpay_order_id || !razorpay_payment_id) {
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

    const { data: row, error: rowError } = await serviceClient
      .from("rent_payments")
      .select("id, tenant_id, razorpay_order_id, status")
      .eq("id", paymentRowId)
      .maybeSingle();

    if (rowError) return json({ error: rowError.message }, 500);
    if (!row || row.tenant_id !== userId || row.razorpay_order_id !== razorpay_order_id) {
      return json({ error: "Payment record not found." }, 404);
    }

    if (row.status !== "paid") {
      const { error: updateError } = await serviceClient
        .from("rent_payments")
        .update({
          status: "paid",
          razorpay_payment_id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", paymentRowId);
      if (updateError) return json({ error: updateError.message }, 500);
    }

    return json({ success: true });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});

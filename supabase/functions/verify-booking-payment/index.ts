// Verifies a Razorpay Checkout success callback server-side and only
// then promotes the vacation booking from `awaiting_payment` to a real
// `pending` request (which is also what notifies the host -- see the
// status trigger in migration 126).
//
// Same trust model as verify-rent-payment: the client-side handler
// callback is not proof of payment; the HMAC signature is. The DB write
// uses the service role because bookings have no client write path at
// all.
//
// Requires: RAZORPAY_KEY_SECRET

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyRazorpaySignature } from "../../../src/lib/payments/razorpaySignature.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET") ?? "";

interface VerifyRequest {
  bookingId?: string;
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  razorpay_signature?: string;
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
    const { bookingId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;
    if (!bookingId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
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

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: row, error: rowError } = await serviceClient
      .from("vacation_bookings")
      .select("id, tenant_id, razorpay_order_id, status, payment_status")
      .eq("id", bookingId)
      .maybeSingle();

    if (rowError) return json({ error: rowError.message }, 500);
    if (!row || row.tenant_id !== userId || row.razorpay_order_id !== razorpay_order_id) {
      return json({ error: "Booking record not found." }, 404);
    }

    if (row.status === "awaiting_payment" && row.payment_status !== "paid") {
      const { error: updateError } = await serviceClient
        .from("vacation_bookings")
        .update({
          status: "pending",
          payment_status: "paid",
          razorpay_payment_id,
          paid_at: new Date().toISOString(),
        })
        .eq("id", bookingId);
      if (updateError) return json({ error: updateError.message }, 500);
    }

    return json({ success: true });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});

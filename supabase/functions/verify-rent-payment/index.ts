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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET") ?? "";

interface VerifyRequest {
  paymentRowId?: string;
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  razorpay_signature?: string;
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
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
    const { paymentRowId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;
    if (!paymentRowId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return json({ error: "Missing payment verification fields." }, 400);
    }

    const expectedSignature = await hmacSha256Hex(RAZORPAY_KEY_SECRET, `${razorpay_order_id}|${razorpay_payment_id}`);
    if (!safeEqual(expectedSignature, razorpay_signature)) {
      return json({ error: "Payment verification failed. Please contact support before retrying." }, 400);
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

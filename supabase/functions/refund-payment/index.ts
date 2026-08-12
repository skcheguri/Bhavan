// Admin-initiated refunds for rent and Pro/society payments.
//
// The Pro billing screen promises "a refund within 7 days of purchase,
// contact support" and both tables carry a 'refunded' status the UI
// renders -- but nothing could issue one. This is that path: an admin
// (verified server-side, never trusted from the body) refunds a
// specific payment through Razorpay, the row is marked refunded with the
// refund id, a refunded Pro plan is revoked, and the user is notified.
//
// Dashboard-initiated refunds are reconciled separately by
// razorpay-webhook (refund.processed); this function is the in-app path.
//
// Requires RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID") ?? "";
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET") ?? "";

interface RefundRequest {
  kind?: "pro" | "rent";
  id?: string;
  reason?: string;
}

async function razorpayRefund(paymentId: string, notes: Record<string, string>): Promise<{ ok: boolean; refundId?: string; error?: string }> {
  const res = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}/refund`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`)}`,
    },
    body: JSON.stringify({ notes }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.id) {
    return { ok: false, error: json?.error?.description || "Razorpay refund failed." };
  }
  return { ok: true, refundId: String(json.id) };
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

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Admin gate, checked server-side against the users table (service
    // role bypasses RLS) -- never from a request field.
    const { data: me } = await serviceClient
      .from("users")
      .select("role")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (me?.role !== "admin") return json({ error: "Admins only." }, 403);

    const body: RefundRequest = await req.json().catch(() => ({}));
    const kind = body.kind;
    const id = String(body.id ?? "");
    const reason = String(body.reason ?? "").slice(0, 500);
    if ((kind !== "pro" && kind !== "rent") || !id) {
      return json({ error: "kind ('pro'|'rent') and id are required." }, 400);
    }

    const table = kind === "pro" ? "billing_history" : "rent_payments";
    const { data: row, error: rowError } = await serviceClient
      .from(table)
      .select("id, owner_id, status, razorpay_payment_id")
      .eq("id", id)
      .maybeSingle();
    if (rowError) return json({ error: rowError.message }, 500);
    if (!row) return json({ error: "Payment not found." }, 404);
    if (row.status === "refunded") return json({ error: "This payment is already refunded." }, 409);
    if (row.status !== "paid") return json({ error: "Only a paid payment can be refunded." }, 409);
    if (!row.razorpay_payment_id) {
      return json({ error: "This payment has no Razorpay reference (was it an offline/cash payment?)." }, 409);
    }

    const refund = await razorpayRefund(row.razorpay_payment_id, {
      kind,
      record_id: id,
      refunded_by: userData.user.id,
      reason,
    });
    if (!refund.ok) return json({ error: refund.error }, 502);

    const now = new Date().toISOString();
    const { error: updateError } = await serviceClient
      .from(table)
      .update({ status: "refunded", razorpay_refund_id: refund.refundId, refunded_at: now })
      .eq("id", id);
    if (updateError) return json({ error: updateError.message }, 500);

    // A refunded Pro/society purchase loses the entitlement it bought.
    let notifyUser = row.owner_id as string | null;
    if (kind === "pro") {
      const { data: invoice } = await serviceClient
        .from("billing_history")
        .select("community_id")
        .eq("id", id)
        .maybeSingle();
      if (invoice?.community_id) {
        await serviceClient
          .from("community_subscriptions")
          .update({ status: "cancelled", updated_at: now })
          .eq("community_id", invoice.community_id);
      } else if (row.owner_id) {
        await serviceClient
          .from("owner_subscriptions")
          .update({ status: "cancelled", cancel_at_period_end: true, updated_at: now })
          .eq("owner_id", row.owner_id);
      }
    }

    // For rent, the person owed the money back is the tenant.
    if (kind === "rent") {
      const { data: rp } = await serviceClient
        .from("rent_payments")
        .select("tenant_id")
        .eq("id", id)
        .maybeSingle();
      notifyUser = (rp?.tenant_id as string) ?? notifyUser;
    }

    if (notifyUser) {
      await serviceClient.from("notifications").insert({
        user_id: notifyUser,
        type: "payment",
        title: "Payment refunded",
        message:
          kind === "pro"
            ? "Your Pro plan payment has been refunded. The refund reaches your original payment method in 5-7 business days."
            : "Your rent payment has been refunded. It reaches your original payment method in 5-7 business days.",
        action_url: kind === "pro" ? "/owner-profile?tab=billing" : "/rent-payment",
      });
    }

    return json({ success: true, refundId: refund.refundId });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});

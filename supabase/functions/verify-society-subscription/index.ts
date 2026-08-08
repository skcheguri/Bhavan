// Verifies a Razorpay callback for a SOCIETY plan and only then marks the
// invoice paid and activates the building's subscription.
//
// This function is the only thing in the system that can create a
// community_subscriptions row. That table has no INSERT or UPDATE policy
// for any client, so a signed-in user cannot grant their own building the
// paid features no matter what they send -- the entitlement in RLS
// (community_is_paid) is only as trustworthy as this boundary.
//
// Trust model, same as verify-subscription-payment: the browser's success
// callback proves nothing. Either the HMAC signature verifies -- which
// needs the account key secret to forge -- or, on the recovery path where
// no signature exists, we ask Razorpay directly whether the payment is
// captured and belongs to this order. The client-supplied recoverPaidOrder
// flag is a hint about which path to take, never evidence.
//
// Requires: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyRazorpaySignature } from "../../../src/lib/payments/razorpaySignature.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID") ?? "";
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET") ?? "";

const PLAN_PERIOD_MONTHS: Record<string, number> = {
  society_annual: 12,
};

interface VerifyRequest {
  billingRowId?: string;
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  razorpay_signature?: string;
  recoverPaidOrder?: boolean;
}

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
  if (!res.ok) {
    return { ok: false, error: body?.error?.description || "Could not confirm this payment with Razorpay." };
  }
  if (body?.status !== "captured") {
    return { ok: false, error: `This payment is not captured (status: ${body?.status}).` };
  }
  if (body?.order_id !== orderId) {
    return { ok: false, error: "This payment belongs to a different order." };
  }
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
    if (!RAZORPAY_KEY_SECRET) return json({ error: "Payments are not configured yet." }, 501);

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
      if (!confirmed.ok) return json({ error: confirmed.error || "Could not confirm this payment." }, 400);
    } else {
      if (!razorpay_signature) return json({ error: "Missing payment verification fields." }, 400);
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
      .select("id, owner_id, community_id, plan, status, razorpay_order_id, razorpay_payment_id")
      .eq("id", billingRowId)
      .maybeSingle();
    if (invoiceError) return json({ error: invoiceError.message }, 500);
    if (!invoice) return json({ error: "Invoice not found." }, 404);
    if (invoice.owner_id !== userId) return json({ error: "This invoice does not belong to you." }, 403);
    if (invoice.razorpay_order_id !== razorpay_order_id) {
      return json({ error: "Order mismatch for this invoice." }, 400);
    }
    if (!invoice.community_id) {
      return json({ error: "This is not a society invoice." }, 400);
    }

    // A retried callback must not double-extend the period.
    if (invoice.status === "paid") {
      if (invoice.razorpay_payment_id === razorpay_payment_id) {
        return json({ success: true, alreadyProcessed: true });
      }
      return json({ error: "This invoice has already been paid." }, 409);
    }

    const periodMonths = PLAN_PERIOD_MONTHS[invoice.plan];
    if (!periodMonths) return json({ error: "Invoice has an unknown plan." }, 400);

    // Compare-and-set. Selecting the affected rows is what tells us we
    // won: without it two concurrent callbacks each extended the period,
    // giving a year of service away for one payment.
    const { data: claimed, error: updateInvoiceError } = await serviceClient
      .from("billing_history")
      .update({
        status: "paid",
        razorpay_payment_id,
        paid_at: new Date().toISOString(),
      })
      .eq("id", invoice.id)
      .eq("status", "pending")
      .select("id");
    if (updateInvoiceError) return json({ error: updateInvoiceError.message }, 500);
    if (!claimed || claimed.length === 0) {
      return json({ success: true, alreadyProcessed: true });
    }

    // Renewing early extends from the existing end, so a society that
    // pays ahead of expiry does not lose the days it already bought.
    const { data: existingSub } = await serviceClient
      .from("community_subscriptions")
      .select("id, status, current_period_end")
      .eq("community_id", invoice.community_id)
      .maybeSingle();

    const now = new Date();
    const existingEnd = existingSub?.current_period_end ? new Date(existingSub.current_period_end) : null;
    const extendFrom = existingSub?.status === "active" && existingEnd && existingEnd > now ? existingEnd : now;
    const periodEnd = new Date(extendFrom);
    periodEnd.setMonth(periodEnd.getMonth() + periodMonths);

    // Recorded for the record, not used for pricing -- the plan is flat.
    const { count: unitCount } = await serviceClient
      .from("community_members")
      .select("id", { count: "exact", head: true })
      .eq("community_id", invoice.community_id)
      .eq("status", "approved");

    // Upsert on the community_id unique constraint rather than
    // read-then-insert, which can race into two rows for one society and
    // then every maybeSingle() errors -- rendering a paying building as
    // free. Same failure the Pro flow hit with owner_id.
    const { error: subError } = await serviceClient
      .from("community_subscriptions")
      .upsert(
        {
          community_id: invoice.community_id,
          plan: "standard",
          status: "active",
          purchased_by: userId,
          unit_count: unitCount ?? null,
          current_period_start: now.toISOString(),
          current_period_end: periodEnd.toISOString(),
          updated_at: now.toISOString(),
        },
        { onConflict: "community_id" }
      );
    if (subError) return json({ error: subError.message }, 500);

    // Tell the building it can now raise maintenance issues. Best effort:
    // a failed notification must not undo a successful payment.
    try {
      const { data: members } = await serviceClient
        .from("community_members")
        .select("user_id")
        .eq("community_id", invoice.community_id)
        .eq("status", "approved");

      if (members?.length) {
        await serviceClient.from("notifications").insert(
          members.map((m: { user_id: string }) => ({
            user_id: m.user_id,
            type: "platform",
            title: "Your society plan is active",
            message: "Maintenance issues can now be raised by every owner here.",
            action_url: "/society",
          }))
        );
      }
    } catch {
      // Intentionally swallowed -- see above.
    }

    return json({ success: true, currentPeriodEnd: periodEnd.toISOString() });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});

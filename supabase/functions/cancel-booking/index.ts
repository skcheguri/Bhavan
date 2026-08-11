// The guest's cancellation path, encoding the refund policy:
//
//   awaiting_payment  -> cancelled, nothing was charged.
//   pending (paid)    -> cancelled + FULL refund, always. An unanswered
//                        request must never hold a guest's money hostage
//                        -- this is also the pressure valve that makes a
//                        host who never responds harmless.
//   confirmed (paid)  -> cancelled + full refund IF check-in is more
//                        than 24 hours away; inside the final 24 hours
//                        the payment is forfeited (the host held the
//                        dates and turned others away).
//
// Requires: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID") ?? "";
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET") ?? "";

// Check-in is a date; treat it as midnight IST (the market this app
// serves), so "24 hours before check-in" is unambiguous server-side.
function msUntilCheckIn(checkIn: string): number {
  return new Date(`${checkIn}T00:00:00+05:30`).getTime() - Date.now();
}

async function razorpayRefund(paymentId: string): Promise<{ ok: boolean; refundId?: string; error?: string }> {
  const res = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}/refund`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`)}`,
    },
    body: "{}",
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
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const bookingId = String(body?.bookingId ?? "");
    if (!bookingId) return json({ error: "bookingId is required." }, 400);

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: booking, error: bookingError } = await serviceClient
      .from("vacation_bookings")
      .select("id, listing_id, tenant_id, owner_id, check_in, check_out, status, payment_status, razorpay_payment_id")
      .eq("id", bookingId)
      .maybeSingle();
    if (bookingError) return json({ error: bookingError.message }, 500);
    if (!booking || booking.tenant_id !== userId) {
      return json({ error: "Booking not found." }, 404);
    }

    if (!["awaiting_payment", "pending", "confirmed"].includes(booking.status)) {
      return json({ error: "This booking can no longer be cancelled." }, 409);
    }

    const refundable =
      booking.payment_status === "paid" &&
      Boolean(booking.razorpay_payment_id) &&
      (booking.status === "pending" || msUntilCheckIn(booking.check_in) > 24 * 60 * 60 * 1000);

    let refundId: string | null = null;
    if (refundable) {
      const refund = await razorpayRefund(booking.razorpay_payment_id as string);
      if (!refund.ok) return json({ error: refund.error }, 502);
      refundId = refund.refundId ?? null;
    }

    const { error: updateError } = await serviceClient
      .from("vacation_bookings")
      .update({
        status: "cancelled",
        ...(refundId
          ? { payment_status: "refunded", razorpay_refund_id: refundId, refunded_at: new Date().toISOString() }
          : {}),
      })
      .eq("id", bookingId);
    if (updateError) return json({ error: updateError.message }, 500);

    // The status trigger always sees the service role, so the
    // actor-aware "guest cancelled" message is sent here instead.
    if (booking.status !== "awaiting_payment") {
      await serviceClient.from("notifications").insert({
        user_id: booking.owner_id,
        type: "booking",
        title: "Booking cancelled by guest",
        message: `The guest cancelled their stay (${booking.check_in} to ${booking.check_out}). Those dates are open again.`,
        action_url: "/owner-profile?tab=bookings",
      });
    }

    return json({ success: true, refunded: Boolean(refundId) });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});

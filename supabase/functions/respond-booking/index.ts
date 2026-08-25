// The host's side of a vacation booking, with the refunds that make it
// trustworthy. All four actions run here rather than as client-side
// status updates because three of them move money and the fourth
// (confirm) triggers refunds for the losing overlapping requests:
//
//   confirm  pending   -> confirmed; every other PENDING request that
//                         overlaps the same dates is declined and fully
//                         refunded (the guest paid upfront -- leaving
//                         them pending-and-paid would trap their money).
//   decline  pending   -> declined + full refund (nightly total AND fee).
//   cancel   confirmed -> cancelled + full refund; a host backing out
//                         never keeps guest money, however late it is.
//   no_show  confirmed -> no_show, only after check-in has passed; the
//                         payment stays with the platform/host side.
//
// Requires: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID") ?? "";
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET") ?? "";

interface RespondRequest {
  bookingId?: string;
  action?: string;
}

async function razorpayRefund(paymentId: string): Promise<{ ok: boolean; refundId?: string; error?: string }> {
  const res = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}/refund`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`)}`,
      // Stable per-payment key: a retry after a crash refunds once.
      "Idempotency-Key": paymentId,
    },
    body: "{}",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.id) {
    return { ok: false, error: json?.error?.description || "Razorpay refund failed." };
  }
  return { ok: true, refundId: String(json.id) };
}

// Atomically CLAIM the row BEFORE calling Razorpay, then flip it. The
// claim is a compare-and-set on the refundable state (payment_status
// 'paid', refunded_at still null); a concurrent second refund updates 0
// rows and stops as a no-op, so Razorpay is only ever hit once. If the
// refund itself fails the claim is released so the money is never
// stranded in a refunded-but-not state nobody retries.
async function refundAndMark(
  serviceClient: SupabaseClient,
  booking: { id: string; razorpay_payment_id: string | null; payment_status: string; status: string; razorpay_refund_id?: string | null },
  newStatus: "declined" | "cancelled"
): Promise<{ ok: boolean; error?: string }> {
  const isPaid = booking.payment_status === "paid";
  // A booking 'refunded' WITHOUT a refund id was claimed but the Razorpay
  // call never landed (a crash between the claim commit and Razorpay
  // confirming) -- resume it. The Idempotency-Key refunds at most once even
  // if the original call actually went through.
  const stranded = booking.payment_status === "refunded" && !booking.razorpay_refund_id;

  if ((isPaid || stranded) && booking.razorpay_payment_id) {
    let claimedThisCall = false;
    if (isPaid) {
      const { data: claimed, error: claimError } = await serviceClient
        .from("vacation_bookings")
        .update({
          status: newStatus,
          payment_status: "refunded",
          refunded_at: new Date().toISOString(),
        })
        .eq("id", booking.id)
        .eq("payment_status", "paid")
        .is("refunded_at", null)
        .select("id");
      if (claimError) return { ok: false, error: claimError.message };
      if (!claimed || claimed.length === 0) {
        // A concurrent caller claimed it and will complete the refund; if it
        // crashes, a later retry recovers via the `stranded` branch.
        return { ok: true };
      }
      claimedThisCall = true;
    }
    const refund = await razorpayRefund(booking.razorpay_payment_id);
    if (!refund.ok) {
      // Release only a claim we took this call -- restore the pre-refund
      // state for a retry. A stranded row is left for a human/next retry
      // rather than guessing its pre-claim status.
      if (claimedThisCall) {
        await serviceClient
          .from("vacation_bookings")
          .update({ status: booking.status, payment_status: "paid", refunded_at: null })
          .eq("id", booking.id);
      }
      return { ok: false, error: refund.error };
    }
    const { error } = await serviceClient
      .from("vacation_bookings")
      .update({ status: newStatus, razorpay_refund_id: refund.refundId })
      .eq("id", booking.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }
  // Already fully refunded, or nothing to refund (unpaid) -- just set status.
  const { error } = await serviceClient
    .from("vacation_bookings")
    .update({ status: newStatus })
    .eq("id", booking.id);
  if (error) return { ok: false, error: error.message };
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

    const body: RespondRequest = await req.json().catch(() => ({}));
    const bookingId = String(body.bookingId ?? "");
    const action = String(body.action ?? "");
    if (!bookingId || !["confirm", "decline", "cancel", "no_show"].includes(action)) {
      return json({ error: "bookingId and a valid action are required." }, 400);
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: booking, error: bookingError } = await serviceClient
      .from("vacation_bookings")
      .select("id, listing_id, tenant_id, owner_id, check_in, check_out, status, payment_status, razorpay_payment_id, razorpay_refund_id, total_price")
      .eq("id", bookingId)
      .maybeSingle();
    if (bookingError) return json({ error: bookingError.message }, 500);
    if (!booking || booking.owner_id !== userId) {
      return json({ error: "Booking not found." }, 404);
    }

    if (action === "confirm") {
      if (booking.status !== "pending") return json({ error: "Only a pending request can be confirmed." }, 409);

      const { error: confirmError } = await serviceClient
        .from("vacation_bookings")
        .update({ status: "confirmed" })
        .eq("id", bookingId);
      if (confirmError) {
        // 23P01: the EXCLUDE constraint -- another confirmed booking
        // already covers these dates.
        if (confirmError.code === "23P01") {
          return json({ error: "These dates overlap a booking you already confirmed. Decline this request instead." }, 409);
        }
        return json({ error: confirmError.message }, 500);
      }

      // The losing requests: overlapping, still pending, already paid.
      const { data: losers } = await serviceClient
        .from("vacation_bookings")
        .select("id, razorpay_payment_id, payment_status, status, razorpay_refund_id")
        .eq("listing_id", booking.listing_id)
        .eq("status", "pending")
        .neq("id", bookingId)
        .lt("check_in", booking.check_out)
        .gt("check_out", booking.check_in);

      const refundFailures: string[] = [];
      for (const loser of losers ?? []) {
        const result = await refundAndMark(serviceClient, loser, "declined");
        if (!result.ok) refundFailures.push(loser.id);
      }

      return json({
        success: true,
        declinedOverlapping: (losers ?? []).length - refundFailures.length,
        // Surfaced, not swallowed: these stay pending for a retry.
        refundFailures: refundFailures.length,
      });
    }

    if (action === "decline") {
      if (booking.status !== "pending") return json({ error: "Only a pending request can be declined." }, 409);
      const result = await refundAndMark(serviceClient, booking, "declined");
      if (!result.ok) return json({ error: result.error }, 502);
      return json({ success: true });
    }

    if (action === "cancel") {
      if (booking.status !== "confirmed") return json({ error: "Only a confirmed booking can be cancelled." }, 409);
      const result = await refundAndMark(serviceClient, booking, "cancelled");
      if (!result.ok) return json({ error: result.error }, 502);
      // The status trigger can't know who cancelled (it always sees the
      // service role), so the actor-aware message is sent here.
      await serviceClient.from("notifications").insert({
        user_id: booking.tenant_id,
        type: "booking",
        title: "Booking cancelled by host - full refund issued",
        message: "Your confirmed stay was cancelled by the host. Your payment is being refunded in full.",
        action_url: "/tenant-profile?tab=bookings",
      });
      return json({ success: true });
    }

    // no_show
    if (booking.status !== "confirmed") return json({ error: "Only a confirmed booking can be marked no-show." }, 409);
    const { error: noShowError } = await serviceClient
      .from("vacation_bookings")
      .update({ status: "no_show" })
      .eq("id", bookingId);
    if (noShowError) {
      // The transition trigger rejects no-show before check-in.
      return json({ error: noShowError.message.replace(/^.*?: /, "") }, 409);
    }
    return json({ success: true });
  } catch (err) {
    console.error("respond-booking error:", (err as Error).message);
    return json({ error: "Something went wrong." }, 500);
  }
});

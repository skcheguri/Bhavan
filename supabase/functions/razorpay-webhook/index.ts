// Razorpay webhook: the safety net under every payment in Bhavan.
//
// Until now fulfilment depended entirely on the customer's browser
// surviving the round trip from Razorpay back to the app. If it did not --
// tab closed, phone died, tunnel, a crash on the success screen -- the
// money was taken and nothing was granted, and the only recovery was the
// customer noticing and coming back. This endpoint is Razorpay telling us
// directly, and it does not care what the browser did.
//
// DEPLOY WITH --no-verify-jwt. Razorpay sends no Supabase JWT, so with the
// default gateway check every delivery is rejected before this code runs,
// and it looks exactly like Razorpay never calling. The signature below is
// the authentication; the JWT gate would only be in its way.
//
// Requires RAZORPAY_WEBHOOK_SECRET -- the secret from the webhook
// configuration in the Razorpay dashboard, NOT RAZORPAY_KEY_SECRET. They
// are different values and using the key secret rejects every legitimate
// delivery.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyRazorpayWebhookSignature } from "../../../src/lib/payments/razorpaySignature.ts";

const WEBHOOK_SECRET = Deno.env.get("RAZORPAY_WEBHOOK_SECRET") ?? "";

// Events that mean money has moved (or failed to). order.paid is
// deliberately not handled: it fires alongside payment.captured for the
// same order, and handling both would be two deliveries racing to fulfil
// one purchase. refund.processed reconciles dashboard-issued refunds.
// payment.failed is what finally WRITES status='failed' -- until this,
// nothing did, so the retry/failed UX in the app was dead code (a failed
// payment just left a pending row forever). Razorpay allows retrying the
// same order, so the fulfilment claims below accept a 'failed' row too.
const HANDLED = new Set(["payment.captured", "payment.failed", "refund.processed"]);

interface Fulfilment {
  target: string;
  status: "processed" | "ignored" | "failed";
  error?: string;
}

Deno.serve(async (req) => {
  // No CORS headers anywhere in this file on purpose. This endpoint is
  // called server-to-server by Razorpay; a browser has no business here,
  // and advertising otherwise only invites people to try.
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!WEBHOOK_SECRET) {
    // 500 rather than 501: Razorpay retries on 5xx, so once the secret is
    // configured the deliveries that arrived meanwhile are replayed
    // instead of being lost.
    console.error("RAZORPAY_WEBHOOK_SECRET is not set");
    return new Response("Webhook not configured", { status: 500 });
  }

  // The exact bytes, before any parsing. Re-serialising a parsed object
  // changes key order and whitespace and therefore the digest.
  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature") ?? "";

  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const signatureOk = await verifyRazorpayWebhookSignature(WEBHOOK_SECRET, rawBody, signature);
  if (!signatureOk) {
    // Record ONE row per hour, whatever the volume.
    //
    // Originally this recorded nothing, so that nobody could flood the
    // table by POSTing garbage. That was right about the flooding and
    // wrong about everything else: a mismatched secret -- the single most
    // likely misconfiguration -- became invisible, and "no rows" meant
    // both "Razorpay never called" and "Razorpay called and we rejected
    // it". Those need completely different fixes.
    //
    // The hour-stamped event_id is what keeps both properties: the unique
    // constraint collapses any number of rejected deliveries into one row,
    // so the table can never grow faster than 24 rows a day, and the
    // question "did anything reach us?" is answerable again.
    const hourKey = `unverified:${new Date().toISOString().slice(0, 13)}`;
    await serviceClient
      .from("razorpay_webhook_events")
      .insert({
        event_id: hourKey,
        event_type: "signature.rejected",
        target: "unauthenticated",
        status: "failed",
        error:
          "A delivery arrived but its signature did not verify. If this is Razorpay, " +
          "RAZORPAY_WEBHOOK_SECRET does not match the secret set on the webhook.",
      })
      // A second rejection in the same hour is the same fact; nothing to add.
      .then(() => undefined, () => undefined);

    // 401 and no detail. An unauthenticated caller learns nothing from
    // the response itself.
    return new Response("Invalid signature", { status: 401 });
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("Malformed payload", { status: 400 });
  }

  const eventType = String(event.event ?? "");
  // Razorpay's per-delivery id. Falling back to the payment id keeps the
  // ledger keyed on something stable if the header is ever absent.
  const payment =
    ((event.payload as Record<string, Record<string, Record<string, unknown>>>)?.payment?.entity) ??
    {};
  const paymentId = String(payment.id ?? "");
  const orderId = String(payment.order_id ?? "");
  const eventId = req.headers.get("x-razorpay-event-id") ?? `${eventType}:${paymentId}`;

  // Claim this event. The insert IS the idempotency check: two concurrent
  // deliveries of the same event both see "not processed" if we read
  // first, so one of them has to lose a unique constraint instead.
  const { error: claimError } = await serviceClient
    .from("razorpay_webhook_events")
    .insert({
      event_id: eventId,
      event_type: eventType,
      order_id: orderId || null,
      payment_id: paymentId || null,
      status: "received",
      payload: event,
    });

  if (claimError) {
    if (claimError.code === "23505") {
      // Already seen. 200 so Razorpay stops retrying.
      return new Response(JSON.stringify({ ok: true, duplicate: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    console.error("Could not record webhook event:", claimError.message);
    // 500 so it is retried -- losing the ledger row means losing the
    // ability to fulfil safely.
    return new Response("Could not record event", { status: 500 });
  }

  const finish = async (result: Fulfilment) => {
    await serviceClient
      .from("razorpay_webhook_events")
      .update({
        target: result.target,
        status: result.status,
        error: result.error ?? null,
        processed_at: new Date().toISOString(),
      })
      .eq("event_id", eventId);

    // Always 200 once the event is recorded, even for `failed`. Razorpay
    // retrying will not fix a fulfilment bug, and the row is now a durable
    // record someone can act on. Retries would just bury it.
    return new Response(JSON.stringify({ ok: true, ...result }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  if (!HANDLED.has(eventType)) {
    return finish({ target: "none", status: "ignored" });
  }

  if (eventType === "refund.processed") {
    return finish(await reconcileRefund(serviceClient, event, paymentId));
  }

  if (!orderId) {
    return finish({ target: "none", status: "ignored", error: "No order id on this payment." });
  }

  if (eventType === "payment.failed") {
    return finish(await markPaymentFailed(serviceClient, orderId, payment));
  }

  try {
    // Route by our own records rather than by the order's notes. Notes are
    // set at order creation and are not authoritative; a row in our
    // database that references this order id is.
    const { data: invoice } = await serviceClient
      .from("billing_history")
      .select("id, owner_id, community_id, plan, status, razorpay_payment_id")
      .eq("razorpay_order_id", orderId)
      .maybeSingle();

    if (invoice) {
      return finish(
        invoice.community_id
          ? await fulfilSociety(serviceClient, invoice, paymentId)
          : await fulfilPro(serviceClient, invoice, paymentId)
      );
    }

    const { data: rent } = await serviceClient
      .from("rent_payments")
      .select("id, status")
      .eq("razorpay_order_id", orderId)
      .maybeSingle();

    if (rent) return finish(await fulfilRent(serviceClient, rent, paymentId));

    const { data: booking } = await serviceClient
      .from("vacation_bookings")
      .select("id, status, payment_status")
      .eq("razorpay_order_id", orderId)
      .maybeSingle();

    if (booking) return finish(await fulfilBooking(serviceClient, booking, paymentId));

    // A captured payment we cannot place. Worth recording loudly: it means
    // either an order created outside this app, or a row that went missing.
    return finish({
      target: "unknown",
      status: "failed",
      error: `No invoice, rent payment, or booking references order ${orderId}.`,
    });
  } catch (err) {
    return finish({ target: "unknown", status: "failed", error: (err as Error).message });
  }
});

/* ------------------------------------------------------------------ */
/* Fulfilment                                                          */
/*                                                                     */
/* These repeat what the verify-* functions do on the browser path.     */
/* Both paths can run for the same purchase -- whoever gets there first */
/* wins the compare-and-set below and the other becomes a no-op, which  */
/* is exactly the property that makes having two paths safe.            */
/* ------------------------------------------------------------------ */

const MONTHS: Record<string, number> = {
  pro_monthly: 1,
  pro_annual: 12,
  society_annual: 12,
};

/** Marks the invoice paid. Returns false if someone else already did. */
async function claimInvoice(
  client: ReturnType<typeof createClient>,
  invoiceId: string,
  paymentId: string
): Promise<boolean> {
  const { data: claimed } = await client
    .from("billing_history")
    .update({
      status: "paid",
      razorpay_payment_id: paymentId,
      paid_at: new Date().toISOString(),
    })
    .eq("id", invoiceId)
    // pending OR failed: Razorpay allows retrying a failed order, and a
    // successful retry's payment.captured must still be able to fulfil a
    // row a prior payment.failed marked failed.
    .in("status", ["pending", "failed"])
    .select("id");
  return !!claimed && claimed.length > 0;
}

/** Extends from the existing end when still active, so early renewal loses nothing. */
function periodEndFrom(existingEnd: string | null, active: boolean, months: number): Date {
  const now = new Date();
  const end = existingEnd ? new Date(existingEnd) : null;
  const from = active && end && end > now ? end : now;
  const result = new Date(from);
  result.setMonth(result.getMonth() + months);
  return result;
}

async function fulfilPro(
  client: ReturnType<typeof createClient>,
  invoice: Record<string, string | null>,
  paymentId: string
): Promise<Fulfilment> {
  const months = MONTHS[String(invoice.plan)];
  if (!months) return { target: "pro", status: "failed", error: `Unknown plan ${invoice.plan}` };

  if (!(await claimInvoice(client, String(invoice.id), paymentId))) {
    // The browser path already finished this one.
    return { target: "pro", status: "ignored", error: "Already fulfilled." };
  }

  const { data: sub } = await client
    .from("owner_subscriptions")
    .select("status, current_period_end")
    .eq("owner_id", invoice.owner_id)
    .maybeSingle();

  const now = new Date();
  const end = periodEndFrom(
    (sub?.current_period_end as string) ?? null,
    sub?.status === "active",
    months
  );

  const { error } = await client.from("owner_subscriptions").upsert(
    {
      owner_id: invoice.owner_id,
      plan: invoice.plan,
      status: "active",
      current_period_start: now.toISOString(),
      current_period_end: end.toISOString(),
      cancel_at_period_end: false,
      updated_at: now.toISOString(),
    },
    { onConflict: "owner_id" }
  );
  if (error) return { target: "pro", status: "failed", error: error.message };

  return { target: "pro", status: "processed" };
}

async function fulfilSociety(
  client: ReturnType<typeof createClient>,
  invoice: Record<string, string | null>,
  paymentId: string
): Promise<Fulfilment> {
  const months = MONTHS[String(invoice.plan)];
  if (!months) return { target: "society", status: "failed", error: `Unknown plan ${invoice.plan}` };

  if (!(await claimInvoice(client, String(invoice.id), paymentId))) {
    return { target: "society", status: "ignored", error: "Already fulfilled." };
  }

  const { data: sub } = await client
    .from("community_subscriptions")
    .select("status, current_period_end")
    .eq("community_id", invoice.community_id)
    .maybeSingle();

  const now = new Date();
  const end = periodEndFrom(
    (sub?.current_period_end as string) ?? null,
    sub?.status === "active",
    months
  );

  const { count } = await client
    .from("community_members")
    .select("id", { count: "exact", head: true })
    .eq("community_id", invoice.community_id)
    .eq("status", "approved");

  const { error } = await client.from("community_subscriptions").upsert(
    {
      community_id: invoice.community_id,
      plan: "standard",
      status: "active",
      purchased_by: invoice.owner_id,
      unit_count: count ?? null,
      current_period_start: now.toISOString(),
      current_period_end: end.toISOString(),
      updated_at: now.toISOString(),
    },
    { onConflict: "community_id" }
  );
  if (error) return { target: "society", status: "failed", error: error.message };

  // Best effort. A failed notification must not mark a paid purchase failed.
  try {
    const { data: members } = await client
      .from("community_members")
      .select("user_id")
      .eq("community_id", invoice.community_id)
      .eq("status", "approved");
    if (members?.length) {
      await client.from("notifications").insert(
        members.map((m: { user_id: string }) => ({
          user_id: m.user_id,
          type: "platform",
          title: "Your society plan is active",
          message: "Maintenance issues can now be raised by every owner here.",
          action_url: "/society",
        }))
      );
    }
  } catch (err) {
    console.warn("society activation notification failed:", (err as Error).message);
  }

  return { target: "society", status: "processed" };
}

// The single writer of status='failed'. Marks the pending row for this
// order failed so the app's retry/failed UX has something to show. Keyed
// on order_id and gated on status='pending' -- if the row is already
// paid (a captured event beat this) or failed (an earlier attempt) we
// leave it. Razorpay lets the same order be retried, so a later
// payment.captured for this order still fulfils it (the claims below
// accept a 'failed' row).
async function markPaymentFailed(
  client: ReturnType<typeof createClient>,
  orderId: string,
  payment: Record<string, unknown>
): Promise<Fulfilment> {
  const reason = String(payment.error_description ?? payment.error_reason ?? "Payment failed at the bank/gateway.");
  const now = new Date().toISOString();

  const inv = await client.from("billing_history").update({ status: "failed" })
    .eq("razorpay_order_id", orderId).eq("status", "pending").select("id");
  if (inv.data && inv.data.length > 0) return { target: "billing", status: "processed", error: reason };

  const rent = await client.from("rent_payments").update({ status: "failed", failure_reason: reason, updated_at: now })
    .eq("razorpay_order_id", orderId).eq("status", "pending").select("id");
  if (rent.data && rent.data.length > 0) return { target: "rent", status: "processed", error: reason };

  // Bookings model a failed payment as an abandoned awaiting_payment row
  // (create-booking-order cleans those up), so nothing to mark here.
  return { target: "none", status: "ignored", error: `No pending payment for order ${orderId}.` };
}

// A refund landed -- from the in-app refund-payment function or straight
// from the Razorpay dashboard. Find whichever record the payment belongs
// to and mark it refunded. Idempotent: the compare on razorpay_refund_id
// / status means a second delivery, or one that races the in-app path,
// is a no-op. Payments live in three tables; the refund id is on the
// refund entity, the link back is the payment id.
async function reconcileRefund(
  client: ReturnType<typeof createClient>,
  event: Record<string, unknown>,
  paymentId: string
): Promise<Fulfilment> {
  const refund =
    ((event.payload as Record<string, Record<string, Record<string, unknown>>>)?.refund?.entity) ?? {};
  const refundId = String(refund.id ?? "");
  if (!paymentId) {
    return { target: "refund", status: "ignored", error: "Refund event carried no payment id." };
  }

  const now = new Date().toISOString();

  // billing_history (Pro / society) and rent_payments both key on
  // razorpay_payment_id; vacation_bookings does too. Mark the first that
  // matches and isn't already refunded.
  const patch = { status: "refunded", razorpay_refund_id: refundId, refunded_at: now };

  const inv = await client.from("billing_history").update(patch)
    .eq("razorpay_payment_id", paymentId).neq("status", "refunded").select("id, community_id, owner_id");
  if (inv.data && inv.data.length > 0) {
    const row = inv.data[0] as { community_id: string | null; owner_id: string | null };
    if (row.community_id) {
      await client.from("community_subscriptions").update({ status: "cancelled", updated_at: now }).eq("community_id", row.community_id);
    } else if (row.owner_id) {
      await client.from("owner_subscriptions").update({ status: "cancelled", cancel_at_period_end: true, updated_at: now }).eq("owner_id", row.owner_id);
    }
    return { target: "refund:pro", status: "processed" };
  }

  const rent = await client.from("rent_payments").update(patch)
    .eq("razorpay_payment_id", paymentId).neq("status", "refunded").select("id");
  if (rent.data && rent.data.length > 0) return { target: "refund:rent", status: "processed" };

  const booking = await client.from("vacation_bookings")
    .update({ payment_status: "refunded", razorpay_refund_id: refundId, refunded_at: now })
    .eq("razorpay_payment_id", paymentId).neq("payment_status", "refunded").select("id");
  if (booking.data && booking.data.length > 0) return { target: "refund:booking", status: "processed" };

  // Already reconciled (in-app path or an earlier delivery), or a payment
  // we don't have. Either way nothing more to do.
  return { target: "refund", status: "ignored", error: `No unrefunded record for payment ${paymentId}.` };
}

// Promotes a paid vacation booking from `awaiting_payment` to `pending`,
// exactly what verify-booking-payment does on the browser path. Without
// this branch a booking whose browser never returned from Checkout was
// captured-but-never-promoted, and create-booking-order's hourly sweep of
// stale awaiting_payment rows would then DELETE it -- money taken, request
// gone. The compare-and-set on status makes the browser path (if it won
// the race) and any re-delivery no-ops, and the status change fires the
// migration-126 trigger that notifies the host, same as the browser path.
async function fulfilBooking(
  client: ReturnType<typeof createClient>,
  booking: Record<string, string | null>,
  paymentId: string
): Promise<Fulfilment> {
  const { data: claimed, error } = await client
    .from("vacation_bookings")
    .update({
      status: "pending",
      payment_status: "paid",
      razorpay_payment_id: paymentId,
      paid_at: new Date().toISOString(),
    })
    .eq("id", booking.id)
    .eq("status", "awaiting_payment")
    .neq("payment_status", "paid")
    .select("id");

  if (error) return { target: "booking", status: "failed", error: error.message };
  if (!claimed || claimed.length === 0) {
    // The browser path already promoted it, or this is a re-delivery.
    return { target: "booking", status: "ignored", error: "Already promoted." };
  }
  return { target: "booking", status: "processed" };
}

async function fulfilRent(
  client: ReturnType<typeof createClient>,
  rent: Record<string, string | null>,
  paymentId: string
): Promise<Fulfilment> {
  const { data: claimed, error } = await client
    .from("rent_payments")
    .update({
      status: "paid",
      razorpay_payment_id: paymentId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", rent.id)
    // Only a genuinely unpaid row is a claim target. neq('paid') also
    // matched 'refunded' and 'reconciled', so a late capture could resurrect
    // a refunded rent payment or un-reconcile a settled one. Mirror
    // claimInvoice's scoping.
    .in("status", ["pending", "failed"])
    .select("id");

  if (error) return { target: "rent", status: "failed", error: error.message };
  if (!claimed || claimed.length === 0) {
    return { target: "rent", status: "ignored", error: "Already marked paid." };
  }
  return { target: "rent", status: "processed" };
}

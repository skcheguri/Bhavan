// Creates a Razorpay Order for an upfront vacation-booking payment and a
// matching `awaiting_payment` row in vacation_bookings.
//
// The amount is derived SERVER-SIDE from the listing's nightly price
// (nights x price + 5% platform fee) -- never trusted from the request
// body. Availability, guest capacity, duplicate requests, the
// 3-upcoming-bookings cap and the rate limit are all checked here first
// for friendly errors, and enforced again by the BEFORE INSERT trigger
// (migration 126) so a direct API caller meets the same wall.
//
// Requires the same secrets as the rent-payment functions:
//   RAZORPAY_KEY_ID
//   RAZORPAY_KEY_SECRET

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RAZORPAY_KEY_ID = Deno.env.get("RAZORPAY_KEY_ID") ?? "";
const RAZORPAY_KEY_SECRET = Deno.env.get("RAZORPAY_KEY_SECRET") ?? "";

const SERVICE_FEE_RATE = 0.05;
const MAX_NIGHTS = 90;

interface OrderRequest {
  listingId?: string;
  checkIn?: string;
  checkOut?: string;
  guestCount?: number;
}

function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s + "T00:00:00Z").getTime());
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

    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData?.user) return json({ error: "Not authenticated" }, 401);
    const userId = userData.user.id;

    const body: OrderRequest = await req.json().catch(() => ({}));
    const listingId = String(body.listingId ?? "");
    const checkIn = String(body.checkIn ?? "");
    const checkOut = String(body.checkOut ?? "");
    const guestCount = Number(body.guestCount ?? 0);

    if (!listingId || !isIsoDate(checkIn) || !isIsoDate(checkOut) || !Number.isInteger(guestCount)) {
      return json({ error: "listingId, checkIn, checkOut and guestCount are required." }, 400);
    }

    // Service role: bookings have no anon/authenticated write grants at
    // all (migration 126), and availability checks must see every row.
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: listing, error: listingError } = await serviceClient
      .from("listings")
      .select("id, owner_id, title, price, category, status, max_guests")
      .eq("id", listingId)
      .maybeSingle();
    if (listingError) return json({ error: listingError.message }, 500);
    if (!listing || listing.category !== "vacation" || listing.status !== "active") {
      return json({ error: "This property is not accepting bookings." }, 404);
    }
    if (listing.owner_id === userId) {
      return json({ error: "You cannot book your own property." }, 400);
    }

    const today = new Date().toISOString().slice(0, 10);
    if (checkIn < today) return json({ error: "Check-in cannot be in the past." }, 400);
    const nights = Math.round(
      (new Date(checkOut + "T00:00:00Z").getTime() - new Date(checkIn + "T00:00:00Z").getTime()) / 86_400_000
    );
    if (nights < 1) return json({ error: "Check-out must be after check-in." }, 400);
    if (nights > MAX_NIGHTS) return json({ error: `Stays are limited to ${MAX_NIGHTS} nights.` }, 400);

    const maxGuests = listing.max_guests ?? 4;
    if (guestCount < 1 || guestCount > maxGuests) {
      return json({ error: `This property hosts between 1 and ${maxGuests} guests.` }, 400);
    }

    // Friendly pre-checks (the DB re-enforces all of these).
    const { data: clash } = await serviceClient
      .from("vacation_bookings")
      .select("id")
      .eq("listing_id", listingId)
      .eq("status", "confirmed")
      .lt("check_in", checkOut)
      .gt("check_out", checkIn)
      .limit(1)
      .maybeSingle();
    if (clash) return json({ error: "Those dates were just booked by someone else. Please choose different dates." }, 409);

    // Abandoned checkouts leave unpaid awaiting_payment rows behind;
    // clear the caller's stale ones so they never accumulate.
    await serviceClient
      .from("vacation_bookings")
      .delete()
      .eq("tenant_id", userId)
      .eq("status", "awaiting_payment")
      .lt("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());

    const baseAmount = nights * Number(listing.price);
    const serviceFee = Math.round(baseAmount * SERVICE_FEE_RATE);
    const totalPrice = baseAmount + serviceFee;
    const amountPaise = totalPrice * 100;
    if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
      return json({ error: "This listing has no valid nightly price set." }, 400);
    }

    // Re-clicking "Pay" after closing Checkout resumes the same order
    // instead of piling up rows (Razorpay orders don't expire).
    const { data: existing } = await serviceClient
      .from("vacation_bookings")
      .select("id, razorpay_order_id, total_price")
      .eq("tenant_id", userId)
      .eq("listing_id", listingId)
      .eq("check_in", checkIn)
      .eq("check_out", checkOut)
      .eq("guest_count", guestCount)
      .eq("status", "awaiting_payment")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.razorpay_order_id && existing.total_price === totalPrice) {
      return json({
        bookingId: existing.id,
        orderId: existing.razorpay_order_id,
        amount: amountPaise,
        currency: "INR",
        keyId: RAZORPAY_KEY_ID,
        tenantName: userData.user.user_metadata?.name ?? userData.user.email ?? "Guest",
        tenantEmail: userData.user.email ?? "",
      });
    }

    const { data: bookingRow, error: insertError } = await serviceClient
      .from("vacation_bookings")
      .insert({
        listing_id: listingId,
        tenant_id: userId,
        owner_id: listing.owner_id,
        check_in: checkIn,
        check_out: checkOut,
        guest_count: guestCount,
        base_amount: baseAmount,
        service_fee: serviceFee,
        total_price: totalPrice,
        status: "awaiting_payment",
        payment_status: "unpaid",
      })
      .select("id")
      .single();
    if (insertError) {
      // Trigger errors (rate limit, caps, duplicates) carry the message
      // the user should see.
      return json({ error: insertError.message.replace(/^.*?: /, "") }, 400);
    }

    const receipt = `vb_${String(bookingRow.id).slice(0, 8)}_${Date.now()}`;
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
          booking_id: bookingRow.id,
          listing_id: listingId,
          tenant_id: userId,
          owner_id: listing.owner_id,
          check_in: checkIn,
          check_out: checkOut,
        },
      }),
    });
    const order = await orderRes.json().catch(() => ({}));
    if (!orderRes.ok || !order?.id) {
      await serviceClient.from("vacation_bookings").delete().eq("id", bookingRow.id);
      return json({ error: order?.error?.description || "Razorpay could not create this order." }, 502);
    }

    await serviceClient
      .from("vacation_bookings")
      .update({ razorpay_order_id: order.id })
      .eq("id", bookingRow.id);

    return json({
      bookingId: bookingRow.id,
      orderId: order.id,
      amount: amountPaise,
      currency: "INR",
      keyId: RAZORPAY_KEY_ID,
      tenantName: userData.user.user_metadata?.name ?? userData.user.email ?? "Guest",
      tenantEmail: userData.user.email ?? "",
    });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});

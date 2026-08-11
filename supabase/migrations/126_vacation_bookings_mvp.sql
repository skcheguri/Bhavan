-- ============================================================
-- Vacation bookings: from submit-and-forget dead end to a paid
-- request/confirm flow (audit finding: feature at 35%, in MVP scope).
--
-- Product decisions this encodes (2026-08-11):
--   * Guests pay UPFRONT through Razorpay when requesting: nightly total
--     plus a real 5% platform fee (the fee the UI used to display but
--     never charge). Money is collected into the platform account; host
--     payouts are manual for MVP (Razorpay Route is post-MVP).
--   * Refunds are automatic and full when: the host declines, the host
--     cancels a confirmed stay, or the guest cancels an unconfirmed
--     request at any time / a confirmed stay more than 24 hours before
--     check-in. Cancelling inside the final 24 hours forfeits payment.
--   * FREE tier hosts one active vacation listing; Pro hosts many
--     (featured placement / calendar tools are a Pro follow-up).
--
-- Money movement lives in edge functions (create-booking-order,
-- verify-booking-payment, respond-booking, cancel-booking) because only
-- they hold the Razorpay secret. Consequently ALL status changes flow
-- through the service role, and the browser gets no direct write path:
-- the old INSERT/UPDATE policies -- which let a tenant self-confirm a
-- booking and let an owner rewrite dates and price after the fact --
-- are dropped outright.
--
-- Also closes a baseline reproducibility gap found on the way: the
-- btree_gist EXCLUDE constraint from archived migration 018 (the thing
-- that makes double-booking impossible) exists in production but was
-- never captured in 001_baseline.sql.
-- ============================================================

-- ---- 0. Double-booking guard (baseline gap; no-op in production) ----
CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'vacation_bookings' AND c.contype = 'x'
  ) THEN
    ALTER TABLE vacation_bookings
      ADD CONSTRAINT vacation_bookings_confirmed_no_overlap
      EXCLUDE USING gist (
        listing_id WITH =,
        daterange(check_in, check_out) WITH &&
      ) WHERE (status = 'confirmed');
  END IF;
END $$;

-- ---- 1. Schema: payment fields, new statuses, guest capacity ----
-- total_price remains the grand total actually charged; base_amount and
-- service_fee record its split for receipts and refunds.
ALTER TABLE vacation_bookings
  ADD COLUMN IF NOT EXISTS base_amount integer,
  ADD COLUMN IF NOT EXISTS service_fee integer,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS razorpay_order_id text,
  ADD COLUMN IF NOT EXISTS razorpay_payment_id text,
  ADD COLUMN IF NOT EXISTS razorpay_refund_id text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz;

ALTER TABLE vacation_bookings DROP CONSTRAINT IF EXISTS vacation_bookings_payment_status_check;
ALTER TABLE vacation_bookings ADD CONSTRAINT vacation_bookings_payment_status_check
  CHECK (payment_status = ANY (ARRAY['unpaid'::text, 'paid'::text, 'refunded'::text]));

-- awaiting_payment: row exists, Razorpay order created, money not yet
-- verified. Never shown to owners and never blocks dates. no_show: the
-- guest paid and never arrived (host keeps the payment).
ALTER TABLE vacation_bookings DROP CONSTRAINT IF EXISTS vacation_bookings_status_check;
ALTER TABLE vacation_bookings ADD CONSTRAINT vacation_bookings_status_check
  CHECK (status = ANY (ARRAY['awaiting_payment'::text, 'pending'::text, 'confirmed'::text, 'declined'::text, 'cancelled'::text, 'no_show'::text]));

ALTER TABLE listings ADD COLUMN IF NOT EXISTS max_guests integer
  CHECK (max_guests IS NULL OR (max_guests >= 1 AND max_guests <= 50));

CREATE INDEX IF NOT EXISTS idx_vacation_bookings_order ON vacation_bookings (razorpay_order_id);

-- ---- 2. The browser loses its direct write path ----
DROP POLICY IF EXISTS "Tenant can create own booking request" ON vacation_bookings;
DROP POLICY IF EXISTS "Owner can update status on own listings" ON vacation_bookings;
DROP POLICY IF EXISTS "Tenant can cancel own booking" ON vacation_bookings;
REVOKE INSERT, UPDATE, DELETE ON vacation_bookings FROM anon, authenticated;

-- ---- 3. Transition + integrity guard ----
-- Even the service role must follow the state machine -- a bug in an
-- edge function should fail loudly here, not corrupt a booking. The
-- service role and admins are the only writers left (section 2), so
-- auth.uid() IS NULL means the service role.
CREATE OR REPLACE FUNCTION enforce_vacation_booking_transitions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.listing_id IS DISTINCT FROM OLD.listing_id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
     OR NEW.check_in IS DISTINCT FROM OLD.check_in
     OR NEW.check_out IS DISTINCT FROM OLD.check_out
     OR NEW.guest_count IS DISTINCT FROM OLD.guest_count
     OR NEW.total_price IS DISTINCT FROM OLD.total_price
     OR NEW.base_amount IS DISTINCT FROM OLD.base_amount
     OR NEW.service_fee IS DISTINCT FROM OLD.service_fee
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Booking terms are immutable after creation.';
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NOT NULL AND NOT is_admin() THEN
    RAISE EXCEPTION 'Booking status changes go through the booking endpoints.';
  END IF;

  IF (OLD.status = 'awaiting_payment' AND NEW.status IN ('pending', 'cancelled'))
     OR (OLD.status = 'pending' AND NEW.status IN ('confirmed', 'declined', 'cancelled'))
     OR (OLD.status = 'confirmed' AND NEW.status = 'cancelled')
     OR (OLD.status = 'confirmed' AND NEW.status = 'no_show' AND OLD.check_in <= CURRENT_DATE) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Booking cannot move from % to %.', OLD.status, NEW.status;
END;
$$;

DROP TRIGGER IF EXISTS trg_vacation_bookings_transitions ON vacation_bookings;
CREATE TRIGGER trg_vacation_bookings_transitions
  BEFORE UPDATE ON vacation_bookings
  FOR EACH ROW EXECUTE FUNCTION enforce_vacation_booking_transitions();

-- ---- 4. Request rules (defense in depth behind create-booking-order) ----
CREATE OR REPLACE FUNCTION enforce_vacation_booking_request_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active integer;
  v_max_guests integer;
BEGIN
  IF is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM 'awaiting_payment' OR NEW.payment_status IS DISTINCT FROM 'unpaid' THEN
    RAISE EXCEPTION 'A new booking starts unpaid, awaiting payment.';
  END IF;

  IF NEW.check_in < CURRENT_DATE THEN
    RAISE EXCEPTION 'Check-in cannot be in the past.';
  END IF;

  SELECT COALESCE(l.max_guests, 4) INTO v_max_guests
  FROM listings l WHERE l.id = NEW.listing_id;
  IF NEW.guest_count < 1 OR NEW.guest_count > v_max_guests THEN
    RAISE EXCEPTION 'This property hosts between 1 and % guests.', v_max_guests;
  END IF;

  -- One account cannot blanket-reserve the map. awaiting_payment rows
  -- are excluded: they hold no money and expire.
  SELECT count(*) INTO v_active FROM vacation_bookings
  WHERE tenant_id = NEW.tenant_id
    AND status IN ('pending', 'confirmed')
    AND check_out >= CURRENT_DATE;
  IF v_active >= 3 THEN
    RAISE EXCEPTION 'You already have 3 upcoming bookings or requests. Cancel one before requesting another stay.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM vacation_bookings
    WHERE tenant_id = NEW.tenant_id
      AND listing_id = NEW.listing_id
      AND status IN ('pending', 'confirmed')
      AND daterange(check_in, check_out) && daterange(NEW.check_in, NEW.check_out)
  ) THEN
    RAISE EXCEPTION 'You already have a request for these dates at this property.';
  END IF;

  -- 5 payment attempts per day, 15 per week, server-enforced.
  PERFORM check_and_record_rate_limit(NEW.tenant_id, NULL, 'vacation_booking', 5, 15);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vacation_bookings_request_rules ON vacation_bookings;
CREATE TRIGGER trg_vacation_bookings_request_rules
  BEFORE INSERT ON vacation_bookings
  FOR EACH ROW EXECUTE FUNCTION enforce_vacation_booking_request_rules();

-- ---- 5. Notifications ----
-- The old success screen promised a confirmation email; no email system
-- exists. These feed the real notification center + push pipeline (065).
-- Cancellation notifications are NOT sent here: by the time a cancel
-- reaches the database the actor is always the service role, so the
-- cancel endpoints (which know who asked) send the actor-aware message.
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY[
    'maintenance'::text, 'inquiry'::text, 'message'::text,
    'lease'::text, 'payment'::text, 'platform'::text, 'booking'::text
  ]));

CREATE OR REPLACE FUNCTION notify_vacation_booking_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title text;
  v_dates text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT title INTO v_title FROM listings WHERE id = NEW.listing_id;
    v_title := COALESCE(v_title, 'your property');
    v_dates := to_char(NEW.check_in, 'DD Mon') || ' - ' || to_char(NEW.check_out, 'DD Mon');

    IF NEW.status = 'pending' AND OLD.status = 'awaiting_payment' THEN
      -- Payment verified: the request becomes real and the host hears
      -- about it. Guests paid upfront, so respond promptly.
      INSERT INTO notifications (user_id, type, title, message, action_url)
      VALUES (NEW.owner_id, 'booking', 'New booking request (paid)',
              'A guest paid Rs. ' || (NEW.total_price)::text || ' for ' || v_dates || ' at ' || v_title || '. Confirm or decline it.',
              '/owner-profile?tab=bookings');
    ELSIF NEW.status = 'confirmed' THEN
      INSERT INTO notifications (user_id, type, title, message, action_url)
      VALUES (NEW.tenant_id, 'booking', 'Booking confirmed',
              'Your stay at ' || v_title || ' (' || v_dates || ') is confirmed. Free cancellation until 24 hours before check-in.',
              '/tenant-profile?tab=bookings');
    ELSIF NEW.status = 'declined' THEN
      INSERT INTO notifications (user_id, type, title, message, action_url)
      VALUES (NEW.tenant_id, 'booking', 'Booking declined - full refund issued',
              'The host declined your request for ' || v_title || ' (' || v_dates || '). Your payment is being refunded in full.',
              '/tenant-profile?tab=bookings');
    ELSIF NEW.status = 'no_show' THEN
      INSERT INTO notifications (user_id, type, title, message, action_url)
      VALUES (NEW.tenant_id, 'booking', 'Marked as no-show',
              'The host reported you did not arrive for your stay at ' || v_title || ' (' || v_dates || ').',
              '/tenant-profile?tab=bookings');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'booking status notification failed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vacation_bookings_notify_status ON vacation_bookings;
CREATE TRIGGER trg_vacation_bookings_notify_status
  AFTER UPDATE OF status ON vacation_bookings
  FOR EACH ROW EXECUTE FUNCTION notify_vacation_booking_status();

-- ---- 6. Free tier hosts one active vacation listing ----
-- Monetization: vacation hosting scales with Pro. Existing owners with
-- several active vacation listings keep them (only new activations are
-- checked); has_pro() is the single authority, per its own comment.
CREATE OR REPLACE FUNCTION enforce_vacation_listing_tier()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.category = 'vacation' AND NEW.status = 'active'
     AND (TG_OP = 'INSERT' OR OLD.status <> 'active' OR OLD.category <> 'vacation') THEN
    IF NOT has_pro(NEW.owner_id) THEN
      SELECT count(*) INTO v_count FROM listings
      WHERE owner_id = NEW.owner_id
        AND category = 'vacation'
        AND status = 'active'
        AND id <> NEW.id;
      IF v_count >= 1 THEN
        RAISE EXCEPTION 'The free plan hosts one active vacation listing. Upgrade to Pro to host more.';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_listings_vacation_tier ON listings;
CREATE TRIGGER trg_listings_vacation_tier
  BEFORE INSERT OR UPDATE OF status, category ON listings
  FOR EACH ROW EXECUTE FUNCTION enforce_vacation_listing_tier();

-- ============================================================
-- Host payouts, stage 1 of 2 (2026-08-11).
--
-- Guests pay upfront into the platform Razorpay account; hosts are paid
-- out manually until Razorpay Route is approved. Stage 1 makes that
-- trustworthy by making it VISIBLE instead of "trust us":
--
--   * hosts register where their money should go (UPI or bank account),
--   * every retained booking payment carries a payout status the host
--     can see ("on the way" -> "sent on <date>"),
--   * admins get a due-payouts queue showing the amount owed and the
--     host's payout account side by side, and a mark-paid RPC that
--     stamps the reference and notifies the host.
--
-- Stage 2 (Razorpay Route) replaces the manual transfer with automatic
-- splits; this table then maps hosts to their linked accounts and the
-- status updates from webhooks instead of the admin queue.
--
-- The host is OWED base_amount (nightly total); the platform keeps
-- service_fee. A payout becomes automatically due when the stay
-- actually happened for the host: it completed, or the guest no-showed
-- after the host held the dates.
--
-- FORFEITS are different by decision (2026-08-11): when a guest
-- late-cancels inside 24 hours of check-in, the retained payment
-- defaults to the PLATFORM, and an admin decides each case -- release
-- it to the host (they held the dates and may have turned others away)
-- or keep it. Those bookings appear in the admin queue as a decision,
-- not a debt, and the host UI promises nothing for them unless the
-- release actually happens.
-- ============================================================

-- ---- 1. Where the host's money goes ----
CREATE TABLE host_payout_accounts (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    method text NOT NULL CHECK (method IN ('upi', 'bank')),
    upi_id text CHECK (upi_id IS NULL OR (upi_id ~ '^[a-zA-Z0-9._-]{2,}@[a-zA-Z]{2,}$')),
    account_holder text CHECK (account_holder IS NULL OR length(account_holder) BETWEEN 2 AND 120),
    account_number text CHECK (account_number IS NULL OR account_number ~ '^[0-9]{9,18}$'),
    ifsc text CHECK (ifsc IS NULL OR ifsc ~ '^[A-Z]{4}0[A-Z0-9]{6}$'),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    -- The chosen method must actually be filled in.
    CHECK (
      (method = 'upi' AND upi_id IS NOT NULL)
      OR (method = 'bank' AND account_holder IS NOT NULL AND account_number IS NOT NULL AND ifsc IS NOT NULL)
    )
);

ALTER TABLE host_payout_accounts ENABLE ROW LEVEL SECURITY;

-- Bank details are between the host and the people who pay them:
-- the host manages their own row, admins can read it to execute payouts.
CREATE POLICY "Hosts manage own payout account" ON host_payout_accounts
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can read payout accounts" ON host_payout_accounts
  FOR SELECT TO authenticated
  USING (is_admin());

CREATE TRIGGER update_host_payout_accounts_updated_at
  BEFORE UPDATE ON host_payout_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---- 2. Payout state on the booking itself ----
ALTER TABLE vacation_bookings
  ADD COLUMN IF NOT EXISTS payout_status text NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS payout_reference text,
  ADD COLUMN IF NOT EXISTS payout_at timestamptz;

-- 'withheld' is the recorded outcome of a forfeit decision that went
-- the platform's way -- it removes the booking from the admin queue
-- without pretending a payout happened.
ALTER TABLE vacation_bookings DROP CONSTRAINT IF EXISTS vacation_bookings_payout_status_check;
ALTER TABLE vacation_bookings ADD CONSTRAINT vacation_bookings_payout_status_check
  CHECK (payout_status IN ('unpaid', 'paid', 'withheld'));

-- ---- 3. Admin queue + decisions ----
-- Automatically due: the stay happened for the host. Forfeits are NOT
-- here -- they are an admin decision, not a debt.
CREATE OR REPLACE FUNCTION vacation_booking_payout_due(vb vacation_bookings)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT vb.payment_status = 'paid'
     AND vb.payout_status = 'unpaid'
     AND (
       (vb.status = 'confirmed' AND vb.check_out <= CURRENT_DATE)
       OR vb.status = 'no_show'
     );
$$;

-- Mark-paid covers both the automatic dues and a forfeit an admin has
-- decided to release to the host.
CREATE OR REPLACE FUNCTION admin_mark_payout_paid(p_booking uuid, p_reference text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking vacation_bookings;
  v_title text;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Admins only.';
  END IF;

  SELECT * INTO v_booking FROM vacation_bookings WHERE id = p_booking;
  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'Booking not found.';
  END IF;
  IF NOT (vacation_booking_payout_due(v_booking)
          OR (v_booking.status = 'cancelled'
              AND v_booking.payment_status = 'paid'
              AND v_booking.payout_status = 'unpaid')) THEN
    RAISE EXCEPTION 'This booking has no payout due.';
  END IF;

  UPDATE vacation_bookings
  SET payout_status = 'paid',
      payout_reference = NULLIF(trim(COALESCE(p_reference, '')), ''),
      payout_at = now()
  WHERE id = p_booking;

  BEGIN
    SELECT title INTO v_title FROM listings WHERE id = v_booking.listing_id;
    INSERT INTO notifications (user_id, type, title, message, action_url)
    VALUES (
      v_booking.owner_id,
      'payment',
      'Payout sent',
      'Rs. ' || COALESCE(v_booking.base_amount, v_booking.total_price)::text
        || ' for the stay at ' || COALESCE(v_title, 'your property')
        || ' (' || to_char(v_booking.check_in, 'DD Mon') || ' - ' || to_char(v_booking.check_out, 'DD Mon')
        || ') has been transferred to your payout account.',
      '/owner-profile?tab=bookings'
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'payout notification failed: %', SQLERRM;
  END;
END;
$$;

REVOKE EXECUTE ON FUNCTION admin_mark_payout_paid(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_mark_payout_paid(uuid, text) TO authenticated, service_role;

-- The other side of the forfeit decision: the platform keeps it. No
-- host notification -- nothing was ever promised to them for a forfeit.
CREATE OR REPLACE FUNCTION admin_withhold_payout(p_booking uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking vacation_bookings;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Admins only.';
  END IF;

  SELECT * INTO v_booking FROM vacation_bookings WHERE id = p_booking;
  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'Booking not found.';
  END IF;
  IF NOT (v_booking.status = 'cancelled'
          AND v_booking.payment_status = 'paid'
          AND v_booking.payout_status = 'unpaid') THEN
    RAISE EXCEPTION 'Only an undecided forfeit can be withheld.';
  END IF;

  UPDATE vacation_bookings
  SET payout_status = 'withheld', payout_at = now()
  WHERE id = p_booking;
END;
$$;

REVOKE EXECUTE ON FUNCTION admin_withhold_payout(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_withhold_payout(uuid) TO authenticated, service_role;

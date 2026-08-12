-- ============================================================
-- Refunds for rent and Pro/society payments.
--
-- Both tables already had a 'refunded' status in their CHECK constraint
-- and the UI already renders it (and the Pro billing screen promises "a
-- refund within 7 days of purchase, contact support") -- but nothing
-- could ever SET that status: there was no refund path at all. This adds
-- the columns a real refund records, an admin read path so support can
-- see rent payments, and leaves the money movement to the
-- refund-payment edge function (only it holds the Razorpay secret) plus
-- the razorpay-webhook reconciliation for dashboard-initiated refunds.
--
-- (Booking refunds already exist end to end -- respond-booking /
-- cancel-booking -- and vacation_bookings already has these columns.
-- This is the rent + subscription half.)
-- ============================================================

ALTER TABLE billing_history
  ADD COLUMN IF NOT EXISTS razorpay_refund_id text,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz;

ALTER TABLE rent_payments
  ADD COLUMN IF NOT EXISTS razorpay_refund_id text,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz;

-- Support works refund requests from the admin console, which needs to
-- read the payment it is about. billing_history already has an admin
-- read policy; rent_payments did not.
DROP POLICY IF EXISTS "Admins can read all rent payments" ON rent_payments;
CREATE POLICY "Admins can read all rent payments" ON rent_payments
  FOR SELECT TO authenticated
  USING (is_admin());

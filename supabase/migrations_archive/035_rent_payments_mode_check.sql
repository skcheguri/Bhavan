-- The real payment flow now only ever writes 'upi_autopay' (mandate,
-- still simulated), 'razorpay' (one-time Checkout payment -- covers
-- card/UPI/netbanking, not just UPI, hence the rename from 'upi_qr'),
-- or 'cash' (manual offline logging). Bank transfer and cheque were
-- dropped from the UI; razorpay_recurring was never used anywhere.
ALTER TABLE rent_payments DROP CONSTRAINT rent_payments_payment_mode_check;
ALTER TABLE rent_payments ADD CONSTRAINT rent_payments_payment_mode_check
    CHECK (payment_mode = ANY (ARRAY['upi_autopay'::text, 'razorpay'::text, 'cash'::text]));

-- Real Razorpay order tracking for rent_payments, plus a link to the
-- rental_agreements row a payment is for. rent_payments.property_id
-- pointed at the `properties`/`units` tables, which are dead schema --
-- nothing in the app ever writes to them, so no tenant could ever have
-- a valid property_id there. rental_agreements is the table the app
-- actually populates (via the Rental Agreement generator), so payments
-- are now scoped by agreement_id instead; property_id is kept for any
-- future use but is no longer required.

ALTER TABLE rent_payments
    ADD COLUMN IF NOT EXISTS razorpay_order_id TEXT,
    ADD COLUMN IF NOT EXISTS agreement_id UUID REFERENCES rental_agreements(id) ON DELETE SET NULL;

ALTER TABLE rent_payments ALTER COLUMN property_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rent_payments_razorpay_order_id ON rent_payments(razorpay_order_id);
CREATE INDEX IF NOT EXISTS idx_rent_payments_agreement_id ON rent_payments(agreement_id);

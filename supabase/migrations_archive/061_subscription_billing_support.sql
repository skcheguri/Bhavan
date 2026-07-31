-- Pro subscriptions become purchasable via one-time Razorpay orders
-- (create-subscription-order / verify-subscription-payment edge
-- functions), reusing the same order -> checkout -> HMAC-verify pattern
-- already proven for rent payments. This migration adds the DB support:
--
-- 1. billing_history needs to remember which Razorpay order a pending
--    invoice belongs to, so a re-click on "Pay" resumes the same order
--    instead of piling up duplicates (same idempotency pattern as
--    rent_payments.razorpay_order_id).
ALTER TABLE billing_history ADD COLUMN IF NOT EXISTS razorpay_order_id text;

-- 2. With one-time payments there is no auto-renewal, so a subscription
--    that reaches its period end has simply lapsed. The client already
--    treats a past current_period_end as not-Pro; this job keeps the
--    stored status truthful too (admin views, future server-side gating).
CREATE OR REPLACE FUNCTION expire_lapsed_subscriptions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expired_count integer;
BEGIN
  UPDATE owner_subscriptions
  SET status = 'expired', updated_at = now()
  WHERE status = 'active'
    AND current_period_end IS NOT NULL
    AND current_period_end < now();

  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$;

SELECT cron.schedule('expire-lapsed-subscriptions', '30 3 * * *', 'SELECT expire_lapsed_subscriptions();');

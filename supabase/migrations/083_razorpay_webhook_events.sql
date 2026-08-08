-- Ledger of Razorpay webhook deliveries.
--
-- Razorpay retries a webhook until it gets a 2xx, and can deliver the same
-- event more than once even after success. Without a record of what has
-- already been handled, a retry of payment.captured would run fulfilment
-- twice -- and for a subscription that means a second year granted for one
-- payment.
--
-- The UNIQUE on event_id is the actual guard, not the status column: two
-- concurrent deliveries both read "not processed" before either writes, so
-- the check has to be an insert that one of them loses. The loser sees
-- 23505 and stops.
--
-- Rows are also kept for failures, because the alternative to a durable
-- record is reading edge function logs to answer "did this customer's
-- payment arrive", which is not an answer anyone can give quickly at the
-- moment a customer is asking.

CREATE TABLE IF NOT EXISTS razorpay_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Razorpay's x-razorpay-event-id header. Unique per event, stable
  -- across retries of that event.
  event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  order_id text,
  payment_id text,
  -- What we decided this payment was for: rent, pro, society, or unknown.
  target text,
  status text NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'processed', 'ignored', 'failed')),
  error text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_order
  ON razorpay_webhook_events (order_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_status
  ON razorpay_webhook_events (status, created_at DESC);

-- No policies at all. RLS on with zero policies means no client can read
-- or write this table by any route; only the service role (the webhook
-- function itself, and support queries) touches it. Payment payloads are
-- not something to expose to a signed-in user by accident.
ALTER TABLE razorpay_webhook_events ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE razorpay_webhook_events IS
  'One row per Razorpay webhook delivery. The unique event_id is what makes fulfilment idempotent under retries.';

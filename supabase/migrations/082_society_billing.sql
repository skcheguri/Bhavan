-- Let billing_history record a society purchase.
--
-- Two things blocked it. The plan CHECK only knew the individual Pro
-- plans, and there was no way to say which building an invoice was for --
-- owner_id alone is the person who paid, and one owner can administer
-- more than one society.
--
-- Reusing billing_history rather than adding a parallel invoice table is
-- deliberate: it already carries the invoice number, GST split, Razorpay
-- order and payment ids, and the pending/paid lifecycle that the
-- verification function depends on. A second table would mean a second
-- copy of all of that, and a second thing to get wrong.
--
-- On pricing. ONE PLAN, FLAT PER BUILDING: society_annual, Rs 4,999 plus
-- GST, whatever the size of the society. That number is a starting point,
-- not a researched price -- it sits at roughly five times individual Pro,
-- and it is a single line in create-society-subscription-order to change.
-- Flat rather than per-flat because per-unit billing needs a trustworthy
-- unit count, and the only count available is how many owners happen to
-- have joined so far, which would mean the price changes as people sign
-- up. community_subscriptions.unit_count is still recorded at purchase so
-- per-unit pricing stays possible later.

ALTER TABLE billing_history
  ADD COLUMN IF NOT EXISTS community_id uuid REFERENCES communities(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_billing_history_community
  ON billing_history (community_id, status);

COMMENT ON COLUMN billing_history.community_id IS
  'Set when this invoice is for a society plan. owner_id remains the individual who paid.';

ALTER TABLE billing_history DROP CONSTRAINT IF EXISTS billing_history_plan_check;
ALTER TABLE billing_history ADD CONSTRAINT billing_history_plan_check
  CHECK (plan IN ('free', 'pro_monthly', 'pro_annual', 'society_annual'));

-- community_subscriptions.plan stays 'standard' -- it describes what the
-- building has, while billing_history.plan describes what was sold. They
-- are different questions and conflating them would mean every
-- entitlement check had to learn the price list.

-- Server-side entitlements.
--
-- Correcting a claim that was repeated in HANDOVER.md and elsewhere: Pro
-- entitlements were NOT "enforced in React". They were not enforced at
-- all. FREE_TIER_LIMITS is Infinity on every count, every isPro reference
-- in the UI changes a badge colour or the word "Upgrade", subscription_features
-- is read but never written, and PRO_FEATURE_KEYS is exported and never
-- consumed. Today ₹999 buys a gold crown icon.
--
-- That is why there is nothing to migrate here and no risk of breaking a
-- paying user: this adds the mechanism that was missing, rather than
-- moving one that existed.
--
-- These functions are the single source of truth for "is this paid for".
-- SECURITY DEFINER so they can read subscription rows the caller cannot,
-- STABLE so Postgres may cache them within a statement, and search_path
-- pinned so a caller cannot shadow the tables they read.

-- Is this user on an active paid plan right now?
CREATE OR REPLACE FUNCTION public.has_pro(p_user uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM owner_subscriptions
    WHERE owner_id = p_user
      AND plan <> 'free'
      AND status IN ('active', 'trialing')
      -- A null period end means a plan that was never given an expiry;
      -- treat it as open rather than expired, so a data gap cannot
      -- silently revoke something a user paid for.
      AND (current_period_end IS NULL OR current_period_end > now())
  );
$$;

COMMENT ON FUNCTION public.has_pro(uuid) IS
  'Authoritative check for an individual paid plan. Call this from RLS, never trust a client flag.';

-- Grant it to the roles that evaluate policies.
GRANT EXECUTE ON FUNCTION public.has_pro(uuid) TO authenticated, anon;

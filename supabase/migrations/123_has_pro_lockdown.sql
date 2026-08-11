-- ============================================================
-- has_pro(uuid) was EXECUTE-granted to anon and authenticated "for RLS",
-- but no RLS policy actually calls it yet and neither does the client --
-- its only real effect was to let anyone, signed in or not, probe any
-- user's paid-subscription status by uuid via /rest/v1/rpc/has_pro.
--
-- Revoked from both. When a future policy genuinely needs it (e.g.
-- boosted-listing visibility), that migration re-grants EXECUTE to the
-- role that will evaluate the policy -- deliberately, not by default.
-- ============================================================

REVOKE EXECUTE ON FUNCTION has_pro(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION has_pro(uuid) TO service_role;

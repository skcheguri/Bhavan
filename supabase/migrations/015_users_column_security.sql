-- ============================================================
-- Close PII exposure gap on `users`.
--
-- The existing "Public read users" RLS policy (USING (true), no TO
-- clause) makes every ROW visible to anon/authenticated -- that part is
-- required, since listing cards, community posts, reviews, maintenance
-- requests, and connection requests all embed *other* users'
-- name/avatar/role/verified_aadhaar. RLS only governs which ROWS are
-- visible, not which COLUMNS -- so every column, including email,
-- phone, date_of_birth, and emergency_contact, was equally exposed for
-- every row to anyone holding the public anon key, regardless of what
-- the app's own queries chose to select.
--
-- Postgres column-level GRANT/REVOKE does NOT work through PostgREST
-- here (empirically verified) -- PostgREST requires table-level SELECT
-- to expose a relation at all, and once table-level SELECT is granted
-- it implies every column regardless of column-level REVOKEs layered
-- on top. So a VIEW is the only mechanism that reliably restricts which
-- columns come back through the REST API.
--
-- Fix: `users_public` exposes only the safe columns every cross-user
-- lookup in the app actually needs (verified against every
-- `.from('users')` and `users!*_fkey(` call site in src/ -- none
-- request more than these). Direct access to the base `users` table is
-- revoked for anon/authenticated entirely. The two legitimate
-- exceptions (reading your OWN full profile, and an admin verification
-- screen reading aadhaar_last4) get narrow SECURITY DEFINER RPCs, which
-- bypass the revoked grant by running as the function owner but stay
-- row-scoped by construction.
-- ============================================================

-- Reset to a known baseline in case of a prior partial run of this migration.
GRANT SELECT ON users TO anon, authenticated;
REVOKE SELECT ON users FROM anon, authenticated;

-- security_invoker = false (the default) is required here: it makes the
-- view run with the view OWNER's privileges rather than the caller's,
-- which is what lets a caller with zero direct access to `users` still
-- query this view. (security_invoker = true was tried and empirically
-- confirmed to break this -- it makes Postgres check the caller's
-- privileges against the underlying `users` table too.)
CREATE OR REPLACE VIEW users_public WITH (security_invoker = false) AS
  SELECT id, name, avatar_url, role, verified_aadhaar, created_at FROM users;

GRANT SELECT ON users_public TO anon, authenticated;

-- ---- Own full profile (replaces `select('*')` in useAuth.ts) ----
CREATE OR REPLACE FUNCTION get_my_profile()
RETURNS SETOF users
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT * FROM users WHERE id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION get_my_profile() TO authenticated;

-- ---- Admin: verified users list incl. aadhaar_last4 ----
-- Returns zero rows for non-admins rather than erroring -- is_admin()
-- in the WHERE clause filters every row out for a non-admin caller.
CREATE OR REPLACE FUNCTION admin_verified_users(result_limit INT DEFAULT 20)
RETURNS TABLE (id UUID, name TEXT, avatar_url TEXT, aadhaar_last4 TEXT)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT u.id, u.name, u.avatar_url, u.aadhaar_last4
  FROM users u
  WHERE u.verified_aadhaar = TRUE
    AND is_admin()
  ORDER BY u.aadhaar_verified_at DESC NULLS LAST
  LIMIT result_limit;
$$;

GRANT EXECUTE ON FUNCTION admin_verified_users(INT) TO authenticated;

NOTIFY pgrst, 'reload schema';

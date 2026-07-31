-- ============================================================
-- Two related bugs found while tightening admin gating, both on `users`:
--
-- 1. Migration 015 revoked table-level SELECT on `users` from
--    anon/authenticated to close the PII exposure gap. That also broke
--    every legitimate self profile edit: Postgres has to evaluate the
--    RLS USING(auth.uid() = id) clause on UPDATE, which needs SELECT
--    privilege on the `id` column -- with it fully revoked, ANY update
--    via updateProfile() (name, phone, avatar, etc.) now fails with
--    "permission denied for table users". Fix: grant SELECT back on
--    just the `id` column. This does not reopen the PII gap -- PostgREST
--    still refuses to expose any column via GET without a table-level
--    grant (see migration 015's notes), and column(id) alone lets an
--    UPDATE's RLS check run without letting anyone read other columns.
--
-- 2. "Users can update own profile" (USING (auth.uid() = id)) has no
--    column restriction, and both anon and authenticated hold column-level
--    UPDATE grants on every column of `users`, including `role`,
--    `verified_aadhaar`, `verified_email`, `verified_phone`, and the
--    aadhaar_* fields. RLS's USING/WITH CHECK only gate which ROW you
--    can touch, not which COLUMNS -- so any logged-in user could run
--    supabase.from('users').update({ role: 'admin' }) on their own row
--    and it would succeed. Verified empirically. Column-level REVOKE
--    can't distinguish "the row owner" from "an admin" since both are
--    the same `authenticated` Postgres role -- only a row-aware trigger
--    can. Fix: a BEFORE UPDATE trigger that pins these columns back to
--    their old values unless the caller is_admin().
--
--    role is special-cased rather than pinned outright: auth-callback/
--    page.tsx lets a brand-new Google OAuth account self-select
--    tenant vs owner via a direct `users.update({ role: pendingRole })`
--    within 2 minutes of signup, which is a legitimate non-admin
--    self-update. Only block the transition if 'admin' is on either
--    side of the change (promoting to it or demoting away from it) --
--    tenant<->owner switches by the row's own owner stay allowed.
-- ============================================================

GRANT SELECT (id) ON users TO anon, authenticated;

CREATE OR REPLACE FUNCTION protect_privileged_user_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    IF NEW.role IS DISTINCT FROM OLD.role AND (NEW.role = 'admin' OR OLD.role = 'admin') THEN
      NEW.role := OLD.role;
    END IF;
    NEW.verified_email := OLD.verified_email;
    NEW.verified_phone := OLD.verified_phone;
    NEW.verified_aadhaar := OLD.verified_aadhaar;
    NEW.aadhaar_last4 := OLD.aadhaar_last4;
    NEW.aadhaar_verified_at := OLD.aadhaar_verified_at;
    NEW.aadhaar_verification_status := OLD.aadhaar_verification_status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_privileged_user_columns_trigger ON users;
CREATE TRIGGER protect_privileged_user_columns_trigger
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION protect_privileged_user_columns();

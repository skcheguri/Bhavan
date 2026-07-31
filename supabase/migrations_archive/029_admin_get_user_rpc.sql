-- ============================================================
-- Single-user lookup for admin pages that need to open the user detail
-- modal from a context that only has an id + name (broker reports,
-- eventually community moderation etc) -- not the full row already
-- loaded like the User Management list has.
--
-- Table-level SELECT on `users` is revoked for authenticated/anon (see
-- migration 015's PII lockdown), so even an admin session can't do a
-- raw `.from('users').select(...).eq('id', x)` -- same reason
-- admin_list_users() exists as a SECURITY DEFINER RPC instead of a
-- direct query.
-- ============================================================

CREATE OR REPLACE FUNCTION admin_get_user(target_id UUID)
RETURNS TABLE (
  id UUID, name TEXT, email TEXT, phone TEXT, role TEXT,
  verified_email BOOLEAN, verified_phone BOOLEAN, verified_aadhaar BOOLEAN,
  suspended BOOLEAN, suspended_reason TEXT, suspended_at TIMESTAMPTZ, created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id, u.name, u.email, u.phone, u.role,
         u.verified_email, u.verified_phone, u.verified_aadhaar,
         u.suspended, u.suspended_reason, u.suspended_at, u.created_at
  FROM users u
  WHERE u.id = target_id AND is_admin();
$$;

GRANT EXECUTE ON FUNCTION admin_get_user(UUID) TO authenticated;

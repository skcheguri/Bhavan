-- ============================================================
-- DB support for the admin dashboard expansion: User Management,
-- Listings Oversight, and a Support/Contact Inquiries queue.
-- ============================================================

-- ---- User Management: real account suspension ----
-- Enforcement happens via Supabase Auth's own ban_duration (set by the
-- admin-suspend-user Edge Function using the service role, which
-- actually blocks sign-in at the auth layer) -- these columns are the
-- UI-visible mirror of that state so the admin list doesn't need to
-- call the Admin API just to render a status badge.
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_reason TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMP WITH TIME ZONE;

-- Admin-only, searchable user directory. Table-level SELECT on `users`
-- is revoked for anon/authenticated (migration 015's PII lockdown), so
-- this SECURITY DEFINER RPC is the read path -- same pattern as
-- get_my_profile()/admin_verified_users(). Returns zero rows for a
-- non-admin caller rather than erroring.
CREATE OR REPLACE FUNCTION admin_list_users(search_query TEXT DEFAULT NULL, result_limit INT DEFAULT 50)
RETURNS TABLE (
  id UUID, name TEXT, email TEXT, phone TEXT, role TEXT,
  verified_email BOOLEAN, verified_phone BOOLEAN, verified_aadhaar BOOLEAN,
  suspended BOOLEAN, suspended_reason TEXT, suspended_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT u.id, u.name, u.email, u.phone, u.role,
         u.verified_email, u.verified_phone, u.verified_aadhaar,
         u.suspended, u.suspended_reason, u.suspended_at, u.created_at
  FROM users u
  WHERE is_admin()
    AND (
      search_query IS NULL OR search_query = ''
      OR u.name ILIKE '%' || search_query || '%'
      OR u.email ILIKE '%' || search_query || '%'
      OR u.phone ILIKE '%' || search_query || '%'
    )
  ORDER BY u.created_at DESC
  LIMIT result_limit;
$$;

GRANT EXECUTE ON FUNCTION admin_list_users(TEXT, INT) TO authenticated;

-- Aggregate counts for the admin overview -- avoids fetching full rows
-- just to count them, and stays consistent with the RLS-locked-down
-- table via the same is_admin()-gated SECURITY DEFINER pattern.
CREATE OR REPLACE FUNCTION admin_user_stats()
RETURNS TABLE (total_users BIGINT, total_tenants BIGINT, total_owners BIGINT, total_admins BIGINT, suspended_count BIGINT)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    count(*) FILTER (WHERE is_admin()),
    count(*) FILTER (WHERE is_admin() AND role = 'tenant'),
    count(*) FILTER (WHERE is_admin() AND role = 'owner'),
    count(*) FILTER (WHERE is_admin() AND role = 'admin'),
    count(*) FILTER (WHERE is_admin() AND suspended)
  FROM users;
$$;

GRANT EXECUTE ON FUNCTION admin_user_stats() TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ---- Listings Oversight ----
-- Listings currently auto-publish with no admin gate at all -- public
-- SELECT is scoped to status='active' and there was no admin path to
-- see/search everything or take a listing down. Mirrors the same
-- admin-policy pattern already used on `properties` (migration 021).
CREATE POLICY "Admins can read all listings" ON listings
FOR SELECT USING (is_admin());

CREATE POLICY "Admins can update any listing" ON listings
FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());

-- ---- Support / Contact Inquiries ----
-- The public Contact Us form currently writes nowhere -- it just flips
-- local React state. This table + policies give it somewhere real to
-- land, and an admin-only queue to work through.
CREATE TABLE IF NOT EXISTS contact_inquiries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'resolved')),
  admin_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  resolved_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE contact_inquiries ENABLE ROW LEVEL SECURITY;

-- The contact form is reachable by anyone, logged in or not.
CREATE POLICY "Anyone can submit a contact inquiry" ON contact_inquiries
FOR INSERT WITH CHECK (true);

CREATE POLICY "Admins can read contact inquiries" ON contact_inquiries
FOR SELECT USING (is_admin());

CREATE POLICY "Admins can update contact inquiries" ON contact_inquiries
FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());

GRANT SELECT, INSERT ON contact_inquiries TO anon, authenticated;
GRANT UPDATE ON contact_inquiries TO authenticated;

NOTIFY pgrst, 'reload schema';

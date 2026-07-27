-- ============================================================
-- Bhavan Platform -- Fix infinite recursion in admin RLS policies
-- ============================================================
-- Every "admin can read/update everything" policy checked the caller's
-- role with an inline subquery against the users table:
--   EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin')
-- When that check lives inside a policy ON users itself, Postgres has to
-- re-apply users' RLS to the inner SELECT, which re-evaluates the same
-- policy, which re-queries users again -- infinite recursion. Symptom:
-- any query touching `users` (including PostgREST embeds like
-- `owner:users(...)` on listings/community_posts/etc.) fails with
-- "infinite recursion detected in policy for relation users" (Postgres
-- error 42P17), even for anon/plain reads.
--
-- Fix: a SECURITY DEFINER helper function that bypasses RLS internally,
-- used by every admin-scoped policy. This migration is additive/idempotent
-- (CREATE OR REPLACE FUNCTION + DROP POLICY IF EXISTS) and safe to run
-- against a database that already has bhavan_schema.sql and
-- 002_phase3_additions.sql applied.
--
-- bhavan_schema.sql and 002_phase3_additions.sql have also been corrected
-- at the source so a fresh install never hits this -- this file exists to
-- repair a database that already ran the old versions.
-- ============================================================

CREATE OR REPLACE FUNCTION is_admin(uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM users WHERE id = uid AND role = 'admin');
$$;

-- ---- users ----
DROP POLICY IF EXISTS "Admins can read all users" ON users;
CREATE POLICY "Admins can read all users" ON users FOR SELECT USING (is_admin());

DROP POLICY IF EXISTS "Admins can update any user" ON users;
CREATE POLICY "Admins can update any user" ON users FOR UPDATE USING (is_admin());

-- ---- broker_reports ----
DROP POLICY IF EXISTS "Admins can read all reports" ON broker_reports;
CREATE POLICY "Admins can read all reports" ON broker_reports FOR SELECT USING (is_admin());

DROP POLICY IF EXISTS "Admins can read all broker reports" ON broker_reports;
CREATE POLICY "Admins can read all broker reports" ON broker_reports FOR SELECT USING (is_admin());

DROP POLICY IF EXISTS "Admins can update broker reports" ON broker_reports;
CREATE POLICY "Admins can update broker reports" ON broker_reports FOR UPDATE USING (is_admin());

-- ---- soft_block_states ----
DROP POLICY IF EXISTS "Admins can read all soft blocks" ON soft_block_states;
CREATE POLICY "Admins can read all soft blocks" ON soft_block_states FOR SELECT USING (is_admin());

DROP POLICY IF EXISTS "Admins can update soft blocks" ON soft_block_states;
CREATE POLICY "Admins can update soft blocks" ON soft_block_states FOR UPDATE USING (is_admin());

-- ---- owner_subscriptions ----
DROP POLICY IF EXISTS "Admins can read all subscriptions" ON owner_subscriptions;
CREATE POLICY "Admins can read all subscriptions" ON owner_subscriptions FOR SELECT USING (is_admin());

-- ---- billing_history ----
DROP POLICY IF EXISTS "Admins can read all billing" ON billing_history;
CREATE POLICY "Admins can read all billing" ON billing_history FOR SELECT USING (is_admin());

-- ---- contact_attempts ----
DROP POLICY IF EXISTS "Admins can read contact attempts" ON contact_attempts;
CREATE POLICY "Admins can read contact attempts" ON contact_attempts FOR SELECT USING (is_admin());

-- ---- audit_logs ----
DROP POLICY IF EXISTS "Admins can read audit logs" ON audit_logs;
CREATE POLICY "Admins can read audit logs" ON audit_logs FOR SELECT USING (is_admin());

-- ---- community_posts ----
DROP POLICY IF EXISTS "Public can read posts" ON community_posts;
DROP POLICY IF EXISTS "Public can read visible posts" ON community_posts;
CREATE POLICY "Public can read visible posts" ON community_posts FOR SELECT USING (
    hidden = FALSE OR is_admin()
);

DROP POLICY IF EXISTS "Admins can update posts" ON community_posts;
CREATE POLICY "Admins can update posts" ON community_posts FOR UPDATE USING (is_admin());

-- ---- community_post_reports ----
DROP POLICY IF EXISTS "Admins can read post reports" ON community_post_reports;
CREATE POLICY "Admins can read post reports" ON community_post_reports FOR SELECT USING (is_admin());

DROP POLICY IF EXISTS "Admins can dismiss post reports" ON community_post_reports;
CREATE POLICY "Admins can dismiss post reports" ON community_post_reports FOR DELETE USING (is_admin());

-- ---- aadhaar_verifications ----
DROP POLICY IF EXISTS "Admins can read all verification submissions" ON aadhaar_verifications;
CREATE POLICY "Admins can read all verification submissions" ON aadhaar_verifications FOR SELECT USING (is_admin());

DROP POLICY IF EXISTS "Admins can update verification submissions" ON aadhaar_verifications;
CREATE POLICY "Admins can update verification submissions" ON aadhaar_verifications FOR UPDATE USING (is_admin());

-- ============================================================
-- END OF MIGRATION
-- ============================================================

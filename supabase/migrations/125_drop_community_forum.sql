-- ============================================================
-- Remove the public Community Forum -- out of scope for the MVP.
--
-- Scope is the FORUM only: community_posts, community_comments and
-- community_post_reports, their triggers, and the two trigger functions
-- nothing else calls. The SOCIETY feature is a different subsystem that
-- happens to share the "community" prefix (communities,
-- community_members, community_announcements, community_tickets,
-- community_polls, community_collections, community_subscriptions, ...)
-- and is deliberately untouched.
--
-- users_public (migration 116) scoped anonymous reads to users with a
-- "public footprint", two arms of which were forum posts/comments; the
-- view is recreated without them first, since it must not reference
-- dropped tables. The remaining anon footprint is active-listing owners
-- and review participants.
-- ============================================================

-- ---- users_public without the forum arms ----
DROP VIEW IF EXISTS users_public;

CREATE VIEW users_public
WITH (security_invoker = false, security_barrier = true) AS
SELECT u.id,
       u.name,
       u.avatar_url,
       u.verified_aadhaar,
       u.created_at
FROM users u
WHERE (SELECT auth.uid()) IS NOT NULL
   OR EXISTS (SELECT 1 FROM listings l
              WHERE l.owner_id = u.id AND l.status = 'active')
   OR EXISTS (SELECT 1 FROM reviews r
              WHERE r.reviewer_id = u.id OR r.subject_id = u.id);

REVOKE ALL ON users_public FROM PUBLIC;
GRANT SELECT ON users_public TO anon, authenticated;

-- ---- The forum itself ----
-- CASCADE covers the FK from comments/reports to posts; policies,
-- triggers and indexes go with their tables.
DROP TABLE IF EXISTS community_post_reports CASCADE;
DROP TABLE IF EXISTS community_comments CASCADE;
DROP TABLE IF EXISTS community_posts CASCADE;

DROP FUNCTION IF EXISTS enforce_community_post_rate_limit();
DROP FUNCTION IF EXISTS enforce_community_post_no_self_unhide();

-- Quota events recorded for forum posting have nothing left to limit.
DELETE FROM rate_limit_events WHERE action = 'community_post';

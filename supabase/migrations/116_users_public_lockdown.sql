-- ============================================================
-- users_public exposed every account -- id, name, avatar, and crucially
-- `role` -- to ANY caller, including unauthenticated ones with nothing
-- but the (public) anon key. That is a bulk-scrape of the whole user
-- base plus a ready-made list of which accounts are admins to target.
--
-- Fixes, in order:
--   1. `role` leaves the view entirely. Nothing user-facing renders
--      another user's role from it; the one admin screen that showed it
--      (admin/verification) now reads the base `users` table, which its
--      "Admins can read all users" RLS policy already permits.
--   2. Anonymous callers no longer see every user. Logged-out pages
--      (/listings, /listings/:id, /community) legitimately render owner
--      and author names, so instead of revoking `anon` outright -- which
--      would break those pages -- the view scopes anon to users with an
--      actual public footprint: an active listing, a visible community
--      post/comment, or a review. Everyone else's row is simply absent
--      until you sign in.
--   3. Arbitrary profile lookups by uuid (the profile modal) go through
--      get_public_profile(), which requires a real relationship with the
--      person being viewed rather than serving any uuid to any caller.
--
-- security_barrier: the view now has row filters, so without it a
-- crafted query with a non-leakproof predicate could be pushed below the
-- filter and probe rows anon isn't meant to see.
-- ============================================================

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
   OR EXISTS (SELECT 1 FROM community_posts p
              WHERE p.author_id = u.id AND p.hidden = false)
   OR EXISTS (SELECT 1 FROM community_comments c
              WHERE c.author_id = u.id)
   OR EXISTS (SELECT 1 FROM reviews r
              WHERE r.reviewer_id = u.id OR r.subject_id = u.id);

REVOKE ALL ON users_public FROM PUBLIC;
GRANT SELECT ON users_public TO anon, authenticated;

-- ---- Relationship-gated profile lookup ----
-- The profile modal used to `SELECT ... FROM users_public WHERE id = $1`
-- with any uuid. This RPC only answers when the viewer actually knows
-- the person through the product: a connection request, a rental
-- agreement, a shared society, or the person openly advertises (active
-- listing). Otherwise it returns no rows and the modal shows
-- "Profile not found."
CREATE FUNCTION get_public_profile(p_user_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  avatar_url text,
  verified_aadhaar boolean,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id, u.name, u.avatar_url, u.verified_aadhaar, u.created_at
  FROM users u
  WHERE u.id = p_user_id
    AND auth.uid() IS NOT NULL
    AND (
      u.id = auth.uid()
      OR is_admin()
      OR EXISTS (SELECT 1 FROM listings l
                 WHERE l.owner_id = u.id AND l.status = 'active')
      OR EXISTS (SELECT 1 FROM connection_requests cr
                 WHERE (cr.tenant_id = auth.uid() AND cr.owner_id = u.id)
                    OR (cr.owner_id = auth.uid() AND cr.tenant_id = u.id))
      OR EXISTS (SELECT 1 FROM rental_agreements ra
                 WHERE (ra.tenant_id = auth.uid() AND ra.owner_id = u.id)
                    OR (ra.owner_id = auth.uid() AND ra.tenant_id = u.id))
      OR EXISTS (SELECT 1 FROM community_members mine
                 JOIN community_members theirs
                   ON theirs.community_id = mine.community_id
                 WHERE mine.user_id = auth.uid()
                   AND theirs.user_id = u.id
                   AND mine.status = 'approved'
                   AND theirs.status = 'approved')
    );
$$;

REVOKE EXECUTE ON FUNCTION get_public_profile(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_public_profile(uuid) TO authenticated;

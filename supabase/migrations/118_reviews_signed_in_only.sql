-- ============================================================
-- "Public can read reviews" was USING (true): every review -- reviewer,
-- subject, property name, locality, and tenancy period -- was readable
-- by anyone with the anon key. Joined with users_public, that is a
-- browsable registry of who lives (or lived) where, rented from whom,
-- and for which period. For a tenant hiding from someone, that is an
-- address lookup service.
--
-- Reads now require being signed in. The /feedback community feed keeps
-- working for members (that page now shows a sign-in prompt to visitors
-- instead of the feed); bulk-scraping the tenancy graph now at minimum
-- requires an account that can be rate-limited, suspended, and traced.
-- Writes were already tenancy-gated (migration 106) and are untouched.
-- ============================================================

DROP POLICY IF EXISTS "Public can read reviews" ON reviews;

CREATE POLICY "Signed-in users can read reviews" ON reviews
  FOR SELECT TO authenticated
  USING (true);

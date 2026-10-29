-- ============================================================
-- Part D: category tab counts without a second full-table fetch.
--
-- The listings page numbered its category tabs ("All 42", "Vacation 7")
-- by fetching the ENTIRE active listings table a second time, unscoped,
-- on top of the scoped fetch feeding the grid. With server-side
-- pagination that second scan is both wasteful and wrong (it would only
-- ever see one page). This grouped count runs in the database and returns
-- a handful of rows instead.
--
-- SECURITY INVOKER (the default): the counts are evaluated under the
-- caller's RLS, so a viewer only ever counts listings they could also see
-- in the grid -- no privileged leak, and the badge matches the results.
-- ============================================================
CREATE OR REPLACE FUNCTION get_active_listing_counts()
RETURNS TABLE (category text, count bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(l.category, 'residential') AS category, COUNT(*)::bigint AS count
  FROM listings l
  WHERE l.status = 'active'
  GROUP BY COALESCE(l.category, 'residential');
$$;

GRANT EXECUTE ON FUNCTION get_active_listing_counts() TO anon, authenticated, service_role;

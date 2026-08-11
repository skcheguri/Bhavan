-- ============================================================
-- check_and_record_rate_limit() was executable by anyone (functions get
-- EXECUTE for PUBLIC on creation, and nothing ever revoked it). It takes
-- the actor as a parameter, so any caller -- including an unauthenticated
-- one holding just the anon key -- could call it in a loop with someone
-- ELSE's uuid and an action name like 'community_post', silently filling
-- that person's daily/weekly quota with fake events until their real
-- posts start failing with "You have reached the daily limit".
--
-- Nothing legitimate calls it over the API: its only callers are the
-- enforce_*_rate_limit trigger functions, which are SECURITY DEFINER and
-- therefore invoke it as the function owner, not as the request's role.
-- Locking it to owner/service_role changes nothing for them.
-- ============================================================

REVOKE EXECUTE ON FUNCTION check_and_record_rate_limit(uuid, text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION check_and_record_rate_limit(uuid, text, text, integer, integer) TO service_role;

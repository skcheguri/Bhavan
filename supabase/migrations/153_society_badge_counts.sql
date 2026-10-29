-- ============================================================
-- Part D: society tab badge counts over the FULL set, not one page.
--
-- The society screen numbered its tabs ("Maintenance 3", "Polls 2",
-- "Members 1") by filtering the already-paginated 20-row page (and, for
-- members, the 500-row-capped directory). A society with more than a page
-- of tickets/polls, or more than 500 members, undercounts the very thing
-- the badge exists to surface -- open tickets, unanswered polls, waiting
-- join requests. (The page carried TODOs saying exactly this.)
--
-- One RPC returns all four counts computed in the database:
--   open_tickets     non-resolved tickets (matches status <> 'resolved')
--   polls_to_answer  open polls the caller has not voted in
--   pending_members  join requests awaiting approval
--   open_collections collections still accepting contributions
--
-- SECURITY INVOKER (default): every count runs under the caller's RLS, so
-- a non-admin (who cannot see pending join requests) gets 0 there, exactly
-- as the admin-only members badge already assumed.
-- ============================================================
CREATE OR REPLACE FUNCTION get_society_badge_counts(p_community uuid)
RETURNS TABLE (
  open_tickets bigint,
  polls_to_answer bigint,
  pending_members bigint,
  open_collections bigint
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    (SELECT count(*) FROM community_tickets t
       WHERE t.community_id = p_community AND t.status <> 'resolved'),
    (SELECT count(*) FROM community_polls p
       WHERE p.community_id = p_community
         AND NOT poll_closed(p.closed_at, p.closes_at)
         AND NOT EXISTS (
           SELECT 1 FROM community_poll_voters v
           WHERE v.poll_id = p.id AND v.user_id = auth.uid()
         )),
    (SELECT count(*) FROM community_members m
       WHERE m.community_id = p_community AND m.status = 'pending'),
    (SELECT count(*) FROM community_collections c
       WHERE c.community_id = p_community AND c.status = 'open');
$$;

GRANT EXECUTE ON FUNCTION get_society_badge_counts(uuid) TO authenticated, service_role;

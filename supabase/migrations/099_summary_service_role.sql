-- Let a backend context read the deletion summary.
--
-- 098 gated it on is_admin(), which reads auth.uid() -- NULL under the
-- service role, so the function raised for the very context support would
-- use to answer "what would we destroy here" from a script or a console.
-- Verified: calling it as service role returned nothing at all.
--
-- Same correction as migration 076 made for the membership guards, for
-- the same reason: the service key already bypasses RLS and can read every
-- one of these tables directly, so refusing it here buys no safety and
-- only breaks the legitimate caller.
CREATE OR REPLACE FUNCTION public.get_society_deletion_summary(p_community uuid)
RETURNS TABLE (
  member_count bigint,
  ticket_count bigint,
  notice_count bigint,
  collection_count bigint,
  confirmed_contribution_count bigint,
  confirmed_contribution_rupees bigint,
  plan_status text,
  plan_ends timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT is_admin() THEN
    RAISE EXCEPTION 'Only Bhavan can review a deletion request';
  END IF;

  RETURN QUERY
  SELECT
    (SELECT count(*) FROM community_members WHERE community_id = p_community AND status = 'approved'),
    (SELECT count(*) FROM community_tickets WHERE community_id = p_community),
    (SELECT count(*) FROM community_announcements WHERE community_id = p_community),
    (SELECT count(*) FROM community_collections WHERE community_id = p_community),
    (SELECT count(*) FROM community_contributions c
       JOIN community_collections k ON k.id = c.collection_id
      WHERE k.community_id = p_community AND c.status = 'confirmed'),
    (SELECT coalesce(sum(c.amount_rupees), 0) FROM community_contributions c
       JOIN community_collections k ON k.id = c.collection_id
      WHERE k.community_id = p_community AND c.status = 'confirmed'),
    (SELECT status FROM community_subscriptions WHERE community_id = p_community),
    (SELECT current_period_end FROM community_subscriptions WHERE community_id = p_community);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_society_deletion_summary(uuid) TO authenticated;

-- Let someone who has applied see the society they applied to.
--
-- The communities SELECT policy allowed is_community_member(), which
-- requires status = 'approved'. So between requesting to join and being
-- approved, the applicant could read their own membership row but not the
-- community it points at.
--
-- Verified in the browser: after a successful join request the page fell
-- straight back to "Join with a code", because the membership row loaded
-- with a null community and the screen had nothing to render. The user
-- sees no evidence their request went anywhere, applies again, and gets
-- "You have already applied to this society." Nothing in the UI can fix
-- that -- the data genuinely is not visible.
--
-- It is also pointless secrecy: they had the join code, and the lookup
-- already showed them the name, type and city before they applied.
--
-- is_community_member() itself is NOT relaxed. It still means "approved",
-- because it is what gates the member directory, and later the tickets and
-- announcements. This adds a separate, weaker predicate used in exactly
-- one place.

CREATE OR REPLACE FUNCTION public.has_community_application(p_community uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM community_members
    WHERE community_id = p_community AND user_id = auth.uid()
  );
$$;

COMMENT ON FUNCTION public.has_community_application(uuid) IS
  'True for any membership row, pending or rejected included. Use only to let an applicant see which community they applied to; use is_community_member for entitlements.';

GRANT EXECUTE ON FUNCTION public.has_community_application(uuid) TO authenticated;

DROP POLICY IF EXISTS "Members read their community" ON communities;
CREATE POLICY "Members read their community" ON communities
  FOR SELECT TO authenticated
  USING (
    is_community_member(id)
    OR has_community_application(id)
    OR created_by = auth.uid()
    OR is_admin()
  );

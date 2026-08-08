-- Let an owner leave a society, and an admin remove someone.
--
-- community_members had INSERT, SELECT and UPDATE policies and no DELETE,
-- so a membership was permanent: an owner who sold their flat stayed in
-- the directory, kept reading the building's issues, and kept receiving
-- its notifications, with nobody able to do anything about it. That is
-- the first thing that would have gone wrong with a real society.
--
-- The existing prevent_last_admin_removal() guard is BEFORE UPDATE only,
-- which was sufficient when demotion was the only way to lose an admin.
-- With DELETE it is not: removing the sole admin would walk straight past
-- it and leave a community nobody could administer -- the same dead end
-- migration 075 fixed at the other end of the lifecycle.

DROP POLICY IF EXISTS "Leave, or be removed by an admin" ON community_members;
CREATE POLICY "Leave, or be removed by an admin" ON community_members
  FOR DELETE TO authenticated
  USING (
    -- Leaving is your own decision and needs nobody's approval.
    user_id = auth.uid()
    OR is_community_admin(community_id)
    OR is_admin()
  );

CREATE OR REPLACE FUNCTION public.prevent_last_admin_delete()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF OLD.role = 'admin' AND OLD.status = 'approved' THEN
    IF NOT EXISTS (
      SELECT 1 FROM community_members
      WHERE community_id = OLD.community_id
        AND id <> OLD.id
        AND role = 'admin'
        AND status = 'approved'
    ) THEN
      RAISE EXCEPTION 'This is the only admin. Appoint another admin first.';
    END IF;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_last_admin_delete ON community_members;
CREATE TRIGGER trg_prevent_last_admin_delete
  BEFORE DELETE ON community_members
  FOR EACH ROW EXECUTE FUNCTION prevent_last_admin_delete();

-- Deliberately NOT exempting the service role, matching the UPDATE guard:
-- orphaning a community is a correctness bug rather than a permissions
-- question, and there is no context in which it is the right outcome.

COMMENT ON FUNCTION public.prevent_last_admin_delete() IS
  'A society must never be left with nobody able to run it. Applies to everyone, service role included.';

-- What survives a departure, and why nothing here cascades:
--
-- Tickets, comments and contributions reference users(id), not the
-- membership row, so leaving takes the person out of the directory while
-- the building keeps its history. An issue does not stop having been
-- reported because the reporter moved out, and a confirmed contribution is
-- a financial record -- erasing it because someone left would quietly
-- change a total the treasurer already reconciled.
--
-- The visible effect is that their flat number stops resolving in lists
-- built from community_members (those joins are LEFT), so their name still
-- shows and the unit does not. That is the honest rendering of "this
-- person is no longer here".

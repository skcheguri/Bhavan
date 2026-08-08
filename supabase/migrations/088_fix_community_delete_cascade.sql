-- Fix a deadlock introduced by 086: a society could no longer be deleted.
--
-- communities -> community_members is ON DELETE CASCADE. Deleting a
-- society therefore deletes its memberships, including its last admin --
-- which fires prevent_last_admin_delete() and raises "This is the only
-- admin. Appoint another admin first."
--
-- The result is that DELETE on communities fails for every society that
-- has an admin, which is every active one. Verified against production:
-- deleting a test society returned P0001 from a trigger on a different
-- table. A platform admin clearing out a spam or duplicate registration
-- would have hit exactly this, with an error naming a problem that has
-- nothing to do with what they were doing.
--
-- The guard is still right for its actual purpose: removing one member
-- must not leave a live society unadministered. It just has to notice
-- when there is no society left to protect. During a cascade the parent
-- row is already gone by the time the child trigger runs, so its absence
-- is the signal.

CREATE OR REPLACE FUNCTION public.prevent_last_admin_delete()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- The society itself is being deleted; there is nothing to orphan.
  IF NOT EXISTS (SELECT 1 FROM communities WHERE id = OLD.community_id) THEN
    RETURN OLD;
  END IF;

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

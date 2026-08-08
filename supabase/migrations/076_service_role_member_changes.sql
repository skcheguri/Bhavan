-- Let trusted backend contexts through guard_community_member_changes().
--
-- The guard exempts platform admins and community admins by calling
-- is_admin() / is_community_admin(), both of which read auth.uid(). Under
-- the service role there is no JWT, so auth.uid() is NULL, both return
-- false, and the guard rejects the write. Verified against the live
-- database: a service-role attempt to change a member's role failed with
-- "Only a community admin can change a member's role".
--
-- That is friction without safety. The service key already bypasses RLS,
-- and could drop or disable this trigger outright -- so the trigger was
-- never a boundary against it. All the rejection actually does is break
-- the things that legitimately run as service role: edge functions, and
-- support fixing a community by hand.
--
-- Note what is NOT exempted: prevent_last_admin_removal() still applies to
-- everyone, including the service role. Orphaning a community is a
-- correctness bug rather than a permissions question, and there is no
-- context in which it is the right outcome.

CREATE OR REPLACE FUNCTION public.guard_community_member_changes()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- No JWT at all means a backend context (service role, migration, cron)
  -- that is already trusted with far more than this table.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Platform admins and community admins may change role/status.
  IF is_admin() OR is_community_admin(NEW.community_id) THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Only a community admin can change a member''s role';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Only a community admin can change a member''s status';
  END IF;
  IF NEW.approved_by IS DISTINCT FROM OLD.approved_by
     OR NEW.approved_at IS DISTINCT FROM OLD.approved_at THEN
    RAISE EXCEPTION 'Approval fields are set by the approver, not the member';
  END IF;
  IF NEW.community_id IS DISTINCT FROM OLD.community_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'A membership cannot be moved to another community or user';
  END IF;

  RETURN NEW;
END;
$$;

-- Same reasoning for the insert path: a backend context inserting a
-- membership row means it, rather than having its row silently rewritten
-- to member/pending and looking like it worked.
CREATE OR REPLACE FUNCTION public.force_pending_membership()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR is_admin() OR is_community_admin(NEW.community_id) THEN
    RETURN NEW;
  END IF;

  -- The founding admin of a Bhavan-approved community that has none yet.
  IF NEW.role = 'admin'
     AND NOT EXISTS (
       SELECT 1 FROM community_members
       WHERE community_id = NEW.community_id
         AND role = 'admin' AND status = 'approved'
     )
     AND EXISTS (
       SELECT 1 FROM communities
       WHERE id = NEW.community_id
         AND created_by = NEW.user_id
         AND status = 'active'
     )
  THEN
    RETURN NEW;
  END IF;

  NEW.role := 'member';
  NEW.status := 'pending';
  NEW.approved_by := NULL;
  NEW.approved_at := NULL;
  RETURN NEW;
END;
$$;

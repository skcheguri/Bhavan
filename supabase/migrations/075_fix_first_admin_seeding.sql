-- Fixes a deadlock in 074: no community could ever get its first admin.
--
-- force_pending_membership() is a BEFORE INSERT trigger that rewrites any
-- new membership row to member/pending unless the caller is a platform
-- admin or an admin of that community. That is right for the join path --
-- it is what stops someone posting themselves in as an admin.
--
-- But seed_first_community_admin() creates its row by INSERT too, so it
-- was demoted by the same rule, and the rule cannot pass for a community
-- that has no admin yet. Verified against the live database: activating a
-- community produced role=member, status=pending for the founder, leaving
-- a community nobody could administer and no path to appointing anyone.
--
-- The exemption below is narrow on purpose. It applies only to the person
-- named in communities.created_by, only once Bhavan has reviewed the
-- community and set it active, and only while that community still has no
-- approved admin. The last condition is self-closing: the moment the row
-- lands there is an approved admin, so this can never match twice.

CREATE OR REPLACE FUNCTION public.force_pending_membership()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Someone with authority is adding a member: take the row as given.
  IF is_admin() OR is_community_admin(NEW.community_id) THEN
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

  -- Everyone else joins as a pending member, whatever they asked for.
  NEW.role := 'member';
  NEW.status := 'pending';
  NEW.approved_by := NULL;
  NEW.approved_at := NULL;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.force_pending_membership() IS
  'Join requests are always member/pending. Exceptions: an existing admin adding someone, or the founder of a newly activated community that has no admin yet.';

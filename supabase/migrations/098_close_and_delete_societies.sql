-- Closing a society, requesting its deletion, and letting Bhavan act.
--
-- Three separate things, because "delete" was hiding three different
-- wishes: a duplicate created by mistake (real erasure, and safe because
-- there is no data), a society that has stopped using Bhavan (wants the
-- notifications and the bill to stop, not the history destroyed), and a
-- wrong address (wants editing, which already works).
--
-- CLOSE is self-service and reversible. The join code stops resolving,
-- nothing new can be posted, and members keep their history. That covers
-- most of what people mean, with nobody waiting on Bhavan.
--
-- DELETE is reviewed, because a society's data is not the admin's to
-- destroy. Once Funds is in use, community_contributions holds who paid
-- what -- a financial record fifty owners have an interest in and a
-- treasurer may need at audit. One admin acting alone, or one compromised
-- admin account, should not be able to wipe that.
--
-- And there was no DELETE policy on communities at all, so until now not
-- even a Bhavan platform admin could remove a spam registration without
-- opening a SQL console.

ALTER TABLE communities DROP CONSTRAINT IF EXISTS communities_status_check;
ALTER TABLE communities ADD CONSTRAINT communities_status_check
  CHECK (status IN ('pending', 'active', 'rejected', 'closed'));

ALTER TABLE communities
  ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS deletion_requested_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deletion_reason text;

COMMENT ON COLUMN communities.deletion_requested_at IS
  'Set when a society admin asks Bhavan to delete the society. Cleared if the request is declined.';

-- "Can anything new be added here?" Closed societies are readable and
-- inert; the difference between closed and deleted is the whole point.
CREATE OR REPLACE FUNCTION public.community_is_open(p_community uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM communities WHERE id = p_community AND status = 'active');
$$;

GRANT EXECUTE ON FUNCTION public.community_is_open(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- Closing actually has to close things
--
-- Without adding this to every write path, "closed" would be a label on a
-- society that still accepted issues, notices and money -- which is worse
-- than no feature at all, because an admin would believe it was shut.
-- ---------------------------------------------------------------------

DROP POLICY IF EXISTS "Paid members raise tickets" ON community_tickets;
CREATE POLICY "Paid members raise tickets" ON community_tickets
  FOR INSERT TO authenticated
  WITH CHECK (
    raised_by = auth.uid()
    AND is_community_member(community_id)
    AND community_is_paid(community_id)
    AND community_is_open(community_id)
  );

DROP POLICY IF EXISTS "Admins post announcements" ON community_announcements;
CREATE POLICY "Admins post announcements" ON community_announcements
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND is_community_admin(community_id)
    AND community_is_open(community_id)
  );

DROP POLICY IF EXISTS "Paid admins start collections" ON community_collections;
CREATE POLICY "Paid admins start collections" ON community_collections
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND is_community_admin(community_id)
    AND community_is_paid(community_id)
    AND community_is_open(community_id)
  );

DROP POLICY IF EXISTS "Members record their own payment" ON community_contributions;
CREATE POLICY "Members record their own payment" ON community_contributions
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND is_community_member(collection_community(collection_id))
    AND community_is_open(collection_community(collection_id))
  );

DROP POLICY IF EXISTS "Paid members comment" ON community_ticket_comments;
CREATE POLICY "Paid members comment" ON community_ticket_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND is_community_member(ticket_community(ticket_id))
    AND community_is_paid(ticket_community(ticket_id))
    AND community_is_open(ticket_community(ticket_id))
  );

-- Joining is already impossible in practice, since find_community_by_code
-- only returns active societies -- but somebody holding an old id should
-- not get in through the back door either.
DROP POLICY IF EXISTS "Verified owners can request to join" ON community_members;
CREATE POLICY "Verified owners can request to join" ON community_members
  FOR INSERT TO authenticated
  WITH CHECK (
    (user_id = auth.uid() AND is_verified_owner(auth.uid()) AND community_is_open(community_id))
    OR is_community_admin(community_id)
    OR is_admin()
  );

-- ---------------------------------------------------------------------
-- What a society admin may change about the society itself
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_community_status()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- A society admin may close their society and reopen it. Everything
    -- else -- approving, rejecting, resurrecting a rejected registration
    -- -- is Bhavan's, or the review queue would mean nothing.
    IF NOT (
      (OLD.status = 'active' AND NEW.status = 'closed')
      OR (OLD.status = 'closed' AND NEW.status = 'active')
    ) THEN
      RAISE EXCEPTION 'Only Bhavan can change a society from % to %', OLD.status, NEW.status;
    END IF;
  END IF;

  -- Approval fields belong to the reviewer.
  IF NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
     OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
     OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason THEN
    RAISE EXCEPTION 'Review details are set by the reviewer';
  END IF;

  -- The join code is generated, never chosen: a society admin picking
  -- their own could collide with, or deliberately squat, another one.
  IF NEW.join_code IS DISTINCT FROM OLD.join_code THEN
    RAISE EXCEPTION 'The join code cannot be changed';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_community_status ON communities;
CREATE TRIGGER trg_guard_community_status
  BEFORE UPDATE ON communities
  FOR EACH ROW EXECUTE FUNCTION guard_community_status();

-- ---------------------------------------------------------------------
-- Deletion: requested by a society admin, carried out by Bhavan
-- ---------------------------------------------------------------------

CREATE POLICY "Bhavan deletes societies" ON communities
  FOR DELETE TO authenticated
  USING (is_admin());

-- Tell the platform admins there is something to look at. They have no
-- other channel -- everything else in the admin panel is a count they
-- have to go and look for.
CREATE OR REPLACE FUNCTION public.notify_deletion_request()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.deletion_requested_at IS NOT NULL
     AND OLD.deletion_requested_at IS NULL THEN
    BEGIN
      INSERT INTO notifications (user_id, type, title, message, action_url)
      SELECT u.id, 'platform', 'Society deletion requested',
             NEW.name || ' has asked to be deleted.'
               || coalesce(' Reason: ' || NEW.deletion_reason, ''),
             '/admin/societies'
      FROM users u
      WHERE u.role = 'admin';
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'deletion request notification failed: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_deletion_request ON communities;
CREATE TRIGGER trg_notify_deletion_request
  AFTER UPDATE ON communities
  FOR EACH ROW EXECUTE FUNCTION notify_deletion_request();

-- What Bhavan needs on screen before deciding.
--
-- Deliberately includes the money. "Is the group inactive" is the wrong
-- question on its own: a forty-flat society that moved to another app
-- legitimately wants out, and refusing them means they abandon the group
-- instead -- so Bhavan keeps their data forever AND they keep getting
-- notified. Confirmed contributions are the thing that should actually
-- give a reviewer pause.
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
  IF NOT is_admin() THEN
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

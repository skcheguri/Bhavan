-- Vendors a society already uses, and assigning an issue to one.
--
-- The problem this solves is not "find me a plumber". Societies know
-- their plumber; "our regular guy" is a real institution and no app is
-- going to displace him. Tickets hang because nothing records what
-- happened after someone was called: who was contacted, when, did they
-- turn up, is it fixed. That is a record-keeping gap wearing a
-- marketplace costume.
--
-- So: NO vendor accounts, no login, no fourth role. A vendor here is a
-- name, a trade and a phone number that an admin keeps in a list. The app
-- puts that name on the ticket and offers to dial it. The admin still
-- moves the status.
--
-- The obvious next step -- a tokenised link letting the vendor update the
-- ticket himself, still with no account -- is deliberately not built yet.
-- It is worth doing once a real society has chased a real plumber through
-- this and shown where it actually hurts.

CREATE TABLE IF NOT EXISTS service_vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  name text NOT NULL,
  -- Same vocabulary as community_tickets.category, so "who do we call for
  -- a lift problem" is a filter rather than a second taxonomy to maintain
  -- and keep in sync.
  trade text NOT NULL DEFAULT 'other'
    CHECK (trade IN ('lift', 'water', 'electricity', 'security', 'parking', 'cleaning', 'common_area', 'other')),
  phone text NOT NULL,
  notes text,
  -- Kept rather than deleted when a society stops using someone: old
  -- tickets still name them, and history should not rewrite itself.
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_vendors_community
  ON service_vendors (community_id, active, trade);

ALTER TABLE service_vendors ENABLE ROW LEVEL SECURITY;

-- Every member can see the list, including the phone number. This is a
-- tradesman's business line that the society already circulates, not
-- personal contact data -- and a member who can see that the lift is
-- assigned to Ramesh can usefully call Ramesh.
DROP POLICY IF EXISTS "Members read vendors" ON service_vendors;
CREATE POLICY "Members read vendors" ON service_vendors
  FOR SELECT TO authenticated
  USING (is_community_member(community_id) OR is_admin());

-- Managing the list is part of the paid maintenance tooling, consistent
-- with raising an issue.
DROP POLICY IF EXISTS "Paid admins add vendors" ON service_vendors;
CREATE POLICY "Paid admins add vendors" ON service_vendors
  FOR INSERT TO authenticated
  WITH CHECK (is_community_admin(community_id) AND community_is_paid(community_id));

DROP POLICY IF EXISTS "Admins manage vendors" ON service_vendors;
CREATE POLICY "Admins manage vendors" ON service_vendors
  FOR UPDATE TO authenticated
  USING (is_community_admin(community_id) OR is_admin())
  WITH CHECK (is_community_admin(community_id) OR is_admin());

DROP POLICY IF EXISTS "Admins remove vendors" ON service_vendors;
CREATE POLICY "Admins remove vendors" ON service_vendors
  FOR DELETE TO authenticated
  USING (is_community_admin(community_id) OR is_admin());

-- ---------------------------------------------------------------------
-- Assignment
-- ---------------------------------------------------------------------

ALTER TABLE community_tickets
  ADD COLUMN IF NOT EXISTS assigned_vendor_id uuid REFERENCES service_vendors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz;

-- 'assigned' sits between open and in_progress: somebody has been called,
-- but nobody has started. Collapsing it into in_progress would lose the
-- distinction that matters most when chasing -- "we rang him" versus "he
-- is here".
ALTER TABLE community_tickets DROP CONSTRAINT IF EXISTS community_tickets_status_check;
ALTER TABLE community_tickets ADD CONSTRAINT community_tickets_status_check
  CHECK (status IN ('open', 'assigned', 'acknowledged', 'in_progress', 'resolved'));

-- Assigning is an admin action, like changing status. Without this, the
-- raiser could edit their own ticket to name a vendor and it would read as
-- though the committee had arranged it.
CREATE OR REPLACE FUNCTION public.guard_community_ticket_changes()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR is_admin() OR is_community_admin(NEW.community_id) THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Only a society admin can change a ticket''s status';
  END IF;
  IF NEW.admin_notes IS DISTINCT FROM OLD.admin_notes THEN
    RAISE EXCEPTION 'Only a society admin can add notes to a ticket';
  END IF;
  IF NEW.assigned_vendor_id IS DISTINCT FROM OLD.assigned_vendor_id THEN
    RAISE EXCEPTION 'Only a society admin can assign this to someone';
  END IF;
  IF NEW.resolved_at IS DISTINCT FROM OLD.resolved_at THEN
    RAISE EXCEPTION 'Only a society admin can resolve a ticket';
  END IF;
  IF NEW.community_id IS DISTINCT FROM OLD.community_id
     OR NEW.raised_by IS DISTINCT FROM OLD.raised_by THEN
    RAISE EXCEPTION 'A ticket cannot be moved to another society or owner';
  END IF;

  RETURN NEW;
END;
$$;

-- Stamp the assignment date from the assignment itself, so "assigned" and
-- "assigned at" cannot disagree -- same reasoning as resolved_at.
CREATE OR REPLACE FUNCTION public.stamp_ticket_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  IF NEW.assigned_vendor_id IS DISTINCT FROM OLD.assigned_vendor_id THEN
    NEW.assigned_at := CASE WHEN NEW.assigned_vendor_id IS NULL THEN NULL ELSE now() END;

    -- Assigning an untouched issue advances it, because leaving a ticket
    -- "open" after ringing somebody is exactly the hanging this feature
    -- exists to stop. An admin who has already moved it further is left
    -- alone.
    IF NEW.assigned_vendor_id IS NOT NULL AND NEW.status = 'open' THEN
      NEW.status := 'assigned';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_ticket_assignment ON community_tickets;
CREATE TRIGGER trg_stamp_ticket_assignment
  BEFORE UPDATE ON community_tickets
  FOR EACH ROW EXECUTE FUNCTION stamp_ticket_assignment();

-- Tell the person who reported it that somebody is now on it. Wrapped,
-- per 080: a failed notification must not undo the assignment.
CREATE OR REPLACE FUNCTION public.notify_ticket_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_vendor text;
BEGIN
  IF NEW.assigned_vendor_id IS DISTINCT FROM OLD.assigned_vendor_id
     AND NEW.assigned_vendor_id IS NOT NULL THEN
    BEGIN
      SELECT name INTO v_vendor FROM service_vendors WHERE id = NEW.assigned_vendor_id;

      INSERT INTO notifications (user_id, type, title, message, action_url)
      VALUES (
        NEW.raised_by, 'maintenance',
        'Someone is on it',
        '"' || NEW.title || '" has been assigned to ' || coalesce(v_vendor, 'a contractor') || '.',
        '/society'
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'assignment notification failed: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_ticket_assignment ON community_tickets;
CREATE TRIGGER trg_notify_ticket_assignment
  AFTER UPDATE ON community_tickets
  FOR EACH ROW EXECUTE FUNCTION notify_ticket_assignment();

-- ---------------------------------------------------------------------
-- The ticket list carries the assignee, so the answer to "who is dealing
-- with this" is on the card rather than a tap away.
-- ---------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.get_community_tickets(uuid, integer, integer);

CREATE FUNCTION public.get_community_tickets(
  p_community uuid,
  p_limit integer DEFAULT 200,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid,
  community_id uuid,
  raised_by uuid,
  category text,
  title text,
  description text,
  location text,
  priority text,
  status text,
  images text[],
  admin_notes text,
  resolved_at timestamptz,
  created_at timestamptz,
  raised_by_name text,
  raised_by_units text[],
  assigned_vendor_id uuid,
  assigned_vendor_name text,
  assigned_vendor_phone text,
  assigned_vendor_trade text,
  assigned_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public
AS $$
BEGIN
  IF NOT (is_community_member(p_community) OR is_admin()) THEN
    RAISE EXCEPTION 'You are not a member of this society';
  END IF;

  RETURN QUERY
  SELECT t.id, t.community_id, t.raised_by, t.category, t.title, t.description,
         t.location, t.priority, t.status, t.images, t.admin_notes,
         t.resolved_at, t.created_at,
         u.name,
         coalesce(m.unit_numbers, '{}'),
         t.assigned_vendor_id, v.name, v.phone, v.trade, t.assigned_at,
         count(*) OVER () AS total_count
  FROM community_tickets t
  JOIN users u ON u.id = t.raised_by
  LEFT JOIN community_members m
    ON m.community_id = t.community_id AND m.user_id = t.raised_by
  LEFT JOIN service_vendors v ON v.id = t.assigned_vendor_id
  WHERE t.community_id = p_community
  ORDER BY
    CASE t.status WHEN 'resolved' THEN 1 ELSE 0 END,
    CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
    t.created_at DESC
  LIMIT greatest(p_limit, 1) OFFSET greatest(p_offset, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_community_tickets(uuid, integer, integer) TO authenticated;

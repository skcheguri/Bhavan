-- Phase 2: announcements and building maintenance tickets.
--
-- Where the free/paid line sits, and why:
--
--   Free   the group itself -- join codes, the owner directory, admins,
--          and announcements. A society that does nothing until someone
--          pays is a society nobody finishes setting up, and the admin
--          cannot demonstrate value to the other owners before asking
--          them to fund it. Announcements are cheap and are the thing
--          that gets everyone to actually join.
--
--   Paid   maintenance tickets. This is the operational tool -- a shared
--          record of what is broken in the building, who is on it, and
--          when it was fixed. It is what a managing committee would
--          otherwise pay for, and it is enforced in RLS, not in React.
--
-- The subscription is per building and all-inclusive: once an admin pays,
-- every verified member gets tickets at no extra cost. That is why the
-- entitlement check is community_is_paid(community_id) and never anything
-- about the individual user.

-- ---------------------------------------------------------------------
-- Announcements
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS community_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_announcements_community
  ON community_announcements (community_id, pinned DESC, created_at DESC);

-- ---------------------------------------------------------------------
-- Maintenance tickets
--
-- Deliberately separate from maintenance_requests. That table is a tenant
-- telling their own landlord about their own flat, scoped by agreement_id
-- and owner_id. This is an owner reporting the lift, the water pump or the
-- gate -- shared property, no landlord, visible to the whole building.
-- Overloading one table would have meant every RLS policy on it growing a
-- branch for a completely different relationship.
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS community_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  raised_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT 'other'
    CHECK (category IN ('lift', 'water', 'electricity', 'security', 'parking', 'cleaning', 'common_area', 'other')),
  title text NOT NULL,
  description text NOT NULL,
  location text,
  priority text NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high')),
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'acknowledged', 'in_progress', 'resolved')),
  images text[] NOT NULL DEFAULT '{}',
  admin_notes text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tickets_community
  ON community_tickets (community_id, status, created_at DESC);

-- ---------------------------------------------------------------------
-- Field guards
--
-- RLS grants a row, not a column. Without these, letting someone edit a
-- typo in their own ticket would also let them mark it resolved and write
-- the committee's notes. Same reasoning as migrations 049 and 074.
-- ---------------------------------------------------------------------

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

DROP TRIGGER IF EXISTS trg_guard_community_ticket_changes ON community_tickets;
CREATE TRIGGER trg_guard_community_ticket_changes
  BEFORE UPDATE ON community_tickets
  FOR EACH ROW EXECUTE FUNCTION guard_community_ticket_changes();

-- Stamp resolved_at from the status rather than trusting a client to send
-- a matching pair, so "resolved" and "resolved at" can never disagree.
CREATE OR REPLACE FUNCTION public.stamp_ticket_resolution()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'resolved' AND (OLD.status IS DISTINCT FROM 'resolved') THEN
    NEW.resolved_at := now();
  ELSIF NEW.status <> 'resolved' THEN
    NEW.resolved_at := NULL;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_ticket_resolution ON community_tickets;
CREATE TRIGGER trg_stamp_ticket_resolution
  BEFORE UPDATE ON community_tickets
  FOR EACH ROW EXECUTE FUNCTION stamp_ticket_resolution();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------

ALTER TABLE community_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_tickets ENABLE ROW LEVEL SECURITY;

-- Announcements: every approved member reads, only admins write.
DROP POLICY IF EXISTS "Members read announcements" ON community_announcements;
CREATE POLICY "Members read announcements" ON community_announcements
  FOR SELECT TO authenticated
  USING (is_community_member(community_id) OR is_admin());

DROP POLICY IF EXISTS "Admins post announcements" ON community_announcements;
CREATE POLICY "Admins post announcements" ON community_announcements
  FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND is_community_admin(community_id));

DROP POLICY IF EXISTS "Admins edit announcements" ON community_announcements;
CREATE POLICY "Admins edit announcements" ON community_announcements
  FOR UPDATE TO authenticated
  USING (is_community_admin(community_id))
  WITH CHECK (is_community_admin(community_id));

DROP POLICY IF EXISTS "Admins delete announcements" ON community_announcements;
CREATE POLICY "Admins delete announcements" ON community_announcements
  FOR DELETE TO authenticated
  USING (is_community_admin(community_id));

-- Tickets: the whole building reads them -- that is the point, it stops
-- five owners reporting the same broken lift. Raising one is the paid
-- action, and community_is_paid() is the only thing standing between a
-- free society and the feature.
DROP POLICY IF EXISTS "Members read tickets" ON community_tickets;
CREATE POLICY "Members read tickets" ON community_tickets
  FOR SELECT TO authenticated
  USING (is_community_member(community_id) OR is_admin());

DROP POLICY IF EXISTS "Paid members raise tickets" ON community_tickets;
CREATE POLICY "Paid members raise tickets" ON community_tickets
  FOR INSERT TO authenticated
  WITH CHECK (
    raised_by = auth.uid()
    AND is_community_member(community_id)
    AND community_is_paid(community_id)
  );

-- The raiser may fix their own wording; the guard trigger stops that
-- turning into editing status or the committee's notes.
DROP POLICY IF EXISTS "Raiser and admins update tickets" ON community_tickets;
CREATE POLICY "Raiser and admins update tickets" ON community_tickets
  FOR UPDATE TO authenticated
  USING (raised_by = auth.uid() OR is_community_admin(community_id) OR is_admin())
  WITH CHECK (raised_by = auth.uid() OR is_community_admin(community_id) OR is_admin());

DROP POLICY IF EXISTS "Raiser and admins delete tickets" ON community_tickets;
CREATE POLICY "Raiser and admins delete tickets" ON community_tickets
  FOR DELETE TO authenticated
  USING (raised_by = auth.uid() OR is_community_admin(community_id) OR is_admin());

-- ---------------------------------------------------------------------
-- Notifications
--
-- Every insert below is wrapped so a notification failure cannot abort the
-- action that triggered it. Migration 070 shipped a trigger that violated
-- the notifications type CHECK, and because an AFTER INSERT trigger runs
-- in the same transaction, it took down chat entirely -- messages could
-- not be sent at all. An announcement that nobody is told about is a bug;
-- an announcement that cannot be posted is an outage.
--
-- Types are drawn from the existing CHECK constraint: 'platform' and
-- 'maintenance'. Do not invent a new one here without altering it first.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notify_community_announcement()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_name text;
BEGIN
  BEGIN
    SELECT name INTO v_name FROM communities WHERE id = NEW.community_id;

    INSERT INTO notifications (user_id, type, title, message, action_url)
    SELECT m.user_id, 'platform', NEW.title,
           coalesce(v_name, 'Your society') || ': ' || left(NEW.body, 140),
           '/society'
    FROM community_members m
    WHERE m.community_id = NEW.community_id
      AND m.status = 'approved'
      AND m.user_id <> NEW.author_id;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'announcement notification failed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_community_announcement ON community_announcements;
CREATE TRIGGER trg_notify_community_announcement
  AFTER INSERT ON community_announcements
  FOR EACH ROW EXECUTE FUNCTION notify_community_announcement();

CREATE OR REPLACE FUNCTION public.notify_community_ticket()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  BEGIN
    INSERT INTO notifications (user_id, type, title, message, action_url)
    SELECT m.user_id, 'maintenance', 'New maintenance issue',
           NEW.title || ' — reported in your society',
           '/society'
    FROM community_members m
    WHERE m.community_id = NEW.community_id
      AND m.status = 'approved'
      AND m.role = 'admin'
      AND m.user_id <> NEW.raised_by;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'ticket notification failed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_community_ticket ON community_tickets;
CREATE TRIGGER trg_notify_community_ticket
  AFTER INSERT ON community_tickets
  FOR EACH ROW EXECUTE FUNCTION notify_community_ticket();

-- Tell the person who reported it when something actually happens.
CREATE OR REPLACE FUNCTION public.notify_ticket_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    BEGIN
      INSERT INTO notifications (user_id, type, title, message, action_url)
      VALUES (
        NEW.raised_by, 'maintenance',
        'Update on "' || NEW.title || '"',
        'Marked ' || replace(NEW.status, '_', ' ') || ' by your society admin.',
        '/society'
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'ticket status notification failed: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_ticket_status_change ON community_tickets;
CREATE TRIGGER trg_notify_ticket_status_change
  AFTER UPDATE ON community_tickets
  FOR EACH ROW EXECUTE FUNCTION notify_ticket_status_change();

-- ---------------------------------------------------------------------
-- Ticket author names, same problem and same solution as migration 078:
-- the list needs a name against each row and users is not readable.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_community_tickets(p_community uuid)
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
  raised_by_units text[]
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
         coalesce(m.unit_numbers, '{}')
  FROM community_tickets t
  JOIN users u ON u.id = t.raised_by
  LEFT JOIN community_members m
    ON m.community_id = t.community_id AND m.user_id = t.raised_by
  WHERE t.community_id = p_community
  ORDER BY
    CASE t.status WHEN 'resolved' THEN 1 ELSE 0 END,
    CASE t.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
    t.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_community_tickets(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_community_announcements(p_community uuid)
RETURNS TABLE (
  id uuid,
  community_id uuid,
  author_id uuid,
  title text,
  body text,
  pinned boolean,
  created_at timestamptz,
  author_name text
)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public
AS $$
BEGIN
  IF NOT (is_community_member(p_community) OR is_admin()) THEN
    RAISE EXCEPTION 'You are not a member of this society';
  END IF;

  RETURN QUERY
  SELECT a.id, a.community_id, a.author_id, a.title, a.body, a.pinned,
         a.created_at, u.name
  FROM community_announcements a
  JOIN users u ON u.id = a.author_id
  WHERE a.community_id = p_community
  ORDER BY a.pinned DESC, a.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_community_announcements(uuid) TO authenticated;

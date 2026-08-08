-- Comments on society maintenance tickets.
--
-- The conversation a building actually needs is "water is out in B block
-- too" or "plumber came Tuesday, waiting on a part" -- attached to the
-- thing it is about, rather than scrolling away in a group chat. It also
-- self-archives: when the ticket resolves, the discussion stops being
-- something anyone has to wade through.
--
-- Two lift tickets were opened in Satyam Towers within minutes of each
-- other and there was no way to say "same problem, other block". That is
-- the gap this fills.

CREATE TABLE IF NOT EXISTS community_ticket_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES community_tickets(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(trim(body)) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket
  ON community_ticket_comments (ticket_id, created_at ASC);

-- Which society a ticket belongs to, as a SECURITY DEFINER lookup.
--
-- The policies below need this. Putting a bare subquery over
-- community_tickets inside a policy would make that table's own RLS
-- evaluate inside every check on this one -- workable, but it couples two
-- policy sets together in a way that is hard to reason about later. A
-- definer function answers the one question asked and nothing more.
CREATE OR REPLACE FUNCTION public.ticket_community(p_ticket uuid)
RETURNS uuid
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT community_id FROM community_tickets WHERE id = p_ticket;
$$;

GRANT EXECUTE ON FUNCTION public.ticket_community(uuid) TO authenticated;

ALTER TABLE community_ticket_comments ENABLE ROW LEVEL SECURITY;

-- Reading follows the ticket: if you can see the issue, you can see the
-- discussion about it. Anything else produces a thread with holes in it.
DROP POLICY IF EXISTS "Members read ticket comments" ON community_ticket_comments;
CREATE POLICY "Members read ticket comments" ON community_ticket_comments
  FOR SELECT TO authenticated
  USING (is_community_member(ticket_community(ticket_id)) OR is_admin());

-- Commenting is a paid action, like raising the ticket in the first place.
-- A society whose plan has lapsed keeps the full history to read; it just
-- cannot add to it. Deliberately consistent with tickets rather than
-- kinder -- a rule that is "writing is paid, except sometimes" is a rule
-- nobody can predict.
DROP POLICY IF EXISTS "Paid members comment" ON community_ticket_comments;
CREATE POLICY "Paid members comment" ON community_ticket_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND is_community_member(ticket_community(ticket_id))
    AND community_is_paid(ticket_community(ticket_id))
  );

-- Delete your own, or any comment in a society you administer. That is
-- the whole moderation story on purpose: it stays inside the building
-- instead of becoming a platform-level queue for one operator to work.
DROP POLICY IF EXISTS "Authors and admins delete comments" ON community_ticket_comments;
CREATE POLICY "Authors and admins delete comments" ON community_ticket_comments
  FOR DELETE TO authenticated
  USING (
    author_id = auth.uid()
    OR is_community_admin(ticket_community(ticket_id))
    OR is_admin()
  );

-- No UPDATE policy at all. An edited comment in a thread other people have
-- already replied to rewrites a conversation after the fact; deleting and
-- posting again is honest about what happened.

-- ---------------------------------------------------------------------
-- Notifications
--
-- Wrapped, for the reason recorded in 080: an AFTER INSERT trigger that
-- raises takes down the action that fired it. A comment nobody is told
-- about is a bug; a comment that cannot be posted is an outage.
--
-- Who hears about it: the person who raised the issue, plus the society's
-- admins, minus whoever is commenting. Not every member -- a building of
-- 200 owners does not want a notification for each reply about a lift.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notify_ticket_comment()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_title text;
  v_community uuid;
  v_raiser uuid;
BEGIN
  BEGIN
    SELECT title, community_id, raised_by
      INTO v_title, v_community, v_raiser
      FROM community_tickets WHERE id = NEW.ticket_id;

    INSERT INTO notifications (user_id, type, title, message, action_url)
    SELECT DISTINCT m.user_id, 'maintenance',
           'New comment on "' || v_title || '"',
           left(NEW.body, 140),
           '/society'
    FROM community_members m
    WHERE m.community_id = v_community
      AND m.status = 'approved'
      AND m.user_id <> NEW.author_id
      AND (m.role = 'admin' OR m.user_id = v_raiser);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'ticket comment notification failed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_ticket_comment ON community_ticket_comments;
CREATE TRIGGER trg_notify_ticket_comment
  AFTER INSERT ON community_ticket_comments
  FOR EACH ROW EXECUTE FUNCTION notify_ticket_comment();

-- Author names, same problem and same solution as 078: the thread needs a
-- name against each line and users is not readable by co-members.
CREATE OR REPLACE FUNCTION public.get_ticket_comments(p_ticket uuid)
RETURNS TABLE (
  id uuid,
  ticket_id uuid,
  author_id uuid,
  body text,
  created_at timestamptz,
  author_name text,
  author_avatar text,
  author_units text[]
)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public
AS $$
DECLARE
  v_community uuid := ticket_community(p_ticket);
BEGIN
  IF v_community IS NULL THEN
    RAISE EXCEPTION 'No such issue';
  END IF;
  IF NOT (is_community_member(v_community) OR is_admin()) THEN
    RAISE EXCEPTION 'You are not a member of this society';
  END IF;

  RETURN QUERY
  SELECT c.id, c.ticket_id, c.author_id, c.body, c.created_at,
         u.name, u.avatar_url, coalesce(m.unit_numbers, '{}')
  FROM community_ticket_comments c
  JOIN users u ON u.id = c.author_id
  LEFT JOIN community_members m
    ON m.community_id = v_community AND m.user_id = c.author_id
  WHERE c.ticket_id = p_ticket
  ORDER BY c.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ticket_comments(uuid) TO authenticated;

-- 104: stop the escalation ladder chasing the same issue with the same words
--
-- Observed on this database: one request, "lock not working", produced
-- three identical "A tenant is waiting" notifications -- 23:26, 23:27
-- and 00:15. All three are stage 0, so the ladder had been reset to the
-- bottom between each. Meanwhile "switch not working", which nobody
-- touched, climbed to stage 2 and stopped, exactly as intended.
--
-- Two faults in reset_ticket_escalation, which fires on any change of
-- status or assignment:
--
--   1. It resets on every status change, including forward ones. An
--      owner who marks an issue in_progress -- that is, who is doing the
--      work -- sends the ladder back to stage 0, so the next run chases
--      them again from the beginning. Acting on something should stop
--      the chasing, not restart it.
--
--   2. It clears escalated_at along with the stage, which throws away
--      the one-hour spacing 097 added. That is why two of the three
--      arrived 90 seconds apart: after a reset there is nothing left to
--      say "you were just chased about this".
--
-- The fix keeps resetting -- an issue that genuinely goes back to
-- untouched should be chased again -- but only on the way backwards, and
-- never at the cost of the spacing.

CREATE OR REPLACE FUNCTION public.reset_ticket_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public
AS $$
DECLARE
  v_idle boolean;
  v_was_idle boolean;
BEGIN
  -- "Idle" means nobody has picked this up: no vendor, and a status that
  -- says nothing has started. The escalation runner chases exactly these.
  IF TG_TABLE_NAME = 'community_tickets' THEN
    v_idle := NEW.assigned_vendor_id IS NULL AND NEW.status = 'open';
    v_was_idle := OLD.assigned_vendor_id IS NULL AND OLD.status = 'open';
  ELSE
    v_idle := NEW.assigned_vendor_id IS NULL AND NEW.status = 'pending';
    v_was_idle := OLD.assigned_vendor_id IS NULL AND OLD.status = 'pending';
  END IF;

  -- Only a fall back into idle restarts the ladder. Going the other way
  -- -- acknowledged, in progress, assigned, resolved -- leaves the stage
  -- alone, so returning to this issue later resumes where the chasing
  -- left off instead of starting over.
  IF v_idle AND NOT v_was_idle THEN
    NEW.escalation_stage := 0;
    -- escalated_at deliberately left as it was. The stage says how far
    -- up the ladder we are; escalated_at says when this person was last
    -- disturbed, and that is true regardless of what the status did.
  END IF;

  RETURN NEW;
END;
$$;

-- Belt and braces: never send somebody the same sentence twice in the
-- spacing window, whatever the ladder thinks. A duplicate notification
-- costs more than a missed one here -- it is how a useful alert teaches
-- people to ignore the app.
CREATE OR REPLACE FUNCTION public.run_maintenance_escalation()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  r record;
  sent integer := 0;
  v_title text;
  v_message text;
  spacing CONSTANT interval := interval '1 hour';
BEGIN
  FOR r IN
    SELECT t.id, t.title, t.community_id, t.escalation_stage
    FROM community_tickets t
    WHERE t.status IN ('open', 'assigned')
      AND t.assigned_vendor_id IS NULL
      AND t.escalation_stage < 2
      AND (t.escalated_at IS NULL OR t.escalated_at < now() - spacing)
      AND t.created_at < now() - (
        CASE WHEN t.priority = 'high' THEN interval '4 hours' ELSE interval '24 hours' END
        * (t.escalation_stage + 1)
      )
  LOOP
    BEGIN
      v_title := CASE WHEN r.escalation_stage = 0
                      THEN 'Still waiting on someone'
                      ELSE 'This has been open a while' END;
      v_message := '"' || r.title || '" has nobody assigned yet.';

      INSERT INTO notifications (user_id, type, title, message, action_url)
      SELECT m.user_id, 'maintenance', v_title, v_message, '/society'
      FROM community_members m
      WHERE m.community_id = r.community_id
        AND m.status = 'approved'
        AND m.role = 'admin'
        AND NOT EXISTS (
          SELECT 1 FROM notifications n
          WHERE n.user_id = m.user_id
            AND n.type = 'maintenance'
            AND n.title = v_title
            AND n.message = v_message
            AND n.created_at > now() - spacing
        );

      UPDATE community_tickets
         SET escalation_stage = r.escalation_stage + 1,
             escalated_at = now(),
             updated_at = now()
       WHERE id = r.id;

      sent := sent + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'ticket escalation failed for %: %', r.id, SQLERRM;
    END;
  END LOOP;

  FOR r IN
    SELECT q.id, q.title, q.owner_id, q.escalation_stage
    FROM maintenance_requests q
    WHERE q.status = 'pending'
      AND q.escalation_stage < 2
      AND (q.escalated_at IS NULL OR q.escalated_at < now() - spacing)
      AND q.created_at < now() - (
        CASE WHEN q.priority IN ('high', 'urgent') THEN interval '4 hours' ELSE interval '24 hours' END
        * (q.escalation_stage + 1)
      )
  LOOP
    BEGIN
      IF r.owner_id IS NOT NULL THEN
        v_title := CASE WHEN r.escalation_stage = 0
                        THEN 'A tenant is waiting'
                        ELSE 'Still unanswered' END;
        v_message := '"' || r.title || '" has not been acknowledged yet.';

        INSERT INTO notifications (user_id, type, title, message, action_url)
        SELECT r.owner_id, 'maintenance', v_title, v_message, '/owner-profile?tab=requests'
        WHERE NOT EXISTS (
          SELECT 1 FROM notifications n
          WHERE n.user_id = r.owner_id
            AND n.type = 'maintenance'
            AND n.title = v_title
            AND n.message = v_message
            AND n.created_at > now() - spacing
        );
      END IF;

      UPDATE maintenance_requests
         SET escalation_stage = r.escalation_stage + 1,
             escalated_at = now(),
             updated_at = now()
       WHERE id = r.id;

      sent := sent + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'request escalation failed for %: %', r.id, SQLERRM;
    END;
  END LOOP;

  RETURN sent;
END;
$fn$;

-- Space escalations at least an hour apart.
--
-- 096 chose when to chase from the issue's age: escalate once it is older
-- than the interval, twice once it is older than double. That is right for
-- anything raised after the feature ships and wrong for everything already
-- in the table, because a fortnight-old request satisfies both thresholds
-- at once and burns through its entire escalation ladder in consecutive
-- runs.
--
-- Observed on real data: two requests from 27 July went stage 0 to 2 in
-- two runs a minute apart, so their owner would have received both chases
-- effectively together. On first deployment to a society with a backlog
-- that is a burst of notifications, which is exactly how a useful alert
-- teaches people to ignore the app.

ALTER TABLE community_tickets
  ADD COLUMN IF NOT EXISTS escalated_at timestamptz;

ALTER TABLE maintenance_requests
  ADD COLUMN IF NOT EXISTS escalated_at timestamptz;

CREATE OR REPLACE FUNCTION public.run_maintenance_escalation()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  r record;
  sent integer := 0;
  -- Long enough that a backlog drains over hours rather than minutes,
  -- short enough that it never delays a genuine second chase.
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
      INSERT INTO notifications (user_id, type, title, message, action_url)
      SELECT m.user_id, 'maintenance',
             CASE WHEN r.escalation_stage = 0
                  THEN 'Still waiting on someone'
                  ELSE 'This has been open a while' END,
             '"' || r.title || '" has nobody assigned yet.',
             '/society'
      FROM community_members m
      WHERE m.community_id = r.community_id
        AND m.status = 'approved'
        AND m.role = 'admin';

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
        INSERT INTO notifications (user_id, type, title, message, action_url)
        VALUES (
          r.owner_id, 'maintenance',
          CASE WHEN r.escalation_stage = 0
               THEN 'A tenant is waiting'
               ELSE 'Still unanswered' END,
          '"' || r.title || '" has not been acknowledged yet.',
          '/owner-profile?tab=requests'
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

-- The reset trigger clears the clock as well as the stage, so an issue
-- that is assigned and later unassigned starts its chase over rather than
-- resuming mid-ladder.
CREATE OR REPLACE FUNCTION public.reset_ticket_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  IF NEW.assigned_vendor_id IS DISTINCT FROM OLD.assigned_vendor_id
     OR NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.escalation_stage := 0;
    NEW.escalated_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

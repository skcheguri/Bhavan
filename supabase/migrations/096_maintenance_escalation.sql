-- Chase issues nobody has picked up.
--
-- In a three-day repair, day one is often just the app being quiet: a
-- tenant reports at 9am, the owner notices at 6pm, rings at 7pm, and the
-- plumber comes tomorrow. Two of those three days had nothing to do with
-- the plumber's availability. That share of "we cannot get a technician
-- on time" is the part software can actually fix, and this is it.
--
-- Deliberately NOT a solution to supply. Nothing here adds an available
-- technician on a Sunday evening. It removes the hours lost before anyone
-- picks up the phone, which is a different and much cheaper problem.
--
-- Two reminders per issue and then silence. A daily nag trains people to
-- ignore the app, which costs more than the issue it was chasing.

ALTER TABLE community_tickets
  ADD COLUMN IF NOT EXISTS escalation_stage smallint NOT NULL DEFAULT 0;

ALTER TABLE maintenance_requests
  ADD COLUMN IF NOT EXISTS escalation_stage smallint NOT NULL DEFAULT 0;

COMMENT ON COLUMN community_tickets.escalation_stage IS
  '0 none, 1 first chase, 2 final chase. Reset when the issue is assigned or worked on.';

-- Assigning or progressing an issue clears the chase: the thing the
-- reminder was asking for has happened, and continuing to nag about it is
-- how a useful alert becomes noise people filter out.
CREATE OR REPLACE FUNCTION public.reset_ticket_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  IF NEW.assigned_vendor_id IS DISTINCT FROM OLD.assigned_vendor_id
     OR NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.escalation_stage := 0;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reset_ticket_escalation ON community_tickets;
CREATE TRIGGER trg_reset_ticket_escalation
  BEFORE UPDATE ON community_tickets
  FOR EACH ROW EXECUTE FUNCTION reset_ticket_escalation();

DROP TRIGGER IF EXISTS trg_reset_request_escalation ON maintenance_requests;
CREATE TRIGGER trg_reset_request_escalation
  BEFORE UPDATE ON maintenance_requests
  FOR EACH ROW EXECUTE FUNCTION reset_ticket_escalation();

CREATE OR REPLACE FUNCTION public.run_maintenance_escalation()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  r record;
  sent integer := 0;
BEGIN
  -- ---------------------------------------------------------------
  -- Society issues that nobody has assigned.
  --
  -- Urgent ones are chased after 4 hours, the rest after a day. An
  -- 'urgent' flag that produces the same response as everything else
  -- teaches people to mark everything urgent.
  -- ---------------------------------------------------------------
  FOR r IN
    SELECT t.id, t.title, t.community_id, t.priority, t.created_at, t.escalation_stage
    FROM community_tickets t
    WHERE t.status IN ('open', 'assigned')
      AND t.assigned_vendor_id IS NULL
      AND t.escalation_stage < 2
      AND t.created_at < now() - (
        CASE
          WHEN t.priority = 'high' THEN interval '4 hours'
          ELSE interval '24 hours'
        END * (t.escalation_stage + 1)
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
             updated_at = now()
       WHERE id = r.id;

      sent := sent + 1;
    EXCEPTION WHEN OTHERS THEN
      -- One bad row must not stop the rest of the run.
      RAISE WARNING 'ticket escalation failed for %: %', r.id, SQLERRM;
    END;
  END LOOP;

  -- ---------------------------------------------------------------
  -- Tenant requests the landlord has not acknowledged.
  --
  -- Here the trigger is the status, not the assignment: an owner without
  -- a contractor list still owes the tenant an acknowledgement, and a
  -- request sitting at 'pending' for a day is the most common complaint
  -- a tenant has about a landlord.
  -- ---------------------------------------------------------------
  FOR r IN
    SELECT q.id, q.title, q.owner_id, q.priority, q.created_at, q.escalation_stage
    FROM maintenance_requests q
    WHERE q.status = 'pending'
      AND q.escalation_stage < 2
      AND q.created_at < now() - (
        CASE
          WHEN q.priority IN ('high', 'urgent') THEN interval '4 hours'
          ELSE interval '24 hours'
        END * (q.escalation_stage + 1)
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

COMMENT ON FUNCTION public.run_maintenance_escalation() IS
  'Hourly. Chases unassigned society issues and unacknowledged tenant requests, twice each, then stops.';

-- Hourly, because a four-hour target cannot be met by a daily job. The
-- work is trivial when there is nothing to chase: two indexed scans.
SELECT cron.unschedule('maintenance-escalation')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'maintenance-escalation');

SELECT cron.schedule(
  'maintenance-escalation',
  '15 * * * *',
  $cron$SELECT run_maintenance_escalation();$cron$
);

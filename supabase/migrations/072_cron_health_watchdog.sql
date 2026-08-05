-- A watchdog over the scheduled jobs.
--
-- Three pg_cron jobs run inside Postgres and nothing notices when one
-- dies. The worst case is not the obvious one: if `check-error-rate`
-- stops, the admin dashboard simply stops showing error spikes, which is
-- indistinguishable from a quiet night. The most expensive case is
-- `expire-lapsed-subscriptions` failing, because expired Pro
-- subscriptions keep working and paid features are given away silently.
--
-- This adds a fourth job that watches the other three and raises an alert
-- through the machinery that already exists, so it lands on the admin
-- dashboard someone is already looking at.
--
-- error_rate_alerts is reused rather than duplicated -- it already has
-- acknowledgement, RLS, an index and a dashboard badge. But it cannot be
-- reused as-is: /admin/errors renders "{error_count} errors in the last N
-- minutes", which for a stalled job would read "0 errors in the last 60
-- minutes". So the table gains a `kind` and a human-readable `detail`,
-- and the UI shows `detail` for anything that is not an error-rate alert.

ALTER TABLE error_rate_alerts
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'error_rate',
  ADD COLUMN IF NOT EXISTS detail text;

ALTER TABLE error_rate_alerts DROP CONSTRAINT IF EXISTS error_rate_alerts_kind_check;
ALTER TABLE error_rate_alerts ADD CONSTRAINT error_rate_alerts_kind_check
  CHECK (kind IN ('error_rate', 'cron_stalled'));

-- Which jobs to watch, and how long each may go without a success before
-- it counts as stalled. Generous multiples of the schedule so a single
-- slow run or a restart doesn't page anyone.
CREATE OR REPLACE FUNCTION public.check_cron_health_and_alert()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  watched CONSTANT text[] := ARRAY[
    'check-error-rate',
    'purge-unconfirmed-accounts',
    'expire-lapsed-subscriptions'
  ];
  grace   CONSTANT interval[] := ARRAY[
    interval '20 minutes',   -- runs every 5 minutes
    interval '26 hours',     -- runs daily at 03:00
    interval '26 hours'      -- runs daily at 03:30
  ];
  i int;
  last_ok timestamptz;
  stalled text[] := ARRAY[]::text[];
  oldest timestamptz := now();
  existing_id uuid;
  summary text;
BEGIN
  -- cron.job_run_details is pruned by the platform. If it is empty there
  -- is nothing to judge against, and treating that as "all three jobs are
  -- dead" would fire three false alarms at once. Absence of evidence is
  -- not evidence of failure.
  IF (SELECT count(*) FROM cron.job_run_details
      WHERE start_time > now() - interval '2 days') = 0 THEN
    RETURN;
  END IF;

  FOR i IN 1 .. array_length(watched, 1) LOOP
    -- Only consider jobs that are actually registered and active; a job
    -- deliberately disabled should not alert forever.
    IF NOT EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = watched[i] AND active
    ) THEN
      CONTINUE;
    END IF;

    SELECT max(d.start_time) INTO last_ok
    FROM cron.job_run_details d
    JOIN cron.job j ON j.jobid = d.jobid
    WHERE j.jobname = watched[i] AND d.status = 'succeeded';

    IF last_ok IS NULL OR last_ok < now() - grace[i] THEN
      stalled := stalled || watched[i];
      oldest := least(oldest, COALESCE(last_ok, now() - grace[i]));
    END IF;
  END LOOP;

  IF array_length(stalled, 1) IS NULL THEN
    RETURN;
  END IF;

  summary := 'Scheduled job(s) not succeeding: ' || array_to_string(stalled, ', ')
             || '. Oldest successful run: ' || to_char(oldest, 'YYYY-MM-DD HH24:MI') || ' UTC.';

  -- One banner that refreshes, not a new row every 15 minutes -- the same
  -- behaviour chosen for error-rate alerts, for the same reason: a wall of
  -- identical alerts buries the one that matters.
  SELECT id INTO existing_id
  FROM error_rate_alerts
  WHERE kind = 'cron_stalled' AND acknowledged_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF existing_id IS NOT NULL THEN
    UPDATE error_rate_alerts
       SET window_end  = now(),
           error_count = array_length(stalled, 1),
           detail      = summary,
           created_at  = now()
     WHERE id = existing_id;
  ELSE
    INSERT INTO error_rate_alerts
      (kind, window_start, window_end, error_count, threshold_count, detail)
    VALUES
      ('cron_stalled', oldest, now(), array_length(stalled, 1), 0, summary);
  END IF;
END;
$$;

-- Every 15 minutes: responsive enough that a stalled 5-minute job is
-- noticed within a quarter hour, quiet enough not to churn.
SELECT cron.unschedule('check-cron-health')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'check-cron-health');

SELECT cron.schedule(
  'check-cron-health',
  '*/15 * * * *',
  $cron$ SELECT public.check_cron_health_and_alert(); $cron$
);

-- KNOWN LIMITATION: this cannot detect its own death. If check-cron-health
-- itself stops, nothing raises an alert. That is unavoidable without an
-- external monitor, and it is still a strict improvement -- it covers the
-- three jobs that actually do the work. The runbook's manual query
-- (INCIDENT_RESPONSE.md -> "Scheduled jobs stopped") remains the check of
-- last resort, and now has four jobs to look for rather than three.

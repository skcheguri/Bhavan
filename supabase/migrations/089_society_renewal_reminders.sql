-- Society plan renewals: warn before they lapse, and record when they do.
--
-- A society plan runs for a year and then simply stopped working. Access
-- lapsed correctly -- community_is_paid() tests current_period_end
-- directly, so the paid features switch off on the right day -- but
-- nobody was warned, and the status column stayed 'active' forever, which
-- made any report of "which societies are paying" wrong.
--
-- Two reminders, then the lapse. The reminders go to ADMINS, because they
-- are the only people who can pay. The lapse notice goes to EVERY member,
-- because that is the moment their features stop and silence reads as the
-- app being broken.

-- owner_subscriptions already uses 'expired'; community_subscriptions had
-- no such value, so a lapsed row had nowhere truthful to go.
ALTER TABLE community_subscriptions DROP CONSTRAINT IF EXISTS community_subscriptions_status_check;
ALTER TABLE community_subscriptions ADD CONSTRAINT community_subscriptions_status_check
  CHECK (status IN ('inactive', 'active', 'past_due', 'cancelled', 'expired'));

-- Which period end we last reminded about, and how far through the
-- sequence we got.
--
-- Keying on the period end rather than a date is what makes a renewal
-- reset this by itself: when a payment extends current_period_end the
-- stored value stops matching, and the society becomes un-reminded
-- without verify-society-subscription needing to know this exists.
ALTER TABLE community_subscriptions
  ADD COLUMN IF NOT EXISTS renewal_reminded_for timestamptz,
  ADD COLUMN IF NOT EXISTS renewal_reminder_stage smallint NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.run_society_renewal_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  r record;
  sent integer := 0;
BEGIN
  -- Stage 1: a fortnight out. Excludes anything already inside the
  -- three-day window, so a society that is nearly due does not receive
  -- both reminders in the same run.
  FOR r IN
    SELECT s.community_id, s.current_period_end, c.name
    FROM community_subscriptions s
    JOIN communities c ON c.id = s.community_id
    WHERE s.status = 'active'
      AND s.current_period_end IS NOT NULL
      AND s.current_period_end > now() + interval '3 days'
      AND s.current_period_end <= now() + interval '14 days'
      AND (s.renewal_reminded_for IS DISTINCT FROM s.current_period_end
           OR s.renewal_reminder_stage < 1)
  LOOP
    BEGIN
      INSERT INTO notifications (user_id, type, title, message, action_url)
      SELECT m.user_id, 'payment', 'Society plan renews soon',
             coalesce(r.name, 'Your society') || ' expires on '
               || to_char(r.current_period_end, 'DD Mon YYYY')
               || '. Renew to keep maintenance and collections open.',
             '/society'
      FROM community_members m
      WHERE m.community_id = r.community_id
        AND m.status = 'approved'
        AND m.role = 'admin';

      UPDATE community_subscriptions
         SET renewal_reminder_stage = 1,
             renewal_reminded_for = r.current_period_end,
             updated_at = now()
       WHERE community_id = r.community_id;

      sent := sent + 1;
    EXCEPTION WHEN OTHERS THEN
      -- One society with bad data must not stop the rest of the run.
      RAISE WARNING 'renewal reminder (stage 1) failed for %: %', r.community_id, SQLERRM;
    END;
  END LOOP;

  -- Stage 2: the last few days.
  FOR r IN
    SELECT s.community_id, s.current_period_end, c.name
    FROM community_subscriptions s
    JOIN communities c ON c.id = s.community_id
    WHERE s.status = 'active'
      AND s.current_period_end IS NOT NULL
      AND s.current_period_end > now()
      AND s.current_period_end <= now() + interval '3 days'
      AND (s.renewal_reminded_for IS DISTINCT FROM s.current_period_end
           OR s.renewal_reminder_stage < 2)
  LOOP
    BEGIN
      INSERT INTO notifications (user_id, type, title, message, action_url)
      SELECT m.user_id, 'payment', 'Society plan expires this week',
             coalesce(r.name, 'Your society') || ' expires on '
               || to_char(r.current_period_end, 'DD Mon YYYY')
               || '. After that, owners cannot raise maintenance issues.',
             '/society'
      FROM community_members m
      WHERE m.community_id = r.community_id
        AND m.status = 'approved'
        AND m.role = 'admin';

      UPDATE community_subscriptions
         SET renewal_reminder_stage = 2,
             renewal_reminded_for = r.current_period_end,
             updated_at = now()
       WHERE community_id = r.community_id;

      sent := sent + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'renewal reminder (stage 2) failed for %: %', r.community_id, SQLERRM;
    END;
  END LOOP;

  -- The lapse itself. Everyone hears about this one: what worked
  -- yesterday has stopped, and nobody should have to guess why.
  FOR r IN
    SELECT s.community_id, c.name
    FROM community_subscriptions s
    JOIN communities c ON c.id = s.community_id
    WHERE s.status = 'active'
      AND s.current_period_end IS NOT NULL
      AND s.current_period_end < now()
  LOOP
    BEGIN
      UPDATE community_subscriptions
         SET status = 'expired', updated_at = now()
       WHERE community_id = r.community_id;

      INSERT INTO notifications (user_id, type, title, message, action_url)
      SELECT m.user_id, 'payment', 'Society plan has expired',
             coalesce(r.name, 'Your society')
               || ' no longer has an active plan. Notices still work; '
               || 'raising maintenance issues does not until an admin renews.',
             '/society'
      FROM community_members m
      WHERE m.community_id = r.community_id
        AND m.status = 'approved';

      sent := sent + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'lapse handling failed for %: %', r.community_id, SQLERRM;
    END;
  END LOOP;

  RETURN sent;
END;
$fn$;

COMMENT ON FUNCTION public.run_society_renewal_reminders() IS
  'Daily. Warns society admins at 14 and 3 days, then marks lapsed plans expired and tells every member.';

-- 04:00, after the other daily jobs, so a renewal processed overnight is
-- already reflected before this reads current_period_end.
SELECT cron.unschedule('society-renewal-reminders')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'society-renewal-reminders');

SELECT cron.schedule(
  'society-renewal-reminders',
  '0 4 * * *',
  $cron$SELECT run_society_renewal_reminders();$cron$
);

-- ---------------------------------------------------------------------
-- The watchdog from 072 checks a hardcoded list of jobs, so a new
-- scheduled job has to be added to it or it becomes the one job nobody
-- notices has stopped. Below is that function with one entry appended to
-- each array and nothing else changed.
-- ---------------------------------------------------------------------

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
    'expire-lapsed-subscriptions',
    'society-renewal-reminders'
  ];
  grace   CONSTANT interval[] := ARRAY[
    interval '20 minutes',   -- runs every 5 minutes
    interval '26 hours',     -- runs daily at 03:00
    interval '26 hours',     -- runs daily at 03:30
    interval '26 hours'      -- runs daily at 04:00
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

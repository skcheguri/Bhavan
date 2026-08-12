-- ============================================================
-- Alert when Razorpay webhook fulfilment fails.
--
-- razorpay_webhook_events records failures durably (a fulfilment that
-- couldn't place an order, or a signature that didn't verify -- the
-- latter capped at one row/hour), but NOTHING watched those rows. A
-- captured payment we failed to fulfil, or a wrong webhook secret
-- rejecting every delivery, sat silent until a customer complained.
--
-- The table stays service-role-only on purpose (payment payloads are not
-- for signed-in users), so the alert -- not a client read policy -- is
-- how an admin learns. This reuses error_rate_alerts, exactly as the
-- cron watchdog (072) does: one refreshing banner on /admin/errors, its
-- `detail` naming the failing orders so support can act.
-- ============================================================

ALTER TABLE error_rate_alerts DROP CONSTRAINT IF EXISTS error_rate_alerts_kind_check;
ALTER TABLE error_rate_alerts ADD CONSTRAINT error_rate_alerts_kind_check
  CHECK (kind IN ('error_rate', 'cron_stalled', 'webhook_failed'));

CREATE OR REPLACE FUNCTION public.check_webhook_failures_and_alert()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fail_count integer;
  sample text;
  summary text;
  existing_id uuid;
  window_start timestamptz := now() - interval '24 hours';
BEGIN
  -- status='failed' covers both fulfilment failures and signature
  -- rejections (the webhook writes that status for both).
  SELECT count(*) INTO fail_count
  FROM razorpay_webhook_events
  WHERE status = 'failed' AND created_at > window_start;

  IF fail_count = 0 THEN
    -- Nothing failing in the window: clear any standing, unacknowledged
    -- webhook alert so a resolved problem stops showing.
    UPDATE error_rate_alerts
       SET acknowledged_at = now()
     WHERE kind = 'webhook_failed' AND acknowledged_at IS NULL;
    RETURN;
  END IF;

  -- A few representative failures for the banner -- event type + the
  -- order (if any) + the recorded error.
  SELECT string_agg(line, ' | ') INTO sample
  FROM (
    SELECT coalesce(event_type, '?')
             || coalesce(' order ' || order_id, '')
             || coalesce(': ' || left(error, 120), '') AS line
    FROM razorpay_webhook_events
    WHERE status = 'failed' AND created_at > window_start
    ORDER BY created_at DESC
    LIMIT 5
  ) s;

  summary := fail_count || ' Razorpay webhook failure(s) in the last 24h. '
             || 'Most recent: ' || coalesce(sample, 'n/a')
             || '. If EVERY delivery is a signature.rejected, RAZORPAY_WEBHOOK_SECRET is wrong.';

  SELECT id INTO existing_id
  FROM error_rate_alerts
  WHERE kind = 'webhook_failed' AND acknowledged_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF existing_id IS NOT NULL THEN
    UPDATE error_rate_alerts
       SET window_end = now(), error_count = fail_count, detail = summary, created_at = now()
     WHERE id = existing_id;
  ELSE
    INSERT INTO error_rate_alerts (kind, window_start, window_end, error_count, threshold_count, detail)
    VALUES ('webhook_failed', window_start, now(), fail_count, 0, summary);
  END IF;
END;
$$;

COMMENT ON FUNCTION public.check_webhook_failures_and_alert() IS
  'Every 30 min. Raises a webhook_failed alert on razorpay_webhook_events failures; self-clears when the window is clean.';

SELECT cron.unschedule('check-razorpay-webhook-failures')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'check-razorpay-webhook-failures');

SELECT cron.schedule(
  'check-razorpay-webhook-failures',
  '*/30 * * * *',
  $cron$SELECT check_webhook_failures_and_alert();$cron$
);

-- Add the new job to the watchdog so a stalled alerter is itself noticed
-- (same function as 089, one entry appended to each array).
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
    'society-renewal-reminders',
    'check-razorpay-webhook-failures'
  ];
  grace   CONSTANT interval[] := ARRAY[
    interval '20 minutes',   -- runs every 5 minutes
    interval '26 hours',     -- runs daily at 03:00
    interval '26 hours',     -- runs daily at 03:30
    interval '26 hours',     -- runs daily at 04:00
    interval '2 hours'       -- runs every 30 minutes
  ];
  i int;
  last_ok timestamptz;
  stalled text[] := ARRAY[]::text[];
  oldest timestamptz := now();
  existing_id uuid;
  summary text;
BEGIN
  IF (SELECT count(*) FROM cron.job_run_details
      WHERE start_time > now() - interval '2 days') = 0 THEN
    RETURN;
  END IF;

  FOR i IN 1 .. array_length(watched, 1) LOOP
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = watched[i] AND active) THEN
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

  SELECT id INTO existing_id
  FROM error_rate_alerts
  WHERE kind = 'cron_stalled' AND acknowledged_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF existing_id IS NOT NULL THEN
    UPDATE error_rate_alerts
       SET window_end = now(), error_count = array_length(stalled, 1), detail = summary, created_at = now()
     WHERE id = existing_id;
  ELSE
    INSERT INTO error_rate_alerts (kind, window_start, window_end, error_count, threshold_count, detail)
    VALUES ('cron_stalled', oldest, now(), array_length(stalled, 1), 0, summary);
  END IF;
END;
$$;

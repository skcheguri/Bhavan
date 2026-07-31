-- Migration 059's check_error_rate_and_alert() suppressed new alerts
-- while ANY unacknowledged alert existed -- correct for stopping a
-- sustained spike from writing a near-duplicate row every 5 minutes,
-- but with a bad failure mode: if nobody ever acknowledges, alerting
-- goes silent forever after the first alert.
--
-- The suppression window is now time-bounded to 24 hours. An ignored
-- alert re-raises (and re-fires the webhook, if configured) at most
-- once a day until someone acknowledges, instead of never again. The
-- flood protection is preserved because each re-raised alert is itself
-- unacknowledged and recent, suppressing further rows for the next 24h.
CREATE OR REPLACE FUNCTION check_error_rate_and_alert()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  settings error_alert_settings;
  recent_count integer;
  window_start_ts timestamptz;
  new_alert_id uuid;
  request_id bigint;
BEGIN
  SELECT * INTO settings FROM error_alert_settings WHERE id = true;
  IF settings IS NULL THEN
    RETURN NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM error_rate_alerts
    WHERE acknowledged_at IS NULL
      AND created_at > now() - interval '24 hours'
  ) THEN
    RETURN NULL;
  END IF;

  window_start_ts := now() - (settings.window_minutes || ' minutes')::interval;

  SELECT count(*) INTO recent_count
  FROM client_error_logs
  WHERE created_at >= window_start_ts;

  IF recent_count < settings.threshold_count THEN
    RETURN NULL;
  END IF;

  INSERT INTO error_rate_alerts (window_start, window_end, error_count, threshold_count)
  VALUES (window_start_ts, now(), recent_count, settings.threshold_count)
  RETURNING id INTO new_alert_id;

  IF settings.webhook_url IS NOT NULL THEN
    BEGIN
      SELECT net.http_post(
        url := settings.webhook_url,
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := jsonb_build_object(
          'text', format('Bhavan: %s client errors in the last %s minutes (threshold %s)', recent_count, settings.window_minutes, settings.threshold_count)
        )
      ) INTO request_id;
      UPDATE error_rate_alerts SET webhook_notified = true WHERE id = new_alert_id;
    EXCEPTION WHEN OTHERS THEN
      -- A bad/unreachable webhook URL must never stop the alert itself
      -- from being recorded -- the admin UI is the alert of record.
      UPDATE error_rate_alerts SET webhook_error = SQLERRM WHERE id = new_alert_id;
    END;
  END IF;

  RETURN new_alert_id;
END;
$$;

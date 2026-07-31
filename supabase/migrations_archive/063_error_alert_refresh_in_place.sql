-- Migration 062 made an ignored (unacknowledged) alert re-raise daily,
-- but did it by INSERTing a fresh row each day -- so an alert ignored
-- for a week stacked seven banners in /admin/errors, each needing its
-- own acknowledge. One incident should be one row: if the ongoing
-- spike is still above threshold after the 24h suppression window, the
-- existing unacknowledged alert is now REFRESHED in place (new window,
-- new count, webhook re-fired) instead of duplicated. created_at is
-- deliberately left untouched -- it records when the incident first
-- raised, so the UI can say "ongoing since"; window_end is the
-- freshness marker the suppression check keys on.
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
  existing_alert error_rate_alerts;
  alert_id uuid;
  request_id bigint;
BEGIN
  SELECT * INTO settings FROM error_alert_settings WHERE id = true;
  IF settings IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO existing_alert
  FROM error_rate_alerts
  WHERE acknowledged_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  -- Still fresh: the admin has an up-to-date banner already.
  IF existing_alert.id IS NOT NULL AND existing_alert.window_end > now() - interval '24 hours' THEN
    RETURN NULL;
  END IF;

  window_start_ts := now() - (settings.window_minutes || ' minutes')::interval;

  SELECT count(*) INTO recent_count
  FROM client_error_logs
  WHERE created_at >= window_start_ts;

  IF recent_count < settings.threshold_count THEN
    RETURN NULL;
  END IF;

  IF existing_alert.id IS NOT NULL THEN
    UPDATE error_rate_alerts
    SET window_start = window_start_ts,
        window_end = now(),
        error_count = recent_count,
        threshold_count = settings.threshold_count,
        webhook_notified = false,
        webhook_error = NULL
    WHERE id = existing_alert.id;
    alert_id := existing_alert.id;
  ELSE
    INSERT INTO error_rate_alerts (window_start, window_end, error_count, threshold_count)
    VALUES (window_start_ts, now(), recent_count, settings.threshold_count)
    RETURNING id INTO alert_id;
  END IF;

  IF settings.webhook_url IS NOT NULL THEN
    BEGIN
      SELECT net.http_post(
        url := settings.webhook_url,
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := jsonb_build_object(
          'text', format('Bhavan: %s client errors in the last %s minutes (threshold %s)', recent_count, settings.window_minutes, settings.threshold_count)
        )
      ) INTO request_id;
      UPDATE error_rate_alerts SET webhook_notified = true WHERE id = alert_id;
    EXCEPTION WHEN OTHERS THEN
      -- A bad/unreachable webhook URL must never stop the alert itself
      -- from being recorded -- the admin UI is the alert of record.
      UPDATE error_rate_alerts SET webhook_error = SQLERRM WHERE id = alert_id;
    END;
  END IF;

  RETURN alert_id;
END;
$$;

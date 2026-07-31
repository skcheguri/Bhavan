-- Server-side alerting on client_error_logs (migration 044). Until now the
-- only way to notice a production error spike was an admin manually
-- opening /admin/errors -- there was no push notification of any kind.
-- No outbound email/SMS provider is wired up yet (SMTP vendor signup is a
-- separate, pending item), so this can't send an email today. What it CAN
-- do for real right now: run a periodic check via pg_cron, record a
-- durable alert row the admin UI surfaces prominently, and -- if a webhook
-- URL is configured later (Slack, Discord, PagerDuty, anything that takes
-- a JSON POST) -- fire that too via pg_net, best-effort. Wiring a webhook
-- URL in later needs zero code changes, just an UPDATE to this settings
-- row.
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE TABLE error_alert_settings (
  id boolean PRIMARY KEY DEFAULT true,
  threshold_count integer NOT NULL DEFAULT 10,
  window_minutes integer NOT NULL DEFAULT 15,
  webhook_url text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT error_alert_settings_singleton CHECK (id = true)
);

INSERT INTO error_alert_settings (id) VALUES (true);

ALTER TABLE error_alert_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read alert settings" ON error_alert_settings
  FOR SELECT USING (is_admin());

CREATE POLICY "Admins can update alert settings" ON error_alert_settings
  FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());

CREATE TABLE error_rate_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  error_count integer NOT NULL,
  threshold_count integer NOT NULL,
  webhook_notified boolean NOT NULL DEFAULT false,
  webhook_error text,
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_error_rate_alerts_unacknowledged ON error_rate_alerts (created_at DESC)
  WHERE acknowledged_at IS NULL;

ALTER TABLE error_rate_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read error rate alerts" ON error_rate_alerts
  FOR SELECT USING (is_admin());

CREATE POLICY "Admins can acknowledge error rate alerts" ON error_rate_alerts
  FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());

-- Runs on a schedule (below), never directly from the client. Skips
-- raising a new alert if an unacknowledged one already exists so a
-- sustained spike doesn't flood the table with a near-duplicate row every
-- 5 minutes -- the existing alert's window_end effectively just needs the
-- admin to look once.
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

  IF EXISTS (SELECT 1 FROM error_rate_alerts WHERE acknowledged_at IS NULL) THEN
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

SELECT cron.schedule('check-error-rate', '*/5 * * * *', 'SELECT check_error_rate_and_alert();');

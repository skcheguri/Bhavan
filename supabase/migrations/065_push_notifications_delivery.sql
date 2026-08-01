-- Real push delivery. user_push_tokens has existed since the original
-- schema but nothing ever wrote to it -- usePushNotifications fabricated
-- a `mock-fcm-...` string and the UI then claimed push was enabled. This
-- migration adds what actually delivering a push requires.

-- A given FCM registration token identifies one browser/app install, not
-- one user: signing in as someone else on the same device must move the
-- token, not create a duplicate. Unique on the token alone is what makes
-- the client's upsert(onConflict: 'fcm_token') do that.
DELETE FROM user_push_tokens a
USING user_push_tokens b
WHERE a.fcm_token = b.fcm_token AND a.ctid < b.ctid;

ALTER TABLE user_push_tokens
  ADD CONSTRAINT user_push_tokens_fcm_token_key UNIQUE (fcm_token);

CREATE INDEX IF NOT EXISTS idx_user_push_tokens_user ON user_push_tokens (user_id) WHERE active;

-- Config for the trigger below. Deliberately NOT seeded with values in
-- this migration: the shared secret must never live in a committed file,
-- so it's set out-of-band (and the trigger no-ops until it is, exactly
-- like error_alert_settings.webhook_url).
CREATE TABLE push_config (
  id boolean PRIMARY KEY DEFAULT true,
  function_url text,
  trigger_secret text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT push_config_singleton CHECK (id = true)
);

INSERT INTO push_config (id) VALUES (true);

ALTER TABLE push_config ENABLE ROW LEVEL SECURITY;

-- No client-facing policy at all: this holds a shared secret and is read
-- only by the SECURITY DEFINER trigger function below. Admins don't need
-- to read it from the app either.
CREATE POLICY "Nobody reads push config directly" ON push_config
  FOR SELECT USING (false);

-- Every in-app notification already flows through the notifications table
-- (migration 036's triggers), so hooking delivery here means connection
-- requests, payments, agreements and maintenance updates all push without
-- touching any of that existing logic.
CREATE OR REPLACE FUNCTION dispatch_push_for_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg push_config;
  request_id bigint;
BEGIN
  SELECT * INTO cfg FROM push_config WHERE id = true;
  IF cfg.function_url IS NULL OR cfg.trigger_secret IS NULL THEN
    RETURN NEW;
  END IF;

  -- Skip the network call entirely when the user has no registered
  -- device -- the overwhelmingly common case early on.
  IF NOT EXISTS (SELECT 1 FROM user_push_tokens WHERE user_id = NEW.user_id AND active) THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT net.http_post(
      url := cfg.function_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-push-trigger-secret', cfg.trigger_secret
      ),
      body := jsonb_build_object('notificationId', NEW.id)
    ) INTO request_id;
  EXCEPTION WHEN OTHERS THEN
    -- Push is best-effort: never let a delivery failure roll back the
    -- notification row itself (the in-app bell is the source of truth).
    NULL;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dispatch_push ON notifications;
CREATE TRIGGER trg_dispatch_push
  AFTER INSERT ON notifications
  FOR EACH ROW EXECUTE FUNCTION dispatch_push_for_notification();

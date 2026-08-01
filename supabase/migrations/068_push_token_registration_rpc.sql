-- The client registered push tokens with
--   upsert({...}, { onConflict: 'fcm_token' })
-- which cannot work across a change of user on a shared device. RLS on
-- user_push_tokens is `FOR ALL USING (user_id = auth.uid())`, and on
-- INSERT ... ON CONFLICT DO UPDATE Postgres evaluates the UPDATE policy
-- against the EXISTING row -- still owned by the previous user -- so the
-- write was rejected. The client discarded the result, so the second
-- person saw "notifications enabled" while the first person's device
-- kept receiving their notifications. A privacy leak, silently.
--
-- SECURITY DEFINER so the row can be reassigned regardless of who
-- currently owns it, while still being strictly scoped to auth.uid():
-- the caller can only ever attach a token to themselves.
CREATE OR REPLACE FUNCTION register_push_token(p_token text, p_device_name text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_token IS NULL OR length(trim(p_token)) = 0 THEN
    RAISE EXCEPTION 'A push token is required';
  END IF;

  -- One device, one owner: whoever most recently enabled push on this
  -- browser/app install is the only person it should notify.
  DELETE FROM user_push_tokens WHERE fcm_token = p_token AND user_id <> uid;

  INSERT INTO user_push_tokens (user_id, fcm_token, device_name, active, updated_at)
  VALUES (uid, p_token, p_device_name, true, now())
  ON CONFLICT (fcm_token) DO UPDATE
    SET user_id = EXCLUDED.user_id,
        device_name = COALESCE(EXCLUDED.device_name, user_push_tokens.device_name),
        active = true,
        updated_at = now();
END;
$$;

-- Unregistering must work even when the client no longer holds the token
-- string (notably native, where the token isn't re-read on app restart),
-- otherwise "turn off notifications" left the row in place and delivery
-- continued.
CREATE OR REPLACE FUNCTION unregister_push_tokens(p_token text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_token IS NULL THEN
    DELETE FROM user_push_tokens WHERE user_id = uid;
  ELSE
    DELETE FROM user_push_tokens WHERE user_id = uid AND fcm_token = p_token;
  END IF;
END;
$$;

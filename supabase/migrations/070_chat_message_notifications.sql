-- Push notifications for new chat messages.
--
-- The delivery pipeline built in 065 fires on INSERT into `notifications`,
-- so anything that never writes a notification row is invisible to push.
-- Chat was exactly that: 036's triggers cover connection requests,
-- payments, agreements and maintenance, but nothing ever fired on
-- chat_messages, so a new message produced no bell entry and no push.
-- Confirmed against production before writing this -- the notifications
-- table contained only 'inquiry', 'maintenance' and 'lease' rows.
--
-- chat_messages.sender is a role string ('tenant' | 'landlord'), not a
-- user id, so the recipient has to be resolved through the parent
-- connection_request: whichever side did not send it.

CREATE OR REPLACE FUNCTION notify_new_chat_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id  uuid;
  v_owner_id   uuid;
  v_recipient  uuid;
  v_sender_id  uuid;
  v_sender_name text;
  v_action_url text;
  v_preview    text;
  v_existing   uuid;
BEGIN
  SELECT tenant_id, owner_id INTO v_tenant_id, v_owner_id
  FROM connection_requests
  WHERE id = NEW.request_id;

  -- Orphaned message (request deleted mid-flight): nothing to notify.
  IF v_tenant_id IS NULL OR v_owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.sender = 'tenant' THEN
    v_sender_id := v_tenant_id;
    v_recipient := v_owner_id;
    v_action_url := '/owner-profile?tab=messages&request=' || NEW.request_id::text;
  ELSE
    v_sender_id := v_owner_id;
    v_recipient := v_tenant_id;
    v_action_url := '/tenant-profile?tab=messages&request=' || NEW.request_id::text;
  END IF;

  SELECT COALESCE(NULLIF(TRIM(name), ''), 'Someone') INTO v_sender_name
  FROM users WHERE id = v_sender_id;

  -- Trim the preview rather than pasting a whole message into a push
  -- payload and the bell list.
  v_preview := LEFT(REGEXP_REPLACE(NEW.text, '\s+', ' ', 'g'), 120);

  -- Coalesce bursts. People send three messages in a row; one bell row and
  -- one push per message would bury every other notification and buzz the
  -- phone repeatedly for a single thought. So an unread notification for
  -- this same conversation that is less than 5 minutes old is refreshed in
  -- place instead. Because 065's dispatcher is AFTER INSERT, an UPDATE
  -- deliberately sends no second push.
  --
  -- The 5 minute bound matters: without it, an unread notification the
  -- recipient never clears would silently mute that conversation forever.
  SELECT id INTO v_existing
  FROM notifications
  WHERE user_id = v_recipient
    AND type = 'message'
    AND NOT read
    AND action_url = v_action_url
    AND created_at > now() - interval '5 minutes'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    UPDATE notifications
       SET message = v_sender_name || ': ' || v_preview,
           created_at = now()
     WHERE id = v_existing;
    RETURN NEW;
  END IF;

  INSERT INTO notifications (user_id, type, title, message, action_url)
  VALUES (
    v_recipient,
    'message',
    'New message from ' || v_sender_name,
    v_sender_name || ': ' || v_preview,
    v_action_url
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_new_chat_message ON chat_messages;
CREATE TRIGGER trg_notify_new_chat_message
  AFTER INSERT ON chat_messages
  FOR EACH ROW EXECUTE FUNCTION notify_new_chat_message();

-- Supports the coalescing lookup above, which runs on every message sent.
CREATE INDEX IF NOT EXISTS idx_notifications_unread_message
  ON notifications (user_id, action_url, created_at DESC)
  WHERE type = 'message' AND NOT read;

-- 070 added a trigger that inserts notifications of type 'message', but
-- notifications.type is restricted by a CHECK constraint that predates it.
--
-- This is not a silent no-op. The trigger is AFTER INSERT on chat_messages,
-- so the constraint violation aborts the whole transaction and the chat
-- message itself fails to save -- worse than the missing push it was meant
-- to fix. Caught by sending a real message through the live database
-- immediately after applying 070, which is the only reason it was a
-- two-minute window rather than a production outage.
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY[
    'maintenance'::text, 'inquiry'::text, 'message'::text,
    'lease'::text, 'payment'::text, 'platform'::text
  ]));

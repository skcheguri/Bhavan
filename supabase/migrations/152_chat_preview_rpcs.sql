-- ============================================================
-- Part D: chat conversation previews without pulling whole threads.
--
-- The inbox showed, per conversation, the last message and an unread
-- count. It got them by selecting EVERY message in EVERY open
-- conversation (chat_messages.* for all request_ids) and reducing in the
-- browser -- so a handful of long threads downloaded hundreds of rows to
-- render a one-line preview. These two functions do the reduction in the
-- database and return at most one row per conversation.
--
-- SECURITY INVOKER (default): the caller's RLS on chat_messages still
-- applies, so a user only ever previews conversations they are part of.
-- ============================================================

-- Latest message per conversation (DISTINCT ON over the request).
CREATE OR REPLACE FUNCTION get_last_messages_by_request(p_request_ids uuid[])
RETURNS SETOF chat_messages
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT DISTINCT ON (request_id) *
  FROM chat_messages
  WHERE request_id = ANY(p_request_ids)
  ORDER BY request_id, created_at DESC;
$$;

-- Unread message count per conversation, from a given sender side.
CREATE OR REPLACE FUNCTION get_unread_counts_by_request(p_request_ids uuid[], p_from_sender text)
RETURNS TABLE (request_id uuid, count bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT m.request_id, COUNT(*)::bigint AS count
  FROM chat_messages m
  WHERE m.request_id = ANY(p_request_ids)
    AND m.sender = p_from_sender
    AND m.read = false
  GROUP BY m.request_id;
$$;

GRANT EXECUTE ON FUNCTION get_last_messages_by_request(uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_unread_counts_by_request(uuid[], text) TO authenticated, service_role;

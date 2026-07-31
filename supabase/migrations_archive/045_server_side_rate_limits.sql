-- ============================================================
-- Real, server-side rate limiting for the three actions that were only
-- ever enforced client-side (trivially bypassed by clearing localStorage
-- or an incognito window): community posts, owner inquiry responses, and
-- the public Contact Us form (which had no rate limit at all, not even a
-- fake client-side one).
--
-- Design: a generic events table + a SECURITY DEFINER helper that both
-- checks and records an attempt atomically, called from BEFORE
-- INSERT/UPDATE triggers on the tables these actions actually write to.
-- This protects the real write path regardless of which client code (or
-- a direct API call) reaches it -- the existing client-side counters in
-- useOwnerRateLimit.ts are left in place purely as a fast local estimate
-- for the UI; they are no longer what actually gates anything.
-- ============================================================

CREATE TABLE IF NOT EXISTS rate_limit_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor UUID,
    device_fingerprint TEXT,
    action TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_events_actor ON rate_limit_events(actor, action, created_at);
CREATE INDEX IF NOT EXISTS idx_rate_limit_events_fingerprint ON rate_limit_events(device_fingerprint, action, created_at);

ALTER TABLE rate_limit_events ENABLE ROW LEVEL SECURITY;
-- No client-facing policies at all -- this table is only ever touched by
-- the SECURITY DEFINER function below, never directly by PostgREST.
CREATE POLICY "Admins can read rate limit events" ON rate_limit_events FOR SELECT USING (is_admin());

CREATE OR REPLACE FUNCTION check_and_record_rate_limit(
    p_actor UUID,
    p_device_fingerprint TEXT,
    p_action TEXT,
    p_max_daily INT,
    p_max_weekly INT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    daily_count INT;
    weekly_count INT;
BEGIN
    IF p_actor IS NULL AND p_device_fingerprint IS NULL THEN
        RETURN;
    END IF;

    SELECT COUNT(*) INTO daily_count FROM rate_limit_events
    WHERE action = p_action AND created_at > now() - interval '1 day'
      AND ((p_actor IS NOT NULL AND actor = p_actor) OR (p_actor IS NULL AND device_fingerprint = p_device_fingerprint));

    IF daily_count >= p_max_daily THEN
        RAISE EXCEPTION 'You have reached the daily limit for this action. Please try again tomorrow.' USING ERRCODE = 'P0001';
    END IF;

    SELECT COUNT(*) INTO weekly_count FROM rate_limit_events
    WHERE action = p_action AND created_at > now() - interval '7 days'
      AND ((p_actor IS NOT NULL AND actor = p_actor) OR (p_actor IS NULL AND device_fingerprint = p_device_fingerprint));

    IF weekly_count >= p_max_weekly THEN
        RAISE EXCEPTION 'You have reached the weekly limit for this action. Please try again next week.' USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO rate_limit_events (actor, device_fingerprint, action) VALUES (p_actor, p_device_fingerprint, p_action);
END;
$$;

-- ---- Community posts: 5/day, 15/week per author (matches the existing
-- client-side display numbers in useOwnerRateLimit.ts) ----
CREATE OR REPLACE FUNCTION enforce_community_post_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT is_admin() THEN
        PERFORM check_and_record_rate_limit(NEW.author_id, NULL, 'community_post', 5, 15);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_posts_rate_limit ON community_posts;
CREATE TRIGGER trg_community_posts_rate_limit
    BEFORE INSERT ON community_posts
    FOR EACH ROW EXECUTE FUNCTION enforce_community_post_rate_limit();

-- ---- Owner inquiry responses (approve/decline a connection request):
-- 50/day, 200/week ----
CREATE OR REPLACE FUNCTION enforce_inquiry_response_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.status IS DISTINCT FROM OLD.status AND OLD.status = 'pending' AND NEW.status IN ('approved', 'declined') AND NOT is_admin() THEN
        PERFORM check_and_record_rate_limit(NEW.owner_id, NULL, 'inquiry_response', 50, 200);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_connection_requests_rate_limit ON connection_requests;
CREATE TRIGGER trg_connection_requests_rate_limit
    BEFORE UPDATE ON connection_requests
    FOR EACH ROW EXECUTE FUNCTION enforce_inquiry_response_rate_limit();

-- ---- Public Contact Us form: had NO rate limit at all, not even a fake
-- client one. Anonymous submitters have no user_id, so this keys on a
-- device fingerprint the client must now send. 5/day, 15/week. ----
ALTER TABLE contact_inquiries ADD COLUMN IF NOT EXISTS device_fingerprint TEXT;

CREATE OR REPLACE FUNCTION enforce_contact_inquiry_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM check_and_record_rate_limit(auth.uid(), NEW.device_fingerprint, 'contact_inquiry', 5, 15);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contact_inquiries_rate_limit ON contact_inquiries;
CREATE TRIGGER trg_contact_inquiries_rate_limit
    BEFORE INSERT ON contact_inquiries
    FOR EACH ROW EXECUTE FUNCTION enforce_contact_inquiry_rate_limit();

-- ============================================================
-- END OF MIGRATION
-- ============================================================

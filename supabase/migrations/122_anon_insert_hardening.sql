-- ============================================================
-- Three tables accepted anonymous INSERTs with no server-side bounds:
--
--   * contact_attempts: WITH CHECK (true) -- but since the record-contact
--     edge function became the only legitimate writer (it inserts with
--     the service role, which bypasses RLS), the open policy is a leftover
--     that lets anyone fabricate contact-attempt history, poisoning the
--     very counters check-contact-limit rate-limits on. Dropped.
--
--   * contact_inquiries: the public Contact form inserts directly, which
--     stays -- but WITH CHECK (true) also let a caller set the triage
--     fields (status/admin_notes/resolved_at, e.g. filing an inquiry
--     pre-marked resolved so no admin ever sees it) and there was no
--     bound on field sizes. The insert policy now pins triage fields to
--     their fresh-inquiry state, and CHECK constraints cap lengths.
--
--   * client_error_logs: the error reporter slices lengths client-side,
--     but a direct API call has no such manners -- unbounded text in
--     four columns, at any rate. Length caps move into the table, and a
--     throttle trigger silently drops inserts beyond a sane rate
--     (silently: the error reporter is fire-and-forget by design, and a
--     raised exception would surface where it can only confuse).
--
-- All CHECKs are NOT VALID: they bind new rows without requiring a scan
-- proving old rows conform.
-- ============================================================

-- ---- contact_attempts: service-role writes only ----
DROP POLICY IF EXISTS "Anyone can record a contact attempt" ON contact_attempts;
REVOKE INSERT ON contact_attempts FROM anon, authenticated;

-- ---- contact_inquiries: form fields only, bounded ----
DROP POLICY IF EXISTS "Anyone can submit a contact inquiry" ON contact_inquiries;
CREATE POLICY "Anyone can submit a contact inquiry" ON contact_inquiries
  FOR INSERT TO public
  WITH CHECK (
    status = 'new'
    AND admin_notes IS NULL
    AND resolved_at IS NULL
  );

ALTER TABLE contact_inquiries
  ADD CONSTRAINT contact_inquiries_field_lengths CHECK (
    length(name) <= 200
    AND length(email) <= 320
    AND length(subject) <= 500
    AND length(message) <= 5000
    AND (device_fingerprint IS NULL OR length(device_fingerprint) <= 128)
  ) NOT VALID;

-- ---- client_error_logs: bounded and throttled ----
ALTER TABLE client_error_logs
  ADD CONSTRAINT client_error_logs_field_lengths CHECK (
    length(message) <= 4000
    AND (stack IS NULL OR length(stack) <= 16000)
    AND (component_stack IS NULL OR length(component_stack) <= 16000)
    AND (url IS NULL OR length(url) <= 2048)
    AND (user_agent IS NULL OR length(user_agent) <= 512)
    AND source IN ('error_boundary', 'window_error', 'unhandled_rejection')
  ) NOT VALID;

CREATE OR REPLACE FUNCTION throttle_client_error_logs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recent integer;
BEGIN
  -- Signed-in reporters get a per-user budget; anonymous reporters share
  -- one pool (there is nothing per-caller to key on that an attacker
  -- couldn't rotate). A flooded anon pool costs us anon error reports
  -- for an hour, which is much cheaper than unbounded storage growth.
  IF NEW.user_id IS NULL THEN
    SELECT count(*) INTO recent FROM client_error_logs
    WHERE user_id IS NULL AND created_at > now() - interval '1 hour';
    IF recent >= 120 THEN RETURN NULL; END IF;
  ELSE
    SELECT count(*) INTO recent FROM client_error_logs
    WHERE user_id = NEW.user_id AND created_at > now() - interval '1 hour';
    IF recent >= 30 THEN RETURN NULL; END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_client_error_logs_throttle ON client_error_logs;
CREATE TRIGGER trg_client_error_logs_throttle
  BEFORE INSERT ON client_error_logs
  FOR EACH ROW EXECUTE FUNCTION throttle_client_error_logs();

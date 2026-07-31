-- check_and_record_rate_limit() (migration 045) returns early -- meaning
-- "no limit" -- when both the actor and the device fingerprint are NULL.
-- That was meant as a safety valve, but for the public Contact Us form it
-- became a bypass: the submitter is anonymous (auth.uid() IS NULL) and the
-- fingerprint is client-supplied, so a caller who simply omits
-- device_fingerprint from their INSERT was never rate-limited at all.
--
-- Fix: anonymous submissions with no fingerprint now share a single
-- 'no-fingerprint' bucket instead of skipping the check. Legitimate users
-- whose browser fails to compute a fingerprint still get through (until
-- the shared bucket fills), while stripping the field no longer buys an
-- attacker unlimited submissions. Signed-in submitters are unaffected --
-- they were always keyed by auth.uid().
CREATE OR REPLACE FUNCTION enforce_contact_inquiry_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL AND NEW.device_fingerprint IS NULL THEN
        PERFORM check_and_record_rate_limit(NULL, 'no-fingerprint', 'contact_inquiry', 5, 15);
    ELSE
        PERFORM check_and_record_rate_limit(auth.uid(), NEW.device_fingerprint, 'contact_inquiry', 5, 15);
    END IF;
    RETURN NEW;
END;
$$;

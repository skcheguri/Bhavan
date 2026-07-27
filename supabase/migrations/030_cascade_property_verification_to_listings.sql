-- ============================================================
-- listings.verified was never actually wired to property ownership
-- verification -- it's set false at insert (list-property/page.tsx)
-- and nothing anywhere ever updates it afterward. useAdminPropertyVerification
-- only touches `properties.verified`. Confirmed live: "2BHK in Mumbai"
-- already has an admin-approved property (properties.verified = true)
-- but its listing still shows verified = false to tenants -- the
-- "Verified" badge on every listing card is effectively dead.
--
-- Fix: a trigger cascades properties.verified to every listing under
-- that property whenever it changes, so the two can't drift apart
-- again regardless of which code path updates properties.verified.
-- ============================================================

CREATE OR REPLACE FUNCTION cascade_property_verification_to_listings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.verified IS DISTINCT FROM OLD.verified THEN
    UPDATE listings SET verified = NEW.verified WHERE property_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cascade_property_verification_trigger ON properties;
CREATE TRIGGER cascade_property_verification_trigger
AFTER UPDATE ON properties
FOR EACH ROW
EXECUTE FUNCTION cascade_property_verification_to_listings();

-- One-time backfill for the drift that already exists.
UPDATE listings l
SET verified = p.verified
FROM properties p
WHERE l.property_id = p.id AND l.verified IS DISTINCT FROM p.verified;

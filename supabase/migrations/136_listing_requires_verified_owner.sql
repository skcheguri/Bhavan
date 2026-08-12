-- ============================================================
-- Make the "only Aadhaar-verified owners can list" rule real.
--
-- The list-property page shows an Aadhaar gate, but it was pure UI: the
-- page had a visible "Already verified? Continue to listing" bypass, and
-- nothing server-side checked verification -- so an unverified user (or
-- any direct REST caller) could create a listing, which is exactly the
-- broker/fraud path the gate exists to stop. The product copy states the
-- rule plainly ("Only Aadhaar-verified property owners can list"); this
-- enforces it where it can't be clicked past.
--
-- A trigger rather than an RLS WITH CHECK because listings already has a
-- permissive "Owners full access" ALL policy that would otherwise let the
-- insert through regardless. The trigger fires no matter which policy
-- admitted the row.
--
-- Service-role inserts (auth.uid() IS NULL -- admin tooling, seeds) and
-- admins are exempt; every ordinary owner must be verified. Verification
-- now works via the IDfy OCR flow (and the test-only OTP bypass in
-- staging), so this no longer blocks a path that has no way forward.
-- ============================================================

CREATE OR REPLACE FUNCTION enforce_listing_owner_verified()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Service role (no JWT) and admins bypass; everyone else must be
  -- Aadhaar-verified.
  IF auth.uid() IS NULL OR is_admin() THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM users WHERE id = NEW.owner_id AND verified_aadhaar = true
  ) THEN
    RAISE EXCEPTION 'Only Aadhaar-verified owners can create listings. Verify your Aadhaar first.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_listings_owner_verified ON listings;
CREATE TRIGGER trg_listings_owner_verified
  BEFORE INSERT ON listings
  FOR EACH ROW EXECUTE FUNCTION enforce_listing_owner_verified();

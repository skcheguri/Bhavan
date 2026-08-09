-- 102: an owner must not be able to verify their own property
--
-- Found while building the "add a flat you live in" entry point, by
-- walking the path an owner actually takes. RLS grants rows, not
-- columns, and "Property owners can update own properties" has always
-- covered the whole row -- including properties.verified, which is the
-- output of Bhavan's review, not an input from the owner.
--
-- Two things fell out of that:
--
--   1. is_verified_owner() gates society membership on a verified
--      property, so any owner could self-approve and walk into any
--      society whose code they had.
--   2. cascade_property_verification_to_listings copies the flag onto
--      every listing for that property, so the same single UPDATE also
--      awarded the owner the "Verified" badge that tenants use to decide
--      who is worth trusting. That is the worse half.
--
-- Same shape as 049/052/053: the row stays writable, the columns that
-- represent somebody else's decision get pinned back.

CREATE OR REPLACE FUNCTION public.protect_property_verification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Platform admins are the reviewers. auth.uid() IS NULL means no user
  -- context at all -- the service role, used by edge functions and by
  -- migrations; without this exemption the backend cannot approve
  -- anything either.
  IF is_admin() OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.verified := OLD.verified;
  NEW.verification_rejection_reason := OLD.verification_rejection_reason;
  NEW.verification_reviewed_at := OLD.verification_reviewed_at;

  -- Swapping the document after approval would leave an approved
  -- property standing on evidence nobody looked at. Same rule the users
  -- table applies to a changed phone number: the claim is allowed, the
  -- verification that belonged to the old claim is not carried over.
  IF NEW.verification_doc_url IS DISTINCT FROM OLD.verification_doc_url THEN
    NEW.verified := false;
    NEW.verification_reviewed_at := NULL;
    NEW.verification_rejection_reason := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_property_verification_trigger ON public.properties;
CREATE TRIGGER protect_property_verification_trigger
  BEFORE UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.protect_property_verification();

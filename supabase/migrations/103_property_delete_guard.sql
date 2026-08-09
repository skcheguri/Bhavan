-- 103: do not let a listing outlive its property
--
-- Owners can now remove a flat from their profile, which they could not
-- do before -- and which is how three identical half-created properties
-- sat on one profile with nothing able to clear them.
--
-- listings.property_id is ON DELETE SET NULL, so deleting a property
-- does not remove its listing; it detaches it. The listing stays on the
-- market carrying whatever verified flag it had, with no property record
-- behind it, no ownership document, and nothing for the admin queue to
-- point at. That is worse than either deleting it or refusing.
--
-- The client checks this before offering the button, but that check is
-- advisory: the DELETE policy on properties is row-level, and anyone
-- with the anon key can call PostgREST directly.

CREATE OR REPLACE FUNCTION public.protect_property_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_listings int;
BEGIN
  -- Platform admins and the service role are exempt: cleaning up after a
  -- fraudulent owner means removing the whole set, and the guard would
  -- otherwise force them to dismantle it in a particular order.
  IF is_admin() OR auth.uid() IS NULL THEN
    RETURN OLD;
  END IF;

  SELECT count(*) INTO v_listings FROM listings WHERE property_id = OLD.id;

  IF v_listings > 0 THEN
    RAISE EXCEPTION 'This flat still has % listing(s) on Bhavan. Remove the listing first.', v_listings;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS protect_property_delete_trigger ON public.properties;
CREATE TRIGGER protect_property_delete_trigger
  BEFORE DELETE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.protect_property_delete();

-- 101: what each flat is actually for
--
-- The owner dashboard showed Monthly Income, Active Listings and Tenants
-- to everyone with role = 'owner'. For an owner who lives in their own
-- flat and joined Bhavan for the society features, all three sit at zero
-- forever. The number was never wrong -- income is summed from active
-- rental agreements, so zero is correct -- but the framing told a
-- resident owner the product was not for them.
--
-- The distinction is a fact about a flat, not about a person. The common
-- Indian case is an owner who lives in one flat and rents out another,
-- often in the same building, so a user-level "landlord or resident"
-- flag would be wrong for half their properties the day it was set.
--
-- Note that society membership must NOT be read as living there.
-- Landlords routinely stay in the society group after renting out --
-- that is how they hear about maintenance and dues. Residence is
-- inferred from the absence of a tenancy on the flat, never from
-- community_members.

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS occupancy text NOT NULL DEFAULT 'self_occupied';

ALTER TABLE public.properties
  DROP CONSTRAINT IF EXISTS properties_occupancy_check;

ALTER TABLE public.properties
  ADD CONSTRAINT properties_occupancy_check
  CHECK (occupancy IN ('self_occupied', 'rented_out', 'vacant'));

COMMENT ON COLUMN public.properties.occupancy IS
  'self_occupied = the owner lives here; rented_out = a tenant lives here; vacant = neither. Forced to rented_out while an active rental agreement exists.';

-- An agreement with no end date, or one that has not run out yet, is a
-- live tenancy. This is the same rule the owner dashboard already used
-- to sum income, moved into the database so both agree by construction.
CREATE OR REPLACE FUNCTION public.property_has_active_tenancy(p_property uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM rental_agreements ra
    JOIN listings l ON l.id = ra.listing_id
    WHERE l.property_id = p_property
      AND (ra.lease_end_date IS NULL OR ra.lease_end_date >= CURRENT_DATE)
  );
$$;

-- Backfill from what is already known, so nobody has to answer a
-- question the app can answer for them. A property that was never
-- listed and has no tenancy is where the owner lives; one that was
-- listed but has no live agreement is empty and looking.
UPDATE public.properties p
SET occupancy = CASE
  WHEN public.property_has_active_tenancy(p.id) THEN 'rented_out'
  WHEN EXISTS (SELECT 1 FROM listings l WHERE l.property_id = p.id) THEN 'vacant'
  ELSE 'self_occupied'
END;

-- A signed agreement outranks anything the owner clicked. When one is
-- created the flat is rented; when the last one lapses the flat becomes
-- vacant rather than self_occupied, because the agreement ending is not
-- evidence that the owner moved in.
CREATE OR REPLACE FUNCTION public.sync_property_occupancy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_listing uuid;
  v_property uuid;
BEGIN
  v_listing := COALESCE(NEW.listing_id, OLD.listing_id);
  IF v_listing IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT property_id INTO v_property FROM listings WHERE id = v_listing;
  IF v_property IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF public.property_has_active_tenancy(v_property) THEN
    UPDATE properties SET occupancy = 'rented_out'
    WHERE id = v_property AND occupancy IS DISTINCT FROM 'rented_out';
  ELSE
    UPDATE properties SET occupancy = 'vacant'
    WHERE id = v_property AND occupancy = 'rented_out';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS sync_property_occupancy_trigger ON public.rental_agreements;
CREATE TRIGGER sync_property_occupancy_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.rental_agreements
  FOR EACH ROW EXECUTE FUNCTION public.sync_property_occupancy();

-- RLS grants rows, not columns, so without this an owner could set
-- occupancy to self_occupied on a flat their tenant is living in and
-- quietly drop it out of the income total. Raising rather than silently
-- pinning the value: the owner is trying to record something real, and
-- the fix (end the agreement) is theirs to make.
CREATE OR REPLACE FUNCTION public.protect_property_occupancy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.occupancy IS DISTINCT FROM OLD.occupancy
     AND NEW.occupancy <> 'rented_out'
     AND public.property_has_active_tenancy(NEW.id) THEN
    RAISE EXCEPTION 'This flat has a rental agreement that has not ended yet. End the agreement first, then change how the flat is used.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_property_occupancy_trigger ON public.properties;
CREATE TRIGGER protect_property_occupancy_trigger
  BEFORE UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.protect_property_occupancy();

-- monthly_income and occupied_units are scaffold leftovers: null on all
-- nine rows, written by nothing, read by nothing. Leaving them next to
-- a real occupancy column invites someone to wire the next feature to
-- them and end up with two disagreeing answers to "is this flat let?".
ALTER TABLE public.properties DROP COLUMN IF EXISTS monthly_income;
ALTER TABLE public.properties DROP COLUMN IF EXISTS occupied_units;

CREATE INDEX IF NOT EXISTS idx_properties_owner_occupancy
  ON public.properties (owner_id, occupancy);

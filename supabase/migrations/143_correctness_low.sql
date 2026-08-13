-- ============================================================
-- Database correctness audit (2026-08-13) — Low.
--
--   #17 the engagement counters (saves/inquiries/views) bumped
--       listings.updated_at, so unrelated activity looked like the owner
--       edited the listing. Latent today (nothing sorts on it) but wrong.
--   #19 a contribution's confirmed_by came entirely from the client, so a
--       (community) admin could stamp any uuid as the confirmer, and the
--       receipt rendered that name. Stamp it server-side instead.
--
-- #16 (razorpay-webhook fulfilRent claim scope) is an edge-function fix.
-- #15 (re-runnability) and #18 (the 111 backfill) are guard/qualifier edits
-- applied in place to the original migrations, since they only affect a
-- fresh replay.
-- ============================================================

-- ---- #17  don't treat counter maintenance as an edit ----
-- Replaces the generic updated_at trigger on listings with one that stamps
-- the timestamp only when something other than the engagement counters
-- changed. (The generic update_updated_at_column stays in use elsewhere.)
CREATE OR REPLACE FUNCTION public.touch_listings_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  old_norm listings;
BEGIN
  old_norm := OLD;
  -- Neutralise the counters (and updated_at itself) so the comparison is
  -- "did anything the owner actually edits change?".
  old_norm.saves_count := NEW.saves_count;
  old_norm.inquiries_count := NEW.inquiries_count;
  old_norm.views_count := NEW.views_count;
  old_norm.updated_at := NEW.updated_at;
  IF NEW IS DISTINCT FROM old_norm THEN
    NEW.updated_at := now();
  ELSE
    NEW.updated_at := OLD.updated_at;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS update_listings_updated_at ON listings;
CREATE TRIGGER update_listings_updated_at
  BEFORE UPDATE ON listings
  FOR EACH ROW EXECUTE FUNCTION touch_listings_updated_at();

-- ---- #19  confirmed_by is who actually confirmed, not what the client sent ----
-- Both the update path (an admin confirming a claimed payment) and the
-- insert path (an admin recording an already-confirmed offline payment)
-- now stamp confirmed_by = auth.uid(). guard_contribution_changes already
-- blocks non-admins from touching these fields, so this only ever records a
-- real (community) admin — never a client-chosen uuid the receipt would
-- then render as the confirmer.
CREATE OR REPLACE FUNCTION public.stamp_contribution_confirmation()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'confirmed' AND OLD.status IS DISTINCT FROM 'confirmed' THEN
    NEW.confirmed_at := now();
    NEW.confirmed_by := auth.uid();
  ELSIF NEW.status <> 'confirmed' THEN
    NEW.confirmed_at := NULL;
    NEW.confirmed_by := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.stamp_contribution_insert()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  -- Runs after force_claimed_contribution, so a non-admin member's row is
  -- already 'claimed' here and this branch is skipped; only a genuine
  -- admin-recorded 'confirmed' row reaches it.
  IF NEW.status = 'confirmed' THEN
    IF NEW.confirmed_at IS NULL THEN
      NEW.confirmed_at := now();
    END IF;
    NEW.confirmed_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

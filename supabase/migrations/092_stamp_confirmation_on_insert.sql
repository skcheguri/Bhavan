-- Stamp confirmed_at when a contribution is CREATED confirmed, not only
-- when one is updated to confirmed.
--
-- stamp_contribution_confirmation() was BEFORE UPDATE only, which covers
-- the ordinary path: an owner records a payment as `claimed` and an admin
-- confirms it. But force_claimed_contribution() exempts admins, so an
-- admin recording a payment on behalf of an owner -- someone who does not
-- use the app, which in a real society is several people -- inserts a row
-- that is already `confirmed`. No UPDATE ever fires, and confirmed_at
-- stays null.
--
-- Found by generating a receipt for such a row: it printed
-- "Confirmed: _______________". The amount, the payer and the reference
-- were all correct, and the one date the document exists to attest to was
-- blank.

CREATE OR REPLACE FUNCTION public.stamp_contribution_insert()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'confirmed' AND NEW.confirmed_at IS NULL THEN
    NEW.confirmed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

-- Ordering matters. force_claimed_contribution rewrites status to
-- 'claimed' for anyone who is not an admin, and this must run after that
-- so a member's row is not stamped as confirmed on the way past. Postgres
-- fires BEFORE triggers in name order, and 'trg_stamp_contribution_insert'
-- sorts after 'trg_force_claimed_contribution'.
DROP TRIGGER IF EXISTS trg_stamp_contribution_insert ON community_contributions;
CREATE TRIGGER trg_stamp_contribution_insert
  BEFORE INSERT ON community_contributions
  FOR EACH ROW EXECUTE FUNCTION stamp_contribution_insert();

-- Backfill anything already in this state, so an existing receipt stops
-- being wrong the moment this ships.
UPDATE community_contributions
   SET confirmed_at = created_at
 WHERE status = 'confirmed' AND confirmed_at IS NULL;

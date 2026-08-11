-- ============================================================
-- After confirming a booking, the host could neither chat with the
-- guest nor open their profile. Both failures share one cause: the
-- app's relationship primitives predate bookings.
--
--   * Chat threads are connection_requests rows (chat_messages RLS
--     checks nothing else), and a vacation booking never created one --
--     so there was no channel to speak through.
--   * get_public_profile (116) gates profile lookups on a relationship,
--     and its relationship list did not include bookings -- so the
--     guest resolved to "Profile not found".
--
-- Fix: a confirmed booking now guarantees an APPROVED connection
-- request between host and guest for that listing (approving a pending
-- one if the guest had already inquired, creating one otherwise). The
-- existing Messages tabs, chat RLS, message notifications and blocklist
-- behavior all apply unchanged. And bookings join the relationship list
-- for profile lookups -- from first payment, not just confirmation, so
-- a host can screen a guest BEFORE deciding.
-- ============================================================

-- ---- 1. Bookings are a profile relationship ----
CREATE OR REPLACE FUNCTION get_public_profile(p_user_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  avatar_url text,
  verified_aadhaar boolean,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.id, u.name, u.avatar_url, u.verified_aadhaar, u.created_at
  FROM users u
  WHERE u.id = p_user_id
    AND auth.uid() IS NOT NULL
    AND (
      u.id = auth.uid()
      OR is_admin()
      OR EXISTS (SELECT 1 FROM listings l
                 WHERE l.owner_id = u.id AND l.status = 'active')
      OR EXISTS (SELECT 1 FROM connection_requests cr
                 WHERE (cr.tenant_id = auth.uid() AND cr.owner_id = u.id)
                    OR (cr.owner_id = auth.uid() AND cr.tenant_id = u.id))
      OR EXISTS (SELECT 1 FROM rental_agreements ra
                 WHERE (ra.tenant_id = auth.uid() AND ra.owner_id = u.id)
                    OR (ra.owner_id = auth.uid() AND ra.tenant_id = u.id))
      OR EXISTS (SELECT 1 FROM vacation_bookings vb
                 WHERE vb.status <> 'awaiting_payment'
                   AND ((vb.tenant_id = auth.uid() AND vb.owner_id = u.id)
                     OR (vb.owner_id = auth.uid() AND vb.tenant_id = u.id)))
      OR EXISTS (SELECT 1 FROM community_members mine
                 JOIN community_members theirs
                   ON theirs.community_id = mine.community_id
                 WHERE mine.user_id = auth.uid()
                   AND theirs.user_id = u.id
                   AND mine.status = 'approved'
                   AND theirs.status = 'approved')
    );
$$;

REVOKE EXECUTE ON FUNCTION get_public_profile(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_public_profile(uuid) TO authenticated;

-- ---- 2. A confirmed booking opens a chat channel ----
CREATE OR REPLACE FUNCTION ensure_booking_chat_channel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pending uuid;
  v_title text;
  v_location text;
  v_price numeric;
BEGIN
  IF NEW.status <> 'confirmed' OR OLD.status = 'confirmed' THEN
    RETURN NEW;
  END IF;

  BEGIN
    -- The guest may have inquired normally before booking: approve that
    -- thread rather than creating a duplicate.
    SELECT cr.id INTO v_pending FROM connection_requests cr
    WHERE cr.tenant_id = NEW.tenant_id
      AND cr.owner_id = NEW.owner_id
      AND cr.listing_id = NEW.listing_id
      AND cr.status = 'pending'
    LIMIT 1;

    IF v_pending IS NOT NULL THEN
      UPDATE connection_requests
      SET status = 'approved', responded_at = now()
      WHERE id = v_pending;
    ELSIF NOT EXISTS (
      SELECT 1 FROM connection_requests cr
      WHERE cr.tenant_id = NEW.tenant_id
        AND cr.owner_id = NEW.owner_id
        AND cr.listing_id = NEW.listing_id
        AND cr.status = 'approved'
    ) THEN
      SELECT l.title, l.location, l.price INTO v_title, v_location, v_price
      FROM listings l WHERE l.id = NEW.listing_id;

      INSERT INTO connection_requests
        (tenant_id, owner_id, listing_id, listing_title, listing_location, listing_price,
         message, status, responded_at, scanned_via_qr)
      VALUES
        (NEW.tenant_id, NEW.owner_id, NEW.listing_id,
         COALESCE(v_title, 'Vacation stay'), COALESCE(v_location, ''), COALESCE(v_price, 0),
         'Booking confirmed: ' || to_char(NEW.check_in, 'DD Mon') || ' - ' || to_char(NEW.check_out, 'DD Mon')
           || '. This chat connects you for arrival details.',
         'approved', now(), false);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- The chat channel is a companion to the booking, not a condition
    -- of it -- a failure here must not roll back a confirmation the
    -- host already made (and a refund cascade already ran for).
    RAISE WARNING 'booking chat channel failed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vacation_bookings_chat_channel ON vacation_bookings;
CREATE TRIGGER trg_vacation_bookings_chat_channel
  AFTER UPDATE OF status ON vacation_bookings
  FOR EACH ROW EXECUTE FUNCTION ensure_booking_chat_channel();

-- ---- 3. Backfill for bookings confirmed before this migration ----
UPDATE connection_requests cr
SET status = 'approved', responded_at = now()
FROM vacation_bookings vb
WHERE vb.status = 'confirmed'
  AND cr.status = 'pending'
  AND cr.tenant_id = vb.tenant_id
  AND cr.owner_id = vb.owner_id
  AND cr.listing_id = vb.listing_id;

INSERT INTO connection_requests
  (tenant_id, owner_id, listing_id, listing_title, listing_location, listing_price,
   message, status, responded_at, scanned_via_qr)
SELECT vb.tenant_id, vb.owner_id, vb.listing_id,
       COALESCE(l.title, 'Vacation stay'), COALESCE(l.location, ''), COALESCE(l.price, 0),
       'Booking confirmed: ' || to_char(vb.check_in, 'DD Mon') || ' - ' || to_char(vb.check_out, 'DD Mon')
         || '. This chat connects you for arrival details.',
       'approved', now(), false
FROM vacation_bookings vb
JOIN listings l ON l.id = vb.listing_id
WHERE vb.status = 'confirmed'
  AND NOT EXISTS (
    SELECT 1 FROM connection_requests cr
    WHERE cr.tenant_id = vb.tenant_id
      AND cr.owner_id = vb.owner_id
      AND cr.listing_id = vb.listing_id
      AND cr.status IN ('pending', 'approved')
  );

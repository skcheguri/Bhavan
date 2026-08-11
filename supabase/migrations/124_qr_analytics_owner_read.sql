-- ============================================================
-- "Public can read qr analytics" was USING (true): per-day scan and
-- message counts for every listing's QR code were readable by anyone
-- with the anon key -- a competitor could watch exactly how much foot
-- traffic another owner's QR posters generate. Writes were already
-- locked down (056/119: RPC only); reads now belong to the listing's
-- owner and admins. Nothing else reads this table: the scan page only
-- ever writes via the RPC.
-- ============================================================

DROP POLICY IF EXISTS "Public can read qr analytics" ON qr_analytics;

CREATE POLICY "Owners can read own listing qr analytics" ON qr_analytics
  FOR SELECT TO authenticated
  USING (
    is_admin()
    OR EXISTS (
      SELECT 1 FROM listings l
      WHERE l.id = qr_analytics.listing_id AND l.owner_id = auth.uid()
    )
  );

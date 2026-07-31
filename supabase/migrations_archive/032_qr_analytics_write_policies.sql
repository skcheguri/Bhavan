-- ============================================================
-- qr_analytics had a SELECT policy but no INSERT/UPDATE policy at all,
-- so every scan/conversion recording attempt (useQrAnalytics.ts's
-- recordScan/recordConversion, called from the QR scan landing page)
-- has been silently rejected by RLS since the feature was built --
-- confirmed empirically. bumpCounter() in useQrAnalytics.ts never
-- checked the returned `error`, so the rejection was completely
-- invisible; the QR analytics table has been permanently empty.
--
-- Anyone can scan a QR code without being logged in, so this needs to
-- be open the same way contact_attempts is (see migration 019) --
-- there's no owner-scoped identity to check against at write time.
-- ============================================================

CREATE POLICY "Anyone can record a QR scan" ON qr_analytics
FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update a QR scan count" ON qr_analytics
FOR UPDATE USING (true) WITH CHECK (true);

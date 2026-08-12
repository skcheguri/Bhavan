-- ============================================================
-- 129 follow-up: uploads to aadhaar-temp failed with "new row violates
-- row-level security policy" even with the INSERT policy in place.
--
-- Cause: Supabase Storage returns the created object from the upload
-- (INSERT ... RETURNING), and Postgres only permits RETURNING when the
-- new row is visible under a SELECT policy. 129 granted INSERT and
-- DELETE but no SELECT -- so the insert itself was rejected. The
-- avatars bucket never hit this because it has a public SELECT policy.
--
-- The fix stays narrow: the uploader may see their own folder's objects,
-- nobody else's, and there is still no public read -- IDfy reads via the
-- 5-minute signed URL the edge function issues with the service role.
-- ============================================================

DROP POLICY IF EXISTS "Users can read own aadhaar temp" ON storage.objects;
CREATE POLICY "Users can read own aadhaar temp"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'aadhaar-temp'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ============================================================
-- Transient storage for Aadhaar card images during OCR verification.
--
-- IDfy's Aadhaar OCR API fetches the card image from a URL (the
-- dashboard's "upload" is just hosting-to-URL). So the aadhaar-verify
-- function uploads the user's photo here, hands IDfy a short-lived
-- signed URL, and DELETES the object as soon as extraction returns --
-- the image is never retained. This bucket should never accumulate
-- rows; anything left is a failed cleanup and is safe to purge.
--
-- Private (no public read), tight MIME/size limits, and writes scoped to
-- the caller's own folder -- the same shape as avatars (migration 100),
-- but private because these are identity documents, not profile photos.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'aadhaar-temp',
  'aadhaar-temp',
  false,
  5242880,  -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- A user may write and remove only their own folder; nobody gets public
-- read (the function reads via the service role and issues the signed
-- URL). auth.uid() as the first path segment is the ownership check.
DROP POLICY IF EXISTS "Users can upload own aadhaar temp" ON storage.objects;
CREATE POLICY "Users can upload own aadhaar temp"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'aadhaar-temp'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can delete own aadhaar temp" ON storage.objects;
CREATE POLICY "Users can delete own aadhaar temp"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'aadhaar-temp'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

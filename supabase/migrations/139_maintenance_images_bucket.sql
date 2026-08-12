-- ============================================================
-- Photo attachments on maintenance requests.
--
-- maintenance_requests.images (text[]) existed and both the tenant and
-- owner views render it, but the create path always wrote [] -- there
-- was no way to attach a photo of the actual problem. This adds the
-- bucket the tenant uploads to; the create flow fills the column.
--
-- Public bucket like listing-images: an owner (and any assigned vendor)
-- needs to see the photo, and these are pictures of a leak or a broken
-- fitting, not identity documents. Writes are scoped to the uploader's
-- own folder so nobody can attach images under another user's path.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('maintenance-images', 'maintenance-images', true, 5242880,
        ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public, file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public can view maintenance images" ON storage.objects;
CREATE POLICY "Public can view maintenance images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'maintenance-images');

DROP POLICY IF EXISTS "Users upload own maintenance images" ON storage.objects;
CREATE POLICY "Users upload own maintenance images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'maintenance-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users delete own maintenance images" ON storage.objects;
CREATE POLICY "Users delete own maintenance images"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'maintenance-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

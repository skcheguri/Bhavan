-- ============================================================
-- Bhavan Platform -- Storage bucket for listing photos
-- ============================================================
-- No real photo upload exists anywhere in the app yet -- listings.images
-- has always been populated with a placeholder path. This adds a public
-- Storage bucket so owners can actually upload/remove photos from the
-- Edit Listing modal.
--
-- Path convention: {owner_id}/{listing_id}/{filename}
-- Policies below use the first path segment to confirm the uploader
-- owns the folder they're writing to.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('listing-images', 'listing-images', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public can view listing images" ON storage.objects FOR SELECT USING (
    bucket_id = 'listing-images'
);

CREATE POLICY "Owners can upload their own listing images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'listing-images' AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Owners can update their own listing images" ON storage.objects FOR UPDATE TO authenticated USING (
    bucket_id = 'listing-images' AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Owners can delete their own listing images" ON storage.objects FOR DELETE TO authenticated USING (
    bucket_id = 'listing-images' AND (storage.foldername(name))[1] = auth.uid()::text
);

-- ============================================================
-- END OF MIGRATION
-- ============================================================

-- ============================================================
-- listing-images and ownership-documents had no file_size_limit and no
-- allowed_mime_types -- the checks lived only in client JS, which anyone
-- with the anon key skips by calling the Storage API directly. That
-- allowed parking arbitrarily large files (storage is billed) and, for
-- the public listing-images bucket, serving arbitrary content types
-- from the app's storage domain. The avatars bucket (migration 100)
-- already did this properly; this brings the other two in line.
--
-- Limits mirror what the app's own upload paths accept:
--   * listing-images: useListingImages.ts enforces 5MB + jpeg/png/webp
--   * ownership-documents: list-property/register-flat accept
--     pdf/jpg/png scans of ownership papers; 10MB covers a scanned deed
-- Bucket limits apply to NEW uploads only; existing objects are
-- unaffected.
-- ============================================================

UPDATE storage.buckets
SET file_size_limit = 5242880,  -- 5MB
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'listing-images';

UPDATE storage.buckets
SET file_size_limit = 10485760,  -- 10MB
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'application/pdf']
WHERE id = 'ownership-documents';

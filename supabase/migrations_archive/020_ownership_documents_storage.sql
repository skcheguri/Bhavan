-- ============================================================
-- Storage bucket for property ownership verification documents.
--
-- The "Prove Property Ownership" step in list-property/page.tsx only
-- ever read a File object's .name into local state and faked a 1200ms
-- "verifying" delay -- nothing was ever uploaded anywhere, and
-- properties.verification_doc_url (a real column that's existed in the
-- schema all along) was never populated by anything. An owner could
-- click through the entire "prove ownership" step without ever
-- submitting real proof.
--
-- Unlike listing-images (007_listing_images_storage.sql), this bucket
-- is PRIVATE: these are proof-of-ownership documents (deeds, tax
-- receipts, utility bills with a name and address on them), not photos
-- meant to be publicly browsable. Only the uploading owner and admins
-- (for verification review) can read them.
--
-- Path convention: {owner_id}/{doc_type}/{timestamp}-{filename}
-- (doc_type folded into the path rather than adding a new properties
-- column, since it's only needed for an admin reviewing the file, not
-- for any query/filter logic).
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('ownership-documents', 'ownership-documents', false, 10485760, ARRAY['application/pdf', 'image/jpeg', 'image/png'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Owner can upload their own ownership documents" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'ownership-documents' AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Owner can view their own ownership documents" ON storage.objects
FOR SELECT TO authenticated USING (
    bucket_id = 'ownership-documents' AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Owner can delete their own ownership documents" ON storage.objects
FOR DELETE TO authenticated USING (
    bucket_id = 'ownership-documents' AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Admins can view all ownership documents" ON storage.objects
FOR SELECT USING (
    bucket_id = 'ownership-documents' AND is_admin()
);

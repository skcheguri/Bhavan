-- ============================================================
-- Admin review support for property ownership verification.
--
-- properties.verification_doc_url now actually gets populated (see
-- migration 020 + the real upload flow in list-property/page.tsx), but
-- there was no way for an admin to act on it: `verified` is a bare
-- boolean with no way to record *why* something was rejected, and
-- critically, there was no UPDATE policy letting an admin (who isn't
-- the property's owner) change it at all -- only
-- "Property owners can update own properties" (owner_id = auth.uid())
-- existed.
-- ============================================================

ALTER TABLE properties ADD COLUMN IF NOT EXISTS verification_rejection_reason TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS verification_reviewed_at TIMESTAMP WITH TIME ZONE;

CREATE POLICY "Admins can update any property" ON properties
FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());

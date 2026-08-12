-- ============================================================
-- Rental agreement signing -> stamp duty -> share workflow.
--
-- Until now signed_by_landlord / signed_by_tenant / shared_with_tenant
-- existed as flags with nothing that set them meaningfully: there was no
-- signing, and "sharing" bypassed any stamp-duty step. The real process
-- (2026-08 product decision) is:
--
--   1. Landlord and tenant each sign digitally -- a typed full name plus
--      consent, recorded with a timestamp (an electronic signature; the
--      legally stamped copy comes from step 3).
--   2. When BOTH have signed, the agreement moves to the Bhavan admin
--      team for stamp duty (agreement_status = 'pending_admin').
--   3. An admin does the stamp duty out of band, uploads the stamped PDF,
--      and it returns to the owner (status = 'stamped').
--   4. The owner shares the stamped copy with the tenant (status =
--      'completed').
--
-- Every transition runs through a SECURITY DEFINER RPC, never a direct
-- client update -- partly to enforce the order, and partly because the
-- existing "Owners can manage own agreements" policy has
-- WITH CHECK (signed_by_tenant = false), so the owner literally cannot
-- update the row once the tenant has signed.
-- ============================================================

-- ---- 1. Workflow columns ----
ALTER TABLE rental_agreements
  ADD COLUMN IF NOT EXISTS agreement_status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS landlord_signature_name text,
  ADD COLUMN IF NOT EXISTS landlord_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS tenant_signature_name text,
  ADD COLUMN IF NOT EXISTS tenant_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS stamped_document_path text,
  ADD COLUMN IF NOT EXISTS admin_processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_processed_by uuid REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE rental_agreements DROP CONSTRAINT IF EXISTS rental_agreements_status_check;
ALTER TABLE rental_agreements ADD CONSTRAINT rental_agreements_status_check
  CHECK (agreement_status IN ('draft', 'pending_admin', 'stamped', 'completed'));

-- Backfill from the existing flags so old rows land in a truthful state.
UPDATE rental_agreements SET agreement_status =
  CASE
    WHEN shared_with_tenant THEN 'completed'
    WHEN signed_by_landlord AND signed_by_tenant THEN 'pending_admin'
    ELSE 'draft'
  END
WHERE agreement_status = 'draft';

CREATE INDEX IF NOT EXISTS idx_rental_agreements_status ON rental_agreements (agreement_status);

-- ---- 2. Admins can read agreements (to do stamp duty) ----
DROP POLICY IF EXISTS "Admins can read all agreements" ON rental_agreements;
CREATE POLICY "Admins can read all agreements" ON rental_agreements
  FOR SELECT TO authenticated USING (is_admin());

-- ---- 3. Signing (either party) ----
CREATE OR REPLACE FUNCTION sign_rental_agreement(p_agreement_id uuid, p_signer_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a rental_agreements;
  v_name text := NULLIF(trim(p_signer_name), '');
BEGIN
  IF v_name IS NULL THEN RAISE EXCEPTION 'A signature name is required.'; END IF;

  SELECT * INTO a FROM rental_agreements WHERE id = p_agreement_id;
  IF a.id IS NULL THEN RAISE EXCEPTION 'Agreement not found.'; END IF;
  IF a.agreement_status NOT IN ('draft') THEN
    RAISE EXCEPTION 'This agreement is no longer open for signing.';
  END IF;

  IF auth.uid() = a.owner_id THEN
    IF a.signed_by_landlord THEN RAISE EXCEPTION 'You have already signed.'; END IF;
    UPDATE rental_agreements
      SET signed_by_landlord = true, landlord_signature_name = v_name, landlord_signed_at = now()
      WHERE id = p_agreement_id;
    -- prompt the tenant if they haven't signed
    IF NOT a.signed_by_tenant AND a.tenant_id IS NOT NULL THEN
      INSERT INTO notifications (user_id, type, title, message, action_url)
      VALUES (a.tenant_id, 'lease', 'Your landlord signed the agreement',
              'Sign your rental agreement (' || a.agreement_number || ') to move it forward.',
              '/tenant-profile?tab=rentManagement&sub=documents');
    END IF;
  ELSIF auth.uid() = a.tenant_id THEN
    IF a.signed_by_tenant THEN RAISE EXCEPTION 'You have already signed.'; END IF;
    UPDATE rental_agreements
      SET signed_by_tenant = true, tenant_signature_name = v_name, tenant_signed_at = now()
      WHERE id = p_agreement_id;
    IF NOT a.signed_by_landlord THEN
      INSERT INTO notifications (user_id, type, title, message, action_url)
      VALUES (a.owner_id, 'lease', 'Your tenant signed the agreement',
              'Sign the rental agreement (' || a.agreement_number || ') to move it forward.',
              '/owner-profile?tab=documents');
    END IF;
  ELSE
    RAISE EXCEPTION 'You are not a party to this agreement.';
  END IF;

  -- Both signed now? Move it to the admin team for stamp duty.
  SELECT * INTO a FROM rental_agreements WHERE id = p_agreement_id;
  IF a.signed_by_landlord AND a.signed_by_tenant AND a.agreement_status = 'draft' THEN
    UPDATE rental_agreements SET agreement_status = 'pending_admin' WHERE id = p_agreement_id;
    INSERT INTO notifications (user_id, type, title, message, action_url)
    VALUES (a.owner_id, 'lease', 'Agreement sent for stamp duty',
            'Both parties signed ' || a.agreement_number || '. The Bhavan team is processing stamp duty; you can share it with your tenant once it is ready.',
            '/owner-profile?tab=documents');
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION sign_rental_agreement(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION sign_rental_agreement(uuid, text) TO authenticated;

-- ---- 4. Admin completes stamp duty ----
CREATE OR REPLACE FUNCTION admin_stamp_rental_agreement(p_agreement_id uuid, p_document_path text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a rental_agreements;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'Admins only.'; END IF;
  IF NULLIF(trim(p_document_path), '') IS NULL THEN RAISE EXCEPTION 'The stamped document is required.'; END IF;

  SELECT * INTO a FROM rental_agreements WHERE id = p_agreement_id;
  IF a.id IS NULL THEN RAISE EXCEPTION 'Agreement not found.'; END IF;
  IF a.agreement_status <> 'pending_admin' THEN
    RAISE EXCEPTION 'This agreement is not awaiting stamp duty.';
  END IF;

  UPDATE rental_agreements
    SET agreement_status = 'stamped', stamped_document_path = p_document_path,
        admin_processed_at = now(), admin_processed_by = auth.uid()
    WHERE id = p_agreement_id;

  INSERT INTO notifications (user_id, type, title, message, action_url)
  VALUES (a.owner_id, 'lease', 'Stamped agreement ready',
          'The stamped copy of ' || a.agreement_number || ' is ready. Review it and share it with your tenant.',
          '/owner-profile?tab=documents');
END;
$$;

REVOKE EXECUTE ON FUNCTION admin_stamp_rental_agreement(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_stamp_rental_agreement(uuid, text) TO authenticated;

-- ---- 5. Owner shares the stamped copy with the tenant ----
CREATE OR REPLACE FUNCTION share_rental_agreement(p_agreement_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a rental_agreements;
BEGIN
  SELECT * INTO a FROM rental_agreements WHERE id = p_agreement_id;
  IF a.id IS NULL THEN RAISE EXCEPTION 'Agreement not found.'; END IF;
  IF auth.uid() <> a.owner_id THEN RAISE EXCEPTION 'Only the owner can share this agreement.'; END IF;
  IF a.agreement_status <> 'stamped' THEN
    RAISE EXCEPTION 'This agreement is not ready to share yet.';
  END IF;

  UPDATE rental_agreements
    SET agreement_status = 'completed', shared_with_tenant = true, shared_at = now()
    WHERE id = p_agreement_id;

  IF a.tenant_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, type, title, message, action_url)
    VALUES (a.tenant_id, 'lease', 'Your stamped rental agreement is ready',
            'Your landlord shared the stamped rental agreement (' || a.agreement_number || ') with you.',
            '/tenant-profile?tab=rentManagement&sub=documents');
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION share_rental_agreement(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION share_rental_agreement(uuid) TO authenticated;

-- ---- 6. Storage for the stamped PDFs ----
-- Private bucket; admin uploads to <agreement_id>/<file>; the two parties
-- can read their own agreement's file (via a signed URL they generate),
-- nobody else.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('stamped-agreements', 'stamped-agreements', false, 10485760,
        ARRAY['application/pdf', 'image/jpeg', 'image/png'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public, file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Admins upload stamped agreements" ON storage.objects;
CREATE POLICY "Admins upload stamped agreements"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'stamped-agreements' AND is_admin());

DROP POLICY IF EXISTS "Admins manage stamped agreements" ON storage.objects;
CREATE POLICY "Admins manage stamped agreements"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'stamped-agreements' AND is_admin());

DROP POLICY IF EXISTS "Parties read stamped agreements" ON storage.objects;
CREATE POLICY "Parties read stamped agreements"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'stamped-agreements'
    AND EXISTS (
      SELECT 1 FROM rental_agreements ra
      WHERE ra.id = ((storage.foldername(name))[1])::uuid
        AND (ra.owner_id = auth.uid() OR ra.tenant_id = auth.uid() OR is_admin())
    )
  );

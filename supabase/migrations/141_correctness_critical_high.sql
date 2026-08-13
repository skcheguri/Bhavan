-- ============================================================
-- Database correctness audit (2026-08-13) — Critical + High.
--
-- The recurring shape of these findings: a carefully-guarded 2026-era
-- workflow (SECURITY DEFINER RPCs, field-level triggers) sitting on top of
-- a permissive baseline policy that quietly makes the guard optional. The
-- three highest-value tables — rent_payments, rental_agreements,
-- connection_requests — all had this. This migration closes them.
--
--   #1 (Critical) rent_payments: owner UPDATE policy pinned only `status`,
--      so a direct PATCH could rewrite amount/tenant/month/razorpay ids.
--   #2 (High)     rental_agreements: no trigger guarding the workflow
--      columns, so an owner could self-advance/stamp/share a draft outside
--      the RPCs while signed_by_tenant was still false.
--   #3 (High)     connection_requests: a FOR ALL owner policy re-opened
--      INSERT/DELETE, letting an owner fabricate an inquiry from a user who
--      blocked them (bypassing migration 114).
--   #5 (High)     property_has_active_tenancy() counted drafts and
--      open-ended agreements forever, permanently locking occupancy.
--   #14 rides along with #2 (same function): sign_rental_agreement now
--      locks the row it reads.
--
-- #4 was already fixed by migration 140.
-- ============================================================

-- ---- #1  rent_payments immutable fields ----
-- rent_payments was the only money table with no immutable-fields trigger;
-- its owner UPDATE policy (WITH CHECK status='reconciled') constrained a
-- single column. The server (service role, auth.uid() IS NULL) settles
-- payments and admins moderate; a signed-in owner's only legitimate write
-- is reconciliation (status -> reconciled, plus the reconcile note), which
-- pending->reconciled offline records rely on. So we don't touch the status
-- transition — we make the money and the identities immutable to the owner,
-- which is the actual exploit: rewriting an amount, reattributing a payment
-- to another user, or forging a razorpay_payment_id (which the webhook's
-- refund reconciler matches on).
CREATE OR REPLACE FUNCTION public.enforce_rent_payment_immutable_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF auth.uid() IS NOT NULL AND NOT is_admin() THEN
        IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
            OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
            OR NEW.property_id IS DISTINCT FROM OLD.property_id
            OR NEW.property_unit_id IS DISTINCT FROM OLD.property_unit_id
            OR NEW.amount IS DISTINCT FROM OLD.amount
            OR NEW.month IS DISTINCT FROM OLD.month
            OR NEW.payment_mode IS DISTINCT FROM OLD.payment_mode
            OR NEW.transaction_ref IS DISTINCT FROM OLD.transaction_ref
            OR NEW.agreement_id IS DISTINCT FROM OLD.agreement_id
            OR NEW.razorpay_order_id IS DISTINCT FROM OLD.razorpay_order_id
            OR NEW.razorpay_payment_id IS DISTINCT FROM OLD.razorpay_payment_id
            OR NEW.failure_reason IS DISTINCT FROM OLD.failure_reason
            OR NEW.created_at IS DISTINCT FROM OLD.created_at
        THEN
            RAISE EXCEPTION 'rent_payments: amount, the parties, the month and the payment identifiers are immutable; an owner may only reconcile.';
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_rent_payments_immutable_fields ON rent_payments;
CREATE TRIGGER trg_rent_payments_immutable_fields
    BEFORE UPDATE ON rent_payments
    FOR EACH ROW EXECUTE FUNCTION enforce_rent_payment_immutable_fields();

-- ---- #2 + #14  rental_agreements workflow columns ----
-- The signing/stamp-duty/share workflow (137) routes every transition
-- through a SECURITY DEFINER RPC, but nothing stopped the owner PATCHing
-- the workflow columns directly while signed_by_tenant was still false.
-- Guard them with a trigger: the RPCs announce themselves by setting a
-- transaction-local flag (bhavan.agreement_rpc), which a direct client
-- PATCH can never set. Admins and the service role stay exempt.
CREATE OR REPLACE FUNCTION public.enforce_rental_agreement_workflow_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF NOT is_admin()
        AND auth.uid() IS NOT NULL
        AND current_setting('bhavan.agreement_rpc', true) IS DISTINCT FROM 'on'
    THEN
        IF NEW.agreement_status IS DISTINCT FROM OLD.agreement_status
            OR NEW.signed_by_landlord IS DISTINCT FROM OLD.signed_by_landlord
            OR NEW.signed_by_tenant IS DISTINCT FROM OLD.signed_by_tenant
            OR NEW.landlord_signature_name IS DISTINCT FROM OLD.landlord_signature_name
            OR NEW.landlord_signed_at IS DISTINCT FROM OLD.landlord_signed_at
            OR NEW.tenant_signature_name IS DISTINCT FROM OLD.tenant_signature_name
            OR NEW.tenant_signed_at IS DISTINCT FROM OLD.tenant_signed_at
            OR NEW.stamped_document_path IS DISTINCT FROM OLD.stamped_document_path
            OR NEW.shared_with_tenant IS DISTINCT FROM OLD.shared_with_tenant
            OR NEW.shared_at IS DISTINCT FROM OLD.shared_at
            OR NEW.admin_processed_at IS DISTINCT FROM OLD.admin_processed_at
            OR NEW.admin_processed_by IS DISTINCT FROM OLD.admin_processed_by
        THEN
            RAISE EXCEPTION 'rental_agreements: signing, stamping and sharing happen only through the agreement RPCs.';
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_rental_agreements_workflow_columns ON rental_agreements;
CREATE TRIGGER trg_rental_agreements_workflow_columns
    BEFORE UPDATE ON rental_agreements
    FOR EACH ROW EXECUTE FUNCTION enforce_rental_agreement_workflow_columns();

-- Re-declare the two owner/party-run RPCs so they raise the guard flag
-- (admin_stamp is is_admin()-gated, which the trigger already exempts, so
-- it needs no flag). sign_rental_agreement also now locks the row it reads
-- (#14) — harmless today because both parties UPDATE the same row and
-- Postgres serialises that, but it makes the read/write consistent and
-- robust to future refactors.
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
  PERFORM set_config('bhavan.agreement_rpc', 'on', true);
  IF v_name IS NULL THEN RAISE EXCEPTION 'A signature name is required.'; END IF;

  SELECT * INTO a FROM rental_agreements WHERE id = p_agreement_id FOR UPDATE;
  IF a.id IS NULL THEN RAISE EXCEPTION 'Agreement not found.'; END IF;
  IF a.agreement_status NOT IN ('draft') THEN
    RAISE EXCEPTION 'This agreement is no longer open for signing.';
  END IF;

  IF auth.uid() = a.owner_id THEN
    IF a.signed_by_landlord THEN RAISE EXCEPTION 'You have already signed.'; END IF;
    UPDATE rental_agreements
      SET signed_by_landlord = true, landlord_signature_name = v_name, landlord_signed_at = now()
      WHERE id = p_agreement_id;
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

CREATE OR REPLACE FUNCTION share_rental_agreement(p_agreement_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a rental_agreements;
BEGIN
  PERFORM set_config('bhavan.agreement_rpc', 'on', true);
  SELECT * INTO a FROM rental_agreements WHERE id = p_agreement_id FOR UPDATE;
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

-- ---- #3  connection_requests owner policy ----
-- The FOR ALL owner policy (no WITH CHECK) let an owner INSERT a fabricated
-- request naming any tenant — including one who blocked them, bypassing
-- migration 114's block clause — and DELETE rows (which also silently
-- drifts listings.inquiries_count). An owner only ever needs to read and
-- respond, so split it into SELECT + UPDATE with an explicit WITH CHECK.
-- The tenant-initiated INSERT (114) and the booking-confirm insert (127,
-- run by the service role) are unaffected. No app path deletes these.
DROP POLICY IF EXISTS "Owners can read and update their requests" ON connection_requests;

CREATE POLICY "Owners can read their requests" ON connection_requests
  AS PERMISSIVE FOR SELECT TO public
  USING (owner_id = auth.uid());

CREATE POLICY "Owners can respond to their requests" ON connection_requests
  AS PERMISSIVE FOR UPDATE TO public
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- ---- #5  property_has_active_tenancy status filter ----
-- The predicate counted any draft or open-ended agreement as a live
-- tenancy forever, so an abandoned draft pinned a flat to rented_out with
-- no way out. Restrict "active" to agreements that are genuinely in force —
-- both parties signed (pending_admin) or beyond — still honouring the
-- open-ended (NULL end date) case for those.
CREATE OR REPLACE FUNCTION public.property_has_active_tenancy(p_property uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM rental_agreements ra
    JOIN listings l ON l.id = ra.listing_id
    WHERE l.property_id = p_property
      AND ra.agreement_status IN ('pending_admin', 'stamped', 'completed')
      AND (ra.lease_end_date IS NULL OR ra.lease_end_date >= CURRENT_DATE)
  );
$function$;

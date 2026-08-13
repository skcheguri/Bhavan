-- ============================================================
-- Make stamp duty optional in the rental-agreement workflow.
--
-- Until now every fully-signed agreement was forced through the Bhavan
-- admin stamp-duty queue before the owner could share it. Stamp duty is
-- a real need for some tenancies and unnecessary for others, so the
-- owner now chooses per agreement (a checkbox at creation):
--
--   * stamp_duty_requested = true  (default, unchanged behaviour):
--       both sign -> 'pending_admin' -> admin stamps -> 'stamped'
--       -> owner shares -> 'completed'.
--   * stamp_duty_requested = false (skip): both sign -> 'signed'
--       -> owner shares the digitally-signed copy -> 'completed'.
--       The admin queue is never involved.
--
-- 'signed' is a new status: both parties have digitally signed and the
-- agreement is in force, just not stamped. It is treated as a live
-- tenancy everywhere pending_admin is (occupancy, account-deletion
-- guard) -- a signed lease binds the parties whether or not it was
-- stamped.
-- ============================================================

-- ---- 1. Owner's per-agreement choice + the new status value ----
ALTER TABLE rental_agreements
  ADD COLUMN IF NOT EXISTS stamp_duty_requested boolean NOT NULL DEFAULT true;

ALTER TABLE rental_agreements DROP CONSTRAINT IF EXISTS rental_agreements_status_check;
ALTER TABLE rental_agreements ADD CONSTRAINT rental_agreements_status_check
  CHECK (agreement_status IN ('draft', 'pending_admin', 'signed', 'stamped', 'completed'));

-- ---- 2. Signing branches on the stamp-duty choice ----
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

  -- Both signed now? Route by the owner's stamp-duty choice.
  SELECT * INTO a FROM rental_agreements WHERE id = p_agreement_id;
  IF a.signed_by_landlord AND a.signed_by_tenant AND a.agreement_status = 'draft' THEN
    IF a.stamp_duty_requested THEN
      UPDATE rental_agreements SET agreement_status = 'pending_admin' WHERE id = p_agreement_id;
      INSERT INTO notifications (user_id, type, title, message, action_url)
      VALUES (a.owner_id, 'lease', 'Agreement sent for stamp duty',
              'Both parties signed ' || a.agreement_number || '. The Bhavan team is processing stamp duty; you can share it with your tenant once it is ready.',
              '/owner-profile?tab=documents');
    ELSE
      UPDATE rental_agreements SET agreement_status = 'signed' WHERE id = p_agreement_id;
      INSERT INTO notifications (user_id, type, title, message, action_url)
      VALUES (a.owner_id, 'lease', 'Agreement ready to share',
              'Both parties signed ' || a.agreement_number || '. You can now share the signed agreement with your tenant.',
              '/owner-profile?tab=documents');
    END IF;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION sign_rental_agreement(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION sign_rental_agreement(uuid, text) TO authenticated;

-- ---- 3. Sharing accepts a signed (skip-stamp-duty) copy too ----
CREATE OR REPLACE FUNCTION share_rental_agreement(p_agreement_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a rental_agreements;
  v_was_stamped boolean;
BEGIN
  PERFORM set_config('bhavan.agreement_rpc', 'on', true);
  SELECT * INTO a FROM rental_agreements WHERE id = p_agreement_id FOR UPDATE;
  IF a.id IS NULL THEN RAISE EXCEPTION 'Agreement not found.'; END IF;
  IF auth.uid() <> a.owner_id THEN RAISE EXCEPTION 'Only the owner can share this agreement.'; END IF;
  IF a.agreement_status NOT IN ('stamped', 'signed') THEN
    RAISE EXCEPTION 'This agreement is not ready to share yet.';
  END IF;

  v_was_stamped := (a.agreement_status = 'stamped');

  UPDATE rental_agreements
    SET agreement_status = 'completed', shared_with_tenant = true, shared_at = now()
    WHERE id = p_agreement_id;

  IF a.tenant_id IS NOT NULL THEN
    INSERT INTO notifications (user_id, type, title, message, action_url)
    VALUES (a.tenant_id, 'lease',
            CASE WHEN v_was_stamped THEN 'Your stamped rental agreement is ready'
                 ELSE 'Your signed rental agreement is ready' END,
            'Your landlord shared the '
              || CASE WHEN v_was_stamped THEN 'stamped' ELSE 'signed' END
              || ' rental agreement (' || a.agreement_number || ') with you.',
            '/tenant-profile?tab=rentManagement&sub=documents');
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION share_rental_agreement(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION share_rental_agreement(uuid) TO authenticated;

-- ---- 4. A signed lease is a live tenancy (occupancy) ----
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
      AND ra.agreement_status IN ('pending_admin', 'signed', 'stamped', 'completed')
      AND (ra.lease_end_date IS NULL OR ra.lease_end_date >= CURRENT_DATE)
  );
$function$;

-- ---- 5. A signed lease also blocks account deletion ----
-- Reproduces delete_my_account() as of migration 146, adding 'signed' to
-- the in-force set so an owner who skipped stamp duty can't self-delete
-- mid-tenancy and strand the tenant with an uncontactable counterparty.
CREATE OR REPLACE FUNCTION delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  caller_role text;
  active_leases integer;
  active_bookings integer;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role INTO caller_role FROM users WHERE id = uid;
  IF caller_role = 'admin' THEN
    RAISE EXCEPTION 'Admin accounts can''t be self-deleted through this flow -- have another admin remove your admin access first.';
  END IF;

  SELECT count(*) INTO active_leases
  FROM rental_agreements
  WHERE (owner_id = uid OR tenant_id = uid)
    AND agreement_status IN ('pending_admin', 'signed', 'stamped', 'completed')
    AND (lease_end_date IS NULL OR lease_end_date >= CURRENT_DATE);

  IF active_leases > 0 THEN
    RAISE EXCEPTION 'You still have % rental agreement(s) running. End or transfer the tenancy before deleting your account, so the other party isn''t left without a contactable counterparty.', active_leases;
  END IF;

  SELECT count(*) INTO active_bookings
  FROM vacation_bookings
  WHERE (owner_id = uid OR tenant_id = uid)
    AND (
      (status IN ('pending', 'confirmed') AND check_out >= CURRENT_DATE)
      OR (payment_status = 'paid' AND payout_status = 'unpaid')
    );

  IF active_bookings > 0 THEN
    RAISE EXCEPTION 'You have % vacation booking(s) that are still active or hold money that hasn''t been settled yet. Cancel or complete them -- and let any host payout clear -- before deleting your account.', active_bookings;
  END IF;

  PERFORM set_config('bhavan.trusted_verification_write', 'true', true);

  UPDATE users SET
    name = 'Deleted User',
    email = 'deleted-' || uid::text || '@deleted.mybhavan.invalid',
    phone = NULL,
    avatar_url = NULL,
    date_of_birth = NULL,
    occupation = NULL,
    emergency_contact = NULL,
    current_flat = NULL,
    move_in_date = NULL,
    aadhaar_last4 = NULL,
    aadhaar_verified_at = NULL,
    aadhaar_verification_status = 'unverified',
    verified_email = false,
    verified_phone = false,
    verified_aadhaar = false,
    deleted_at = now()
  WHERE id = uid;

  UPDATE rental_agreements
  SET tenant_phone = NULL, tenant_email = NULL
  WHERE tenant_id = uid;

  UPDATE rental_agreements
  SET landlord_phone = NULL, landlord_email = NULL
  WHERE owner_id = uid;

  UPDATE listings SET status = 'inactive' WHERE owner_id = uid;

  DELETE FROM saved_listings WHERE user_id = uid;
  DELETE FROM notifications WHERE user_id = uid;
  DELETE FROM notification_preferences WHERE user_id = uid;
  DELETE FROM user_push_tokens WHERE user_id = uid;

  DELETE FROM host_payout_accounts WHERE user_id = uid;

  DELETE FROM auth.users WHERE id = uid;
END;
$$;

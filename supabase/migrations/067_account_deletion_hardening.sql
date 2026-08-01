-- Two real defects in delete_my_account() (migration 064):
--
-- 1. It scrubbed the users row but left the personal data COPIED into
--    rental_agreements and rent_receipts at generation time
--    (tenant_name/phone/email/pan/aadhaar_masked, landlord_*). The
--    delete dialog promised name, email and phone were "permanently
--    erased" and that records "will no longer show your name" -- both
--    were false, and the DPDP erasure claim was not met.
--
--    Contact details (phone, email) are erased: a legal record does not
--    need to remain a way to contact someone who has left. Name and PAN
--    are RETAINED, because they identify the parties to an executed
--    tenancy agreement and a rent receipt used for HRA/tax claims -- the
--    counterparty's ability to rely on that document is exactly the kind
--    of legal obligation the DPDP Act's retention carve-out covers. The
--    UI now states this precisely instead of overpromising.
--
-- 2. An owner mid-tenancy could delete unconditionally, stranding their
--    tenant with a landlord who had no phone, an unreachable email and
--    no login. Deletion is now blocked while a lease is still running,
--    with a message explaining what to do.
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
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role INTO caller_role FROM users WHERE id = uid;
  IF caller_role = 'admin' THEN
    RAISE EXCEPTION 'Admin accounts can''t be self-deleted through this flow -- have another admin remove your admin access first.';
  END IF;

  -- A lease with an end date in the future that both sides are still
  -- relying on. Counted for either side of the agreement.
  SELECT count(*) INTO active_leases
  FROM rental_agreements
  WHERE (owner_id = uid OR tenant_id = uid)
    AND lease_end_date IS NOT NULL
    AND lease_end_date >= CURRENT_DATE;

  IF active_leases > 0 THEN
    RAISE EXCEPTION 'You still have % rental agreement(s) running. End or transfer the tenancy before deleting your account, so the other party isn''t left without a contactable counterparty.', active_leases;
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

  -- Erase contact details denormalized into legal documents; keep the
  -- identifying name/PAN the documents' legal and tax function depends on.
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

  DELETE FROM auth.users WHERE id = uid;
END;
$$;

-- ============================================================
-- Two gaps in delete_my_account() (last set in migration 142):
--
-- 1. VACATION BOOKINGS were invisible to the deletion guard, which only
--    looked at rental_agreements. A host could delete while a guest had
--    a paid, still-upcoming stay -- stranding them with a "Deleted User"
--    host who has no phone, no email and no login -- or, worse for the
--    host themselves, while the platform still owed them a payout for a
--    completed/no-show stay (payment collected, payout not yet sent),
--    which erasing their account would make unpayable. Deletion is now
--    blocked while either side has a booking that is still live or holds
--    money that hasn't been settled.
--
-- 2. HOST PAYOUT DETAILS (host_payout_accounts: bank account number,
--    IFSC, account holder, UPI id) were never erased. The table's FK is
--    ON DELETE CASCADE off users, but this flow ANONYMIZES the users row
--    rather than deleting it, so the cascade never fires and the
--    financial PII survived in place. It's now deleted explicitly during
--    the scrub -- there is no counterparty interest in a host's own
--    payout destination, and the guard above guarantees no payout is
--    still owed by the time we reach it.
-- ============================================================
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
    AND agreement_status IN ('pending_admin', 'stamped', 'completed')
    AND (lease_end_date IS NULL OR lease_end_date >= CURRENT_DATE);

  IF active_leases > 0 THEN
    RAISE EXCEPTION 'You still have % rental agreement(s) running. End or transfer the tenancy before deleting your account, so the other party isn''t left without a contactable counterparty.', active_leases;
  END IF;

  -- Vacation bookings, either side of the deal. Blocks when:
  --   * a stay is still live: pending (guest paid, host yet to respond) or
  --     confirmed, and check-out is today or later -- deleting now would
  --     strand the counterparty; or
  --   * money is still in limbo: payment collected but payout_status is
  --     unpaid -- a host payout not yet sent, or a forfeit/refund an admin
  --     hasn't decided. (declined/refunded bookings flip payment_status to
  --     'refunded' and no longer match; awaiting_payment holds no money.)
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

  -- Sensitive financial PII with no counterparty interest in retention.
  -- The ON DELETE CASCADE off users never fires here (the row is
  -- anonymized, not deleted), so erase it explicitly. Safe: the guard
  -- above refuses deletion while any payout is still owed.
  DELETE FROM host_payout_accounts WHERE user_id = uid;

  DELETE FROM auth.users WHERE id = uid;
END;
$$;

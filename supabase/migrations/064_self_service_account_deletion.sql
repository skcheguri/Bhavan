-- Real self-service account deletion, replacing the "files a support
-- ticket and someone eventually processes it manually" flow (the old
-- DeleteAccountModal just called the generic contact-inquiry hook --
-- nothing was ever actually deleted by the app itself).
--
-- rent_payments, billing_history, rental_agreements, and rent_receipts
-- all have owner_id (and rent_payments' tenant_id too) as
-- ON DELETE RESTRICT specifically so financial/legal records can't be
-- silently destroyed by deleting a users row -- meaning a real hard
-- `DELETE FROM users` only even succeeds for an account with zero
-- history (same as purge_unconfirmed_accounts(), migration 058). For
-- any account that's actually been used, the correct DPDP-compliant
-- erasure is: scrub personal fields in place (the row survives so the
-- OTHER party's rent_payments/agreements/reviews keep a valid FK,
-- showing "Deleted User" instead of breaking), then revoke login
-- entirely by deleting the auth.users row. There is no FK between
-- public.users and auth.users (confirmed against this baseline: the two
-- are linked only by matching UUID via the provisioning trigger), so
-- deleting auth.users does NOT cascade-delete the just-scrubbed
-- public.users row.
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE OR REPLACE FUNCTION delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  caller_role text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role INTO caller_role FROM users WHERE id = uid;
  IF caller_role = 'admin' THEN
    RAISE EXCEPTION 'Admin accounts can''t be self-deleted through this flow -- have another admin remove your admin access first.';
  END IF;

  -- protect_privileged_user_columns_trigger otherwise pins verified_*/
  -- aadhaar_* columns back to their old values on any non-admin UPDATE
  -- (see that function's own definition) -- this is its documented
  -- escape hatch for legitimate server-side writes, same pattern the
  -- Aadhaar-verification and phone-confirmation triggers already use.
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

  -- Can't leave live listings up for an account that's being deleted.
  UPDATE listings SET status = 'inactive' WHERE owner_id = uid;

  -- Preference/device data with no counterparty interest in retaining --
  -- unlike rent_payments/agreements/reviews, nobody else needs this.
  DELETE FROM saved_listings WHERE user_id = uid;
  DELETE FROM notifications WHERE user_id = uid;
  DELETE FROM notification_preferences WHERE user_id = uid;
  DELETE FROM user_push_tokens WHERE user_id = uid;

  -- Revokes login immediately. No FK links auth.users -> public.users,
  -- so this does not cascade-delete the row just anonymized above.
  DELETE FROM auth.users WHERE id = uid;
END;
$$;

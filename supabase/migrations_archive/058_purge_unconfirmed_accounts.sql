-- Signup creates the auth.users row (and, via the existing provisioning
-- trigger, a matching public.users profile) the moment the form is
-- submitted -- before email confirmation. An address that's fake or never
-- gets clicked leaves a permanent, unusable row behind (confirmed: a real
-- test signup to a made-up address sat there indefinitely). This purges
-- those after 30 days, logging what was removed so admins retain a record
-- even after the account itself is gone.
--
-- Purge criterion is verified_email = false AND verified_phone = false --
-- NOT verified_email alone. This app also supports phone-OTP signup
-- (sendPhoneOtp/verifyPhoneOtp in useAuth.ts), where an account is fully
-- legitimate and active with verified_phone = true but verified_email
-- permanently false since they never added an email. Only accounts that
-- never confirmed ANY contact method are truly abandoned.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

CREATE TABLE purged_unconfirmed_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_user_id uuid NOT NULL,
  email text,
  phone text,
  name text,
  role text,
  account_created_at timestamptz,
  purged_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE purged_unconfirmed_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read purge history" ON purged_unconfirmed_accounts
  FOR SELECT USING (is_admin());

CREATE OR REPLACE FUNCTION purge_unconfirmed_accounts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  purged_ids uuid[];
BEGIN
  WITH candidates AS (
    SELECT id, email, phone, name, role, created_at
    FROM users
    WHERE verified_email = false
      AND verified_phone = false
      AND created_at < now() - interval '30 days'
  ),
  inserted AS (
    INSERT INTO purged_unconfirmed_accounts (original_user_id, email, phone, name, role, account_created_at)
    SELECT id, email, phone, name, role, created_at FROM candidates
    RETURNING original_user_id
  )
  SELECT array_agg(original_user_id) INTO purged_ids FROM inserted;

  IF purged_ids IS NULL THEN
    RETURN 0;
  END IF;

  DELETE FROM users WHERE id = ANY(purged_ids);
  DELETE FROM auth.users WHERE id = ANY(purged_ids);

  RETURN array_length(purged_ids, 1);
END;
$$;

SELECT cron.schedule('purge-unconfirmed-accounts', '0 3 * * *', 'SELECT purge_unconfirmed_accounts();');

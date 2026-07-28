-- ============================================================
-- Fix a live bug + wire real OTP-backed phone/email verification.
--
-- BUG (confirmed empirically via a rolled-back transaction): migration
-- 022's protect_privileged_user_columns() trigger pins verified_aadhaar,
-- aadhaar_last4, aadhaar_verification_status and aadhaar_verified_at back
-- to their OLD values unless is_admin() is true. But the aadhaar-verify
-- edge function deliberately runs as the CALLER's own JWT (not a service
-- role or an admin -- see that function's comment), so its own
-- `UPDATE users SET verified_aadhaar = true, ...` was being silently
-- discarded by this exact trigger the whole time. A real user completing
-- real Aadhaar OTP verification with the KYC provider would get
-- `{success: true}` back from the function yet their row would never
-- actually flip to verified.
--
-- Fix: a transaction-local escape hatch (bhavan.trusted_verification_write)
-- that only a SECURITY DEFINER RPC we control can set, immediately before
-- performing the trusted write, all within the same request/transaction.
-- Column-value pinning still applies to everyone else, including a plain
-- client-side `users.update(...)` from the free-text Overview edit form.
--
-- Also: verified_phone/verified_email existed in the schema but were
-- never kept in sync with anything after initial signup -- editing your
-- phone number in the free-text Overview field flips `phone` with zero
-- proof of ownership, and the "Phone/Email Verified" badges were reading
-- values that could never become true except at signup. This migration
-- makes both real:
--   * Changing `phone` through the untrusted path immediately un-verifies
--     it (mirrors how changing email already requires re-confirmation).
--   * auth.users triggers sync verified_phone/verified_email into
--     public.users whenever Supabase Auth actually confirms a phone
--     (phone_change OTP) or email (confirmation link), including the
--     Google OAuth case where email_confirmed_at is already set at
--     account creation.
-- ============================================================

-- ---- 1. Escape hatch + downgrade-on-change in the existing guard ----
CREATE OR REPLACE FUNCTION protect_privileged_user_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF is_admin() OR current_setting('bhavan.trusted_verification_write', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role AND (NEW.role = 'admin' OR OLD.role = 'admin') THEN
    NEW.role := OLD.role;
  END IF;
  NEW.verified_email := OLD.verified_email;
  NEW.verified_aadhaar := OLD.verified_aadhaar;
  NEW.aadhaar_last4 := OLD.aadhaar_last4;
  NEW.aadhaar_verified_at := OLD.aadhaar_verified_at;
  NEW.aadhaar_verification_status := OLD.aadhaar_verification_status;

  -- verified_phone isn't just pinned: a phone number that just changed
  -- (via the free-text Overview field) hasn't been proven to belong to
  -- this user, so it must drop back to unverified rather than keep
  -- whatever the previous number's verified state was.
  IF NEW.phone IS DISTINCT FROM OLD.phone THEN
    NEW.verified_phone := false;
  ELSE
    NEW.verified_phone := OLD.verified_phone;
  END IF;

  RETURN NEW;
END;
$$;

-- ---- 2. RPCs used by trusted server-side verification writers ----
-- Used by the aadhaar-verify edge function in place of raw table updates.
CREATE OR REPLACE FUNCTION set_aadhaar_verification_status(p_status TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  PERFORM set_config('bhavan.trusted_verification_write', 'true', true);
  UPDATE users SET aadhaar_verification_status = p_status WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION set_aadhaar_verification_status(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION mark_aadhaar_verified(p_last4 TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  PERFORM set_config('bhavan.trusted_verification_write', 'true', true);
  UPDATE users
  SET verified_aadhaar = true,
      aadhaar_last4 = p_last4,
      aadhaar_verification_status = 'verified',
      aadhaar_verified_at = now()
  WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION mark_aadhaar_verified(TEXT) TO authenticated;

-- ---- 3. Keep verified_email / phone+verified_phone synced from auth.users ----
-- Fires when Supabase Auth actually confirms a (new) email address --
-- either the post-signup confirmation link, or a later email change
-- (see migration 009, which this extends rather than replaces).
CREATE OR REPLACE FUNCTION handle_auth_user_email_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.email IS DISTINCT FROM OLD.email THEN
        PERFORM set_config('bhavan.trusted_verification_write', 'true', true);
        UPDATE public.users SET email = NEW.email, verified_email = (NEW.email_confirmed_at IS NOT NULL) WHERE id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$;

-- Covers the plain password-signup path: the row is inserted unconfirmed,
-- then Supabase flips email_confirmed_at via UPDATE once the link is
-- clicked (no email column change, so the trigger above doesn't fire).
CREATE OR REPLACE FUNCTION handle_auth_user_email_confirmed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.email_confirmed_at IS NOT NULL AND OLD.email_confirmed_at IS NULL THEN
        PERFORM set_config('bhavan.trusted_verification_write', 'true', true);
        UPDATE public.users SET verified_email = true WHERE id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_email_confirmed ON auth.users;
CREATE TRIGGER on_auth_user_email_confirmed
    AFTER UPDATE OF email_confirmed_at ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_auth_user_email_confirmed();

-- Phone: mirrors the email handling above. Covers both the initial
-- phone-change OTP send (supabase.auth.updateUser({ phone })) and its
-- confirmation (verifyOtp({ phone, token, type: 'phone_change' })),
-- which for phone lands as a single auth.users UPDATE once confirmed.
CREATE OR REPLACE FUNCTION handle_auth_user_phone_confirmed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.phone_confirmed_at IS NOT NULL
       AND (OLD.phone_confirmed_at IS NULL OR NEW.phone IS DISTINCT FROM OLD.phone) THEN
        PERFORM set_config('bhavan.trusted_verification_write', 'true', true);
        UPDATE public.users SET phone = NEW.phone, verified_phone = true WHERE id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_phone_confirmed ON auth.users;
CREATE TRIGGER on_auth_user_phone_confirmed
    AFTER UPDATE OF phone, phone_confirmed_at ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_auth_user_phone_confirmed();

-- Also set verified_email at initial signup time for providers that are
-- already confirmed then and there (Google OAuth's email_confirmed_at is
-- set on the very first INSERT, not a later UPDATE).
CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.users (id, email, name, role, phone, verified_phone, verified_email)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'name', NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''), 'User'),
        COALESCE(NEW.raw_user_meta_data->>'role', 'tenant'),
        NEW.phone,
        NEW.phone_confirmed_at IS NOT NULL,
        NEW.email_confirmed_at IS NOT NULL
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

-- ---- 4. One-time backfill for existing rows using auth.users' real state ----
DO $$
BEGIN
  PERFORM set_config('bhavan.trusted_verification_write', 'true', true);
  UPDATE public.users u
  SET verified_email = (au.email_confirmed_at IS NOT NULL),
      verified_phone = (au.phone_confirmed_at IS NOT NULL)
  FROM auth.users au
  WHERE au.id = u.id
    AND (u.verified_email IS DISTINCT FROM (au.email_confirmed_at IS NOT NULL)
         OR u.verified_phone IS DISTINCT FROM (au.phone_confirmed_at IS NOT NULL));
END $$;

-- ============================================================
-- END OF MIGRATION
-- ============================================================

-- ============================================================
-- Phone (mobile OTP) signup support
--
-- Phone-only signups leave auth.users.email NULL, but public.users.email
-- was NOT NULL -- the handle_new_auth_user() trigger (see base schema)
-- would fail on every phone signup, silently blocking account creation
-- since the trigger runs inside the same transaction as the auth.users
-- insert. Also backfill phone/verified_phone so phone-based accounts
-- don't end up with all-null identifying info.
-- ============================================================

ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.users (id, email, name, role, phone, verified_phone)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'name', NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''), 'User'),
        COALESCE(NEW.raw_user_meta_data->>'role', 'tenant'),
        NEW.phone,
        NEW.phone IS NOT NULL
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

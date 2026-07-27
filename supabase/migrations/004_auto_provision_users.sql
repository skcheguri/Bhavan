-- ============================================================
-- Bhavan Platform -- Fix signup: auto-provision public.users +
-- correct the role CHECK constraint
-- ============================================================
-- Two bugs found while debugging a failed signup:
--
-- 1. supabase.auth.signUp() only creates a row in the internal auth.users
--    table. Nothing in the app or schema creates the matching
--    public.users profile row, so every FK pointing at users(id)
--    (properties.owner_id, listings.owner_id, connection_requests.tenant_id,
--    ...) fails for any freshly signed-up account.
--
-- 2. The app writes role = 'owner' (see src/hooks/useAuth.ts
--    appRoleToDbRole), but the original CHECK constraint only allowed
--    'tenant' | 'landlord' | 'admin' -- so even a correctly-provisioned
--    owner signup would fail with a CHECK violation.
--
-- Safe to run against a database that already has bhavan_schema.sql and
-- 002/003 applied. bhavan_schema.sql has also been corrected at the
-- source so a fresh install never hits this.
-- ============================================================

-- ---- 1. Fix role CHECK constraint (find it dynamically, name isn't
-- guaranteed since it was originally declared inline) ----
DO $$
DECLARE
    old_constraint TEXT;
BEGIN
    SELECT con.conname INTO old_constraint
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'users' AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%role%';
    IF old_constraint IS NOT NULL THEN
        EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', old_constraint);
    END IF;
END $$;

ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('tenant', 'owner', 'admin'));

-- ---- 2. Auto-provision public.users on signup ----
CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.users (id, email, name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        COALESCE(NEW.raw_user_meta_data->>'role', 'tenant')
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();

-- ---- 3. Backfill: if any auth.users already exist without a matching
-- public.users row (e.g. a signup that "succeeded" client-side before
-- this fix), create their profile row now. ----
INSERT INTO public.users (id, email, name, role)
SELECT
    au.id,
    au.email,
    COALESCE(au.raw_user_meta_data->>'name', split_part(au.email, '@', 1)),
    COALESCE(au.raw_user_meta_data->>'role', 'tenant')
FROM auth.users au
LEFT JOIN public.users pu ON pu.id = au.id
WHERE pu.id IS NULL;

-- ============================================================
-- END OF MIGRATION
-- ============================================================

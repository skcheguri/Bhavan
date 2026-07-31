-- ============================================================
-- Bhavan Platform -- keep public.users.email in sync with
-- auth.users.email after a verified email change
-- ============================================================
-- Changing email in the profile UI now goes through
-- supabase.auth.updateUser({ email }), which requires the user to
-- click a confirmation link before auth.users.email actually
-- changes. Once confirmed, this trigger mirrors the new address into
-- public.users.email so the rest of the app (which reads from
-- public.users, not the auth schema) sees the updated value.
-- ============================================================

CREATE OR REPLACE FUNCTION handle_auth_user_email_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.email IS DISTINCT FROM OLD.email THEN
        UPDATE public.users SET email = NEW.email WHERE id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_email_changed ON auth.users;
CREATE TRIGGER on_auth_user_email_changed
    AFTER UPDATE OF email ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_auth_user_email_change();

-- ============================================================
-- END OF MIGRATION
-- ============================================================

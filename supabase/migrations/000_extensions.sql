-- ============================================================
-- Runs BEFORE 001_baseline (sorts first). Makes a from-scratch rebuild work.
--
-- 001_baseline creates "uuid-ossp" WITH SCHEMA extensions, then immediately
-- does CREATE TABLE ... DEFAULT uuid_generate_v4() UNQUALIFIED. Supabase keeps
-- the extension in the `extensions` schema, and the CLI applies each migration
-- in its own session whose search_path does NOT include `extensions`, so the
-- unqualified call fails with "function uuid_generate_v4() does not exist" and
-- the rebuild dies at the baseline's 5th statement. (On the live project the
-- session search_path happened to include `extensions`, so it slipped by.)
--
-- Fix: expose uuid_generate_v4 in `public` (always on the search_path, since
-- the baseline creates its tables there unqualified) via a thin wrapper around
-- the real extension function. A plain function is not relocated by Supabase's
-- extension event trigger, unlike the extension itself.
--
-- Production-safe: additive only. `CREATE EXTENSION IF NOT EXISTS` is a no-op
-- where the extensions already exist; `CREATE OR REPLACE FUNCTION
-- public.uuid_generate_v4` just adds a public alias that delegates to the same
-- underlying function, so existing behaviour is unchanged. The ALTER DATABASE
-- line sets Supabase's standard default so later migrations that reconnect also
-- see `extensions` on the path.
-- ============================================================
SET check_function_bodies = off;

-- ---- Default grants ----
-- `db reset` drops the public schema, which also drops the schema-scoped
-- default privileges Supabase configures at project creation (the grants
-- 001_baseline assumes but never emits). Without them a rebuilt table has NO
-- grants and the app / seed / this very reset hit "permission denied for
-- table". Set the default privileges HERE, before any table exists, so every
-- table/sequence/function created by 001+ auto-grants the broad
-- anon/authenticated/service_role access the app relies on — and the later
-- lockdown migrations (116/117/122/123…) then REVOKE their specifics on top,
-- exactly as on production. (A blanket GRANT at the end would wrongly undo
-- those revokes.) No-op on the already-provisioned production database.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER DATABASE postgres SET search_path TO "$user", public, extensions;

CREATE OR REPLACE FUNCTION public.uuid_generate_v4()
  RETURNS uuid
  LANGUAGE sql
  VOLATILE
  AS $$ SELECT extensions.uuid_generate_v4() $$;

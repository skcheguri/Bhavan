-- Regression suite: audit_logs is populated by admin actions, only by admin
-- actions, and stays admin-read-only.
--
-- Run manually against the linked project:
--   npx supabase db query --linked --file supabase/tests/rls_audit_logs.sql
--
-- Everything runs inside BEGIN/ROLLBACK and creates its own users/fixtures,
-- so it leaves no data behind and runs in any environment (no seed data
-- needed -- there is never a seeded admin, which is why it builds its own).
--
-- This backs migration 154 (audit_admin_write + the is_admin()-gated triggers
-- on the admin-moderated tables) and the explicit audit writes in the
-- admin-suspend-user / refund-payment edge functions. Re-run after any change
-- to those triggers, to the audit_logs policies, or to is_admin().

BEGIN;

CREATE TEMP TABLE probe_results (test TEXT, ok BOOLEAN, detail TEXT);

DO $$
DECLARE
  v_admin UUID;
  v_owner UUID;
  v_tenant UUID;
  v_report UUID;
  v_property UUID;
  v_before BIGINT;
  v_after BIGINT;
  result BOOLEAN;
  err_msg TEXT := 'no error';
BEGIN
  -- Fixtures, created as the connection role (bypasses RLS). role='admin' is
  -- allowed by users_role_check and there is no INSERT trigger on users
  -- (protect_privileged_user_columns is BEFORE UPDATE only), so this stands
  -- up a real admin for is_admin() without an auth.users row -- is_admin()
  -- only reads public.users.
  INSERT INTO users (email, name, role) VALUES ('audit-admin@test.invalid',  'Audit Admin',  'admin')  RETURNING id INTO v_admin;
  INSERT INTO users (email, name, role) VALUES ('audit-owner@test.invalid',  'Audit Owner',  'owner')  RETURNING id INTO v_owner;
  INSERT INTO users (email, name, role) VALUES ('audit-tenant@test.invalid', 'Audit Tenant', 'tenant') RETURNING id INTO v_tenant;

  INSERT INTO broker_reports (tenant_id, owner_id, reason, status)
  VALUES (v_tenant, v_owner, 'other', 'pending') RETURNING id INTO v_report;

  INSERT INTO properties (owner_id, name, address)
  VALUES (v_owner, 'Audit Test Property', '1 Test Road') RETURNING id INTO v_property;

  -- 1. An admin moderation write (UPDATE) is recorded, attributed to the
  --    acting admin, with the mapped action.
  SELECT count(*) INTO v_before FROM audit_logs WHERE record_id = v_report;
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  BEGIN
    UPDATE broker_reports SET status = 'resolved' WHERE id = v_report;
    result := true;
  EXCEPTION WHEN OTHERS THEN
    result := false;
    GET STACKED DIAGNOSTICS err_msg = MESSAGE_TEXT;
  END;
  RESET ROLE;
  SELECT count(*) INTO v_after FROM audit_logs
    WHERE record_id = v_report AND table_name = 'broker_reports'
      AND action = 'update' AND user_id = v_admin;
  INSERT INTO probe_results VALUES (
    '1. admin moderation write is audited',
    (v_after = 1 AND v_before = 0),
    'before=' || v_before || ' matching_after=' || v_after || ' update_ok=' || result::text || ' ' || err_msg
  );

  -- 2. A legitimate non-admin write to a triggered table does NOT log.
  --    An owner editing their own property is the textbook case.
  SELECT count(*) INTO v_before FROM audit_logs WHERE record_id = v_property;
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  BEGIN
    UPDATE properties SET name = 'Audit Test Property (edited)' WHERE id = v_property AND owner_id = v_owner;
    result := true;
  EXCEPTION WHEN OTHERS THEN
    result := false;
    GET STACKED DIAGNOSTICS err_msg = MESSAGE_TEXT;
  END;
  RESET ROLE;
  SELECT count(*) INTO v_after FROM audit_logs WHERE record_id = v_property;
  INSERT INTO probe_results VALUES (
    '2. owner self-write is NOT audited',
    (result AND v_after = 0 AND v_before = 0),
    'before=' || v_before || ' after=' || v_after || ' write_ok=' || result::text || ' ' || err_msg
  );

  -- 3. A non-admin cannot read audit_logs (the admin-written row is invisible).
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  BEGIN
    SELECT count(*) INTO v_after FROM audit_logs WHERE record_id = v_report;
    result := (v_after = 0);
  EXCEPTION WHEN OTHERS THEN
    result := true; -- an outright denial is also acceptable
    GET STACKED DIAGNOSTICS err_msg = MESSAGE_TEXT;
  END;
  RESET ROLE;
  INSERT INTO probe_results VALUES (
    '3. non-admin cannot read audit_logs',
    result,
    'visible_rows=' || COALESCE(v_after::text, 'denied') || ' ' || err_msg
  );

  -- 4. An admin CAN read the audit row (the read policy still works).
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  SELECT count(*) INTO v_after FROM audit_logs WHERE record_id = v_report;
  RESET ROLE;
  INSERT INTO probe_results VALUES (
    '4. admin can read the audit row',
    (v_after >= 1),
    'visible_rows=' || v_after
  );
END $$;

SELECT * FROM probe_results ORDER BY test;

ROLLBACK;

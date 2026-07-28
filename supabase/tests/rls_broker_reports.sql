-- RLS regression suite: broker_reports insert-time integrity.
--
-- Run manually against the linked project:
--   npx supabase db query --linked --file supabase/tests/rls_broker_reports.sql
--
-- Everything runs inside BEGIN/ROLLBACK, so it never leaves data
-- behind. Requires at least one 'tenant' row and one 'owner' row in
-- `users` to run for real; otherwise every probe reports "skipped".
--
-- This exists because migration 053 fixed a real hole found while
-- building this suite: broker_reports has no owner-side UPDATE policy
-- at all (only admins can update post-submission, which is correct),
-- but the owner's INSERT policy ("Owners can create reports") only
-- checked owner_id -- not `status` or `admin_note`. The real UI never
-- sends either at submission (useBrokerReport.ts, relies on the DB
-- default status='pending'), but a raw API call could submit a report
-- already marked 'resolved'/'dismissed' (skipping admin review
-- entirely) or with a fabricated admin_note impersonating an admin's
-- own review comment. Re-run this after any future change to
-- broker_reports' policies.

BEGIN;

CREATE TEMP TABLE probe_results (test TEXT, ok BOOLEAN, detail TEXT);

DO $$
DECLARE
  v_owner UUID;
  v_tenant UUID;
  result BOOLEAN;
  err_msg TEXT := 'no error';
BEGIN
  SELECT id INTO v_owner FROM users WHERE role = 'owner' LIMIT 1;
  SELECT id INTO v_tenant FROM users WHERE role = 'tenant' LIMIT 1;

  IF v_owner IS NULL OR v_tenant IS NULL THEN
    INSERT INTO probe_results VALUES ('all probes', true, 'skipped -- no test users in this environment');
    RETURN;
  END IF;

  -- 1. Owner can still submit a normal report (the real flow, status defaults pending).
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  BEGIN
    INSERT INTO broker_reports (tenant_id, owner_id, reason, reason_text)
    VALUES (v_tenant, v_owner, 'asked_commission', 'Tenant asked for a commission fee');
    result := true;
  EXCEPTION WHEN OTHERS THEN
    result := false;
    GET STACKED DIAGNOSTICS err_msg = MESSAGE_TEXT;
  END;
  RESET ROLE;
  INSERT INTO probe_results VALUES ('owner can still submit a normal report', result, err_msg);

  -- 2. Owner cannot self-submit a report already marked resolved (bypassing review).
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  BEGIN
    INSERT INTO broker_reports (tenant_id, owner_id, reason, status)
    VALUES (v_tenant, v_owner, 'other', 'resolved');
    result := true;
  EXCEPTION WHEN OTHERS THEN
    result := false;
    GET STACKED DIAGNOSTICS err_msg = MESSAGE_TEXT;
  END;
  RESET ROLE;
  INSERT INTO probe_results VALUES ('owner cannot self-submit a pre-resolved report', NOT result, err_msg);

  -- 3. Owner cannot self-submit a report with a fabricated admin_note.
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  BEGIN
    INSERT INTO broker_reports (tenant_id, owner_id, reason, admin_note)
    VALUES (v_tenant, v_owner, 'other', 'Fabricated: admin reviewed and confirmed valid');
    result := true;
  EXCEPTION WHEN OTHERS THEN
    result := false;
    GET STACKED DIAGNOSTICS err_msg = MESSAGE_TEXT;
  END;
  RESET ROLE;
  INSERT INTO probe_results VALUES ('owner cannot fabricate an admin_note', NOT result, err_msg);
END $$;

SELECT * FROM probe_results ORDER BY test;

ROLLBACK;

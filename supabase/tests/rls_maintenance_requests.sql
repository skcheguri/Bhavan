-- RLS/trigger regression suite: maintenance_requests field integrity.
--
-- Run manually against the linked project:
--   npx supabase db query --linked --file supabase/tests/rls_maintenance_requests.sql
--
-- Everything runs inside BEGIN/ROLLBACK, so it never leaves data
-- behind. Requires at least one 'tenant' row and one 'owner' row in
-- `users` to run for real; otherwise every probe reports "skipped".
--
-- This exists because migration 050 fixed a real hole found while
-- building this suite: "Owners can update their tenants requests" had
-- no WITH CHECK at all, letting an owner rewrite ANY column on a
-- request naming them -- the tenant's description/title/category,
-- swap the images, silently reprioritize an "urgent" request down to
-- "low" -- when the real UI only ever writes status, updated_at,
-- resolved_at, and landlord_notes (useMaintenanceRequests.ts:195-216).
-- Fixed with a BEFORE UPDATE trigger, same pattern as
-- connection_requests (migration 049). Re-run this after any future
-- change to maintenance_requests' policies or triggers.

BEGIN;

CREATE TEMP TABLE probe_results (test TEXT, ok BOOLEAN, detail TEXT);

DO $$
DECLARE
  v_owner UUID;
  v_tenant UUID;
  v_agreement_id UUID;
  v_request_id UUID;
  result BOOLEAN;
  err_msg TEXT := 'no error';
BEGIN
  SELECT id INTO v_owner FROM users WHERE role = 'owner' LIMIT 1;
  SELECT id INTO v_tenant FROM users WHERE role = 'tenant' LIMIT 1;

  IF v_owner IS NULL OR v_tenant IS NULL THEN
    INSERT INTO probe_results VALUES ('all probes', true, 'skipped -- no test users in this environment');
    RETURN;
  END IF;

  -- Need a real rental_agreements row linking this tenant to this owner
  -- (set_maintenance_request_owner() requires it to derive owner_id).
  INSERT INTO rental_agreements (owner_id, tenant_id, agreement_number, landlord_name, tenant_name, monthly_rent, security_deposit)
  VALUES (v_owner, v_tenant, 'REGTEST-MR-AGR', 'Test Landlord', 'Test Tenant', 20000, 40000)
  RETURNING id INTO v_agreement_id;

  -- 1. Tenant can create a maintenance request (the real flow).
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_tenant, 'role', 'authenticated')::text, true);
  BEGIN
    INSERT INTO maintenance_requests (tenant_id, agreement_id, category, title, description, priority, status, images)
    VALUES (v_tenant, v_agreement_id, 'plumbing', 'Leaking tap', 'Original tenant description', 'urgent', 'pending', '{}')
    RETURNING id INTO v_request_id;
    result := true;
  EXCEPTION WHEN OTHERS THEN
    result := false;
    GET STACKED DIAGNOSTICS err_msg = MESSAGE_TEXT;
  END;
  RESET ROLE;
  INSERT INTO probe_results VALUES ('tenant can still create a request', result, err_msg);

  IF v_request_id IS NOT NULL THEN
    -- 2. Owner can still update status/landlord_notes (the real updateStatus flow).
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    BEGIN
      UPDATE maintenance_requests SET status = 'acknowledged', landlord_notes = 'On it' WHERE id = v_request_id;
      result := true;
    EXCEPTION WHEN OTHERS THEN
      result := false;
    END;
    RESET ROLE;
    INSERT INTO probe_results VALUES ('owner can still acknowledge + add notes', result, result::text);

    -- 3. Owner cannot rewrite the tenant's description.
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    BEGIN
      UPDATE maintenance_requests SET description = 'rewritten by owner' WHERE id = v_request_id;
      result := true;
    EXCEPTION WHEN OTHERS THEN
      result := false;
    END;
    RESET ROLE;
    INSERT INTO probe_results VALUES ('owner cannot rewrite tenant description', NOT result, result::text);

    -- 4. Owner cannot downgrade priority.
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    BEGIN
      UPDATE maintenance_requests SET priority = 'low' WHERE id = v_request_id;
      result := true;
    EXCEPTION WHEN OTHERS THEN
      result := false;
    END;
    RESET ROLE;
    INSERT INTO probe_results VALUES ('owner cannot silently reprioritize', NOT result, result::text);

    -- 5. Sanity: the tenant's original content survived all of the above intact.
    PERFORM 1 FROM maintenance_requests WHERE id = v_request_id AND tenant_id = v_tenant AND description = 'Original tenant description';
    result := FOUND;
    INSERT INTO probe_results VALUES ('original tenant content survived intact', result, result::text);
  END IF;
END $$;

SELECT * FROM probe_results ORDER BY test;

ROLLBACK;

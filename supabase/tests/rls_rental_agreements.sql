-- RLS regression suite: rental_agreements tenant-signature integrity
-- and cross-user isolation.
--
-- Run manually against the linked project:
--   npx supabase db query --linked --file supabase/tests/rls_rental_agreements.sql
--
-- Everything runs inside BEGIN/ROLLBACK, so it never leaves data
-- behind. Requires at least two 'tenant' rows and one 'owner' row in
-- `users` to run for real; otherwise every probe reports "skipped".
--
-- This exists because migration 048 fixed a real hole found while
-- building this suite: the owner policies on rental_agreements had no
-- WITH CHECK constraining `signed_by_tenant`, so an owner could
-- fraudulently mark a legal agreement as tenant-signed -- via a raw
-- API call, with the tenant never involved. Re-run this after any
-- future change to rental_agreements' RLS policies, and especially
-- before building a real e-signature feature on this table (probe 7
-- documents that tenants currently have zero write access here at
-- all -- that will need a deliberate, narrow policy addition, not a
-- broad one).

BEGIN;

CREATE TEMP TABLE probe_results (test TEXT, ok BOOLEAN, detail TEXT);

DO $$
DECLARE
  v_owner UUID;
  v_tenant UUID;
  v_other_tenant UUID;
  v_agreement_id UUID;
  result BOOLEAN;
  rows_affected INT;
BEGIN
  SELECT id INTO v_owner FROM users WHERE role = 'owner' LIMIT 1;
  SELECT id INTO v_tenant FROM users WHERE role = 'tenant' LIMIT 1;
  SELECT id INTO v_other_tenant FROM users WHERE role = 'tenant' AND id <> v_tenant LIMIT 1;

  IF v_owner IS NULL OR v_tenant IS NULL THEN
    INSERT INTO probe_results VALUES ('all probes', true, 'skipped -- no test users in this environment');
    RETURN;
  END IF;

  -- 1. Owner cannot insert an agreement pre-marked as signed by the tenant.
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  BEGIN
    INSERT INTO rental_agreements (owner_id, tenant_id, agreement_number, landlord_name, tenant_name, monthly_rent, security_deposit, signed_by_tenant)
    VALUES (v_owner, v_tenant, 'REGTEST-EXPLOIT', 'Test Landlord', 'Test Tenant', 20000, 40000, true);
    result := true;
  EXCEPTION WHEN OTHERS THEN
    result := false;
  END;
  RESET ROLE;
  INSERT INTO probe_results VALUES ('owner cannot insert an agreement pre-marked tenant-signed', NOT result, result::text);

  -- 2. Owner can still create a normal agreement (signature defaults false).
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  BEGIN
    INSERT INTO rental_agreements (owner_id, tenant_id, agreement_number, landlord_name, tenant_name, monthly_rent, security_deposit)
    VALUES (v_owner, v_tenant, 'REGTEST-LEGIT', 'Test Landlord', 'Test Tenant', 20000, 40000)
    RETURNING id INTO v_agreement_id;
    result := true;
  EXCEPTION WHEN OTHERS THEN
    result := false;
  END;
  RESET ROLE;
  INSERT INTO probe_results VALUES ('owner can still create a normal agreement', result, result::text);

  IF v_agreement_id IS NOT NULL THEN
    -- 3. Owner can still mark it shared with the tenant (the real markShared flow).
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    BEGIN
      UPDATE rental_agreements SET shared_with_tenant = true, shared_at = now() WHERE id = v_agreement_id;
      result := true;
    EXCEPTION WHEN OTHERS THEN
      result := false;
    END;
    RESET ROLE;
    INSERT INTO probe_results VALUES ('owner can still mark an agreement shared', result, result::text);

    -- 4. Owner cannot directly flip signed_by_tenant to true on an existing row.
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    BEGIN
      UPDATE rental_agreements SET signed_by_tenant = true WHERE id = v_agreement_id;
      result := true;
    EXCEPTION WHEN OTHERS THEN
      result := false;
    END;
    RESET ROLE;
    INSERT INTO probe_results VALUES ('owner cannot directly mark an existing agreement tenant-signed', NOT result, result::text);

    -- 5. The named tenant can read this agreement.
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_tenant, 'role', 'authenticated')::text, true);
    PERFORM 1 FROM rental_agreements WHERE id = v_agreement_id;
    result := FOUND;
    RESET ROLE;
    INSERT INTO probe_results VALUES ('named tenant can read their own agreement', result, result::text);

    -- 6. A different tenant cannot read this agreement (cross-user isolation).
    IF v_other_tenant IS NOT NULL THEN
      PERFORM set_config('role', 'authenticated', true);
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other_tenant, 'role', 'authenticated')::text, true);
      PERFORM 1 FROM rental_agreements WHERE id = v_agreement_id;
      result := FOUND;
      RESET ROLE;
      INSERT INTO probe_results VALUES ('a different tenant cannot see this agreement', NOT result, result::text);
    END IF;

    -- 7. Tenants have zero write access to this table today (no UPDATE/INSERT
    --    policy grants it). An RLS-filtered UPDATE with no matching policy
    --    doesn't error -- it just matches 0 rows -- so check row count, not
    --    just for an exception.
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_tenant, 'role', 'authenticated')::text, true);
    UPDATE rental_agreements SET signed_by_tenant = true WHERE id = v_agreement_id;
    GET DIAGNOSTICS rows_affected = ROW_COUNT;
    RESET ROLE;
    INSERT INTO probe_results VALUES ('tenant has no write access at all (no signing feature built yet)', rows_affected = 0, rows_affected::text || ' rows affected');
  END IF;
END $$;

SELECT * FROM probe_results ORDER BY test;

ROLLBACK;

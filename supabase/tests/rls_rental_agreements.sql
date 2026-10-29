-- RLS regression suite: rental_agreements tenant-signature integrity
-- and cross-user isolation.
--
-- Run manually against the linked project:
--   npx supabase db query --linked --file supabase/tests/rls_rental_agreements.sql
--
-- Everything runs inside BEGIN/ROLLBACK and creates its own users and
-- agreement fixtures, so it leaves no data behind and runs in any
-- environment (no seed data needed). Fixtures are built as the
-- connection role, which bypasses RLS and the BEFORE UPDATE workflow
-- trigger (that trigger only fires for an authenticated auth.uid());
-- each probe then switches to the `authenticated` role with the acting
-- user's request.jwt.claims, exactly as rls_audit_logs.sql does.
--
-- This exists because migration 048 fixed a real hole found while
-- building this suite: the owner policies on rental_agreements had no
-- WITH CHECK constraining `signed_by_tenant`, so an owner could
-- fraudulently mark a legal agreement as tenant-signed -- via a raw
-- API call, with the tenant never involved. Migration 141 then moved
-- the whole signing/stamping/sharing workflow behind SECURITY DEFINER
-- RPCs, guarded by a BEFORE UPDATE trigger that rejects direct PATCHes
-- of the workflow columns unless the RPC raised its transaction-local
-- flag -- which is why probe 3 exercises the real share_rental_agreement
-- RPC rather than a raw UPDATE. Re-run this after any future change to
-- rental_agreements' RLS policies or the workflow trigger/RPCs, and
-- especially before building a real e-signature feature on this table
-- (probe 7 documents that tenants currently have zero write access here
-- at all -- that will need a deliberate, narrow policy addition, not a
-- broad one).

BEGIN;

CREATE TEMP TABLE probe_results (test TEXT, ok BOOLEAN, detail TEXT);

DO $$
DECLARE
  v_owner UUID;
  v_tenant UUID;
  v_other_tenant UUID;
  v_agreement_id UUID;
  v_shareable_id UUID;
  v_shared BOOLEAN;
  result BOOLEAN;
  err_msg TEXT := 'no error';
  rows_affected INT;
BEGIN
  -- Fixtures, created as the connection role (bypasses RLS and the
  -- workflow trigger). v_shareable is pre-placed in the 'stamped' state
  -- the share_rental_agreement RPC requires -- staging's seed has no
  -- such agreement, which is why probe 3 used to fail.
  INSERT INTO users (email, name, role) VALUES ('ra-owner@test.invalid',   'RA Owner',   'owner')  RETURNING id INTO v_owner;
  INSERT INTO users (email, name, role) VALUES ('ra-tenant@test.invalid',  'RA Tenant',  'tenant') RETURNING id INTO v_tenant;
  INSERT INTO users (email, name, role) VALUES ('ra-tenant2@test.invalid', 'RA Tenant2', 'tenant') RETURNING id INTO v_other_tenant;

  INSERT INTO rental_agreements (owner_id, tenant_id, agreement_number, landlord_name, tenant_name, monthly_rent, security_deposit, agreement_status)
  VALUES (v_owner, v_tenant, 'REGTEST-SHAREABLE', 'Test Landlord', 'Test Tenant', 20000, 40000, 'stamped')
  RETURNING id INTO v_shareable_id;

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

  -- 3. Owner can still mark an agreement shared via the real markShared
  --    flow -- the share_rental_agreement RPC, run against a stamped
  --    agreement. The RPC raises the workflow-trigger flag the raw PATCH
  --    cannot, so a direct UPDATE here would (correctly) be rejected.
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM share_rental_agreement(v_shareable_id);
    result := true;
  EXCEPTION WHEN OTHERS THEN
    result := false;
    GET STACKED DIAGNOSTICS err_msg = MESSAGE_TEXT;
  END;
  RESET ROLE;
  -- Clear the RPC flag so the later probes test the guarded direct path.
  PERFORM set_config('bhavan.agreement_rpc', 'off', true);
  SELECT shared_with_tenant INTO v_shared FROM rental_agreements WHERE id = v_shareable_id;
  INSERT INTO probe_results VALUES (
    'owner can still mark an agreement shared',
    (result AND v_shared),
    'rpc_ok=' || result::text || ' shared=' || COALESCE(v_shared::text, 'null') || ' ' || err_msg
  );

  IF v_agreement_id IS NOT NULL THEN
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
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other_tenant, 'role', 'authenticated')::text, true);
    PERFORM 1 FROM rental_agreements WHERE id = v_agreement_id;
    result := FOUND;
    RESET ROLE;
    INSERT INTO probe_results VALUES ('a different tenant cannot see this agreement', NOT result, result::text);

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

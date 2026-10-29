-- RLS regression suite: rent_payments status transitions.
--
-- Run manually against the linked project (never against production
-- with real data outside a transaction):
--   npx supabase db query --linked --file supabase/tests/rls_rent_payments.sql
--
-- Everything runs inside BEGIN/ROLLBACK and creates its own users and
-- the owner<->tenant rental agreement the INSERT policy requires, so it
-- leaves no data behind and runs in any environment (no seed data
-- needed). Fixtures are built as the connection role, which bypasses
-- RLS; each probe then switches to the `authenticated` role with the
-- acting user's request.jwt.claims, exactly as rls_audit_logs.sql does.
--
-- This exists because migration 047 fixed a real hole found while
-- building this suite: rent_payments' INSERT/UPDATE policies didn't
-- constrain `status`, so a tenant could self-insert a row already
-- marked 'paid' with an arbitrary amount, bypassing the
-- verify-rent-payment edge function's Razorpay signature check
-- entirely. Migration 132 then required tenant inserts to reference a
-- real rental agreement between the two parties (agreement_id + the
-- EXISTS check the fixture below satisfies). Re-run this after any
-- future change to rent_payments' RLS policies to make sure that hole
-- doesn't reopen.

BEGIN;

CREATE TEMP TABLE probe_results (test TEXT, ok BOOLEAN, detail TEXT);

DO $$
DECLARE
  v_tenant UUID;
  v_owner UUID;
  v_other_tenant UUID;
  v_agreement UUID;
  v_payment_id UUID;
  result BOOLEAN;
BEGIN
  -- Fixtures, created as the connection role (bypasses RLS). The tenant
  -- INSERT policy (migration 132) requires status='pending', a non-null
  -- agreement_id, and a rental_agreements row linking this tenant and
  -- owner -- so stand all three up here.
  INSERT INTO users (email, name, role) VALUES ('rp-owner@test.invalid',   'RP Owner',   'owner')  RETURNING id INTO v_owner;
  INSERT INTO users (email, name, role) VALUES ('rp-tenant@test.invalid',  'RP Tenant',  'tenant') RETURNING id INTO v_tenant;
  INSERT INTO users (email, name, role) VALUES ('rp-tenant2@test.invalid', 'RP Tenant2', 'tenant') RETURNING id INTO v_other_tenant;

  INSERT INTO rental_agreements (owner_id, tenant_id, agreement_number, landlord_name, tenant_name, monthly_rent, security_deposit)
  VALUES (v_owner, v_tenant, 'REGTEST-RP', 'Test Landlord', 'Test Tenant', 15000, 30000)
  RETURNING id INTO v_agreement;

  -- 1. A tenant cannot self-insert a row already marked 'paid'. Everything
  --    else (agreement, parties) is valid, so the ONLY reason this must be
  --    rejected is the status constraint migration 047 added.
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_tenant, 'role', 'authenticated')::text, true);
  BEGIN
    INSERT INTO rent_payments (tenant_id, owner_id, agreement_id, amount, month, payment_mode, status)
    VALUES (v_tenant, v_owner, v_agreement, 999999, '2099-01', 'cash', 'paid');
    result := true;
  EXCEPTION WHEN OTHERS THEN
    result := false;
  END;
  RESET ROLE;
  INSERT INTO probe_results VALUES ('tenant cannot self-insert a paid row', NOT result, result::text);

  -- 2. A tenant CAN insert a normal pending payment (the real flow).
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_tenant, 'role', 'authenticated')::text, true);
  BEGIN
    INSERT INTO rent_payments (tenant_id, owner_id, agreement_id, amount, month, payment_mode, status)
    VALUES (v_tenant, v_owner, v_agreement, 15000, '2099-02', 'cash', 'pending')
    RETURNING id INTO v_payment_id;
    result := true;
  EXCEPTION WHEN OTHERS THEN
    result := false;
  END;
  RESET ROLE;
  INSERT INTO probe_results VALUES ('tenant can still insert a pending payment', result, result::text);

  IF v_payment_id IS NOT NULL THEN
    -- 3. The owner CAN reconcile that payment (the real flow).
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    BEGIN
      UPDATE rent_payments SET status = 'reconciled', reconciled_at = now() WHERE id = v_payment_id;
      result := true;
    EXCEPTION WHEN OTHERS THEN
      result := false;
    END;
    RESET ROLE;
    INSERT INTO probe_results VALUES ('owner can still reconcile a payment', result, result::text);

    -- 4. The owner cannot directly flip that same row to 'paid'.
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    BEGIN
      UPDATE rent_payments SET status = 'paid' WHERE id = v_payment_id;
      result := true;
    EXCEPTION WHEN OTHERS THEN
      result := false;
    END;
    RESET ROLE;
    INSERT INTO probe_results VALUES ('owner cannot directly mark own payment as paid', NOT result, result::text);

    -- 5. A different tenant cannot see or touch this payment (cross-user isolation).
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other_tenant, 'role', 'authenticated')::text, true);
    PERFORM 1 FROM rent_payments WHERE id = v_payment_id;
    result := FOUND;
    RESET ROLE;
    INSERT INTO probe_results VALUES ('a different tenant cannot see this payment', NOT result, result::text);
  END IF;
END $$;

SELECT * FROM probe_results ORDER BY test;

ROLLBACK;

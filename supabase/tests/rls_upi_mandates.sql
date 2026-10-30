-- RLS regression suite: upi_mandates is read-only to clients.
--
-- Run manually against the linked project:
--   npx supabase db query --linked --file supabase/tests/rls_upi_mandates.sql
--
-- Everything runs inside BEGIN/ROLLBACK and creates its own users, property
-- and a (server-created) mandate, so it leaves no data behind and runs in any
-- environment (no seed data needed). Fixtures are built as the connection role
-- (bypasses RLS); each probe then switches to the `authenticated` role with the
-- acting user's request.jwt.claims, exactly as rls_audit_logs.sql does.
--
-- This backs migration 155. UPI AutoPay has no real Razorpay e-mandate yet, so
-- a client must never be able to create or alter a mandate: the old policies
-- let any authenticated tenant POST a upi_mandates row (status defaulting to
-- 'active', any fabricated razorpay_token), forging an active AutoPay. 155
-- drops the client write policies and revokes the write grants, leaving clients
-- read-only. Re-run this after any change to upi_mandates' policies/grants, and
-- especially when the real e-mandate flow is built -- creation must stay
-- server-side (service_role), never a client write.

BEGIN;

CREATE TEMP TABLE probe_results (test TEXT, ok BOOLEAN, detail TEXT);

DO $$
DECLARE
  v_tenant UUID;
  v_owner UUID;
  v_other_tenant UUID;
  v_property UUID;
  v_mandate UUID;
  result BOOLEAN;
  rows_affected INT;
  err_msg TEXT := 'no error';
BEGIN
  -- Fixtures, created as the connection role (bypasses RLS). The mandate row
  -- stands in for one a real server-side (service_role) flow would create.
  INSERT INTO users (email, name, role) VALUES ('upi-owner@test.invalid',   'UPI Owner',   'owner')  RETURNING id INTO v_owner;
  INSERT INTO users (email, name, role) VALUES ('upi-tenant@test.invalid',  'UPI Tenant',  'tenant') RETURNING id INTO v_tenant;
  INSERT INTO users (email, name, role) VALUES ('upi-tenant2@test.invalid', 'UPI Tenant2', 'tenant') RETURNING id INTO v_other_tenant;

  INSERT INTO properties (owner_id, name, address)
  VALUES (v_owner, 'UPI Test Property', '1 Test Road') RETURNING id INTO v_property;

  INSERT INTO upi_mandates (tenant_id, owner_id, property_id, upi_id, mandate_amount, status, razorpay_token)
  VALUES (v_tenant, v_owner, v_property, 'tenant@okhdfcbank', 1500000, 'active', 'rzp_real_mandate_token')
  RETURNING id INTO v_mandate;

  -- 1. A tenant CANNOT self-insert a mandate (the forgery the hole allowed).
  --    All fields are otherwise valid, so the only thing stopping it is the
  --    lockdown -- no client write path exists at all.
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_tenant, 'role', 'authenticated')::text, true);
  BEGIN
    INSERT INTO upi_mandates (tenant_id, owner_id, property_id, upi_id, mandate_amount, status, razorpay_token)
    VALUES (v_tenant, v_owner, v_property, 'tenant@okhdfcbank', 1500000, 'active', 'forged_token');
    result := true;
  EXCEPTION WHEN OTHERS THEN
    result := false;
    GET STACKED DIAGNOSTICS err_msg = MESSAGE_TEXT;
  END;
  RESET ROLE;
  INSERT INTO probe_results VALUES ('tenant cannot self-insert a upi mandate', NOT result, err_msg);

  -- 2. A tenant CANNOT modify an existing mandate (e.g. re-activate it or
  --    swap in a token). A blocked write may raise (no grant) or match 0 rows
  --    (no policy) -- either must leave the row unchanged.
  err_msg := 'no error';
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_tenant, 'role', 'authenticated')::text, true);
  BEGIN
    UPDATE upi_mandates SET status = 'active', razorpay_token = 'swapped_token' WHERE id = v_mandate;
    GET DIAGNOSTICS rows_affected = ROW_COUNT;
    result := rows_affected > 0;
  EXCEPTION WHEN OTHERS THEN
    result := false;
    GET STACKED DIAGNOSTICS err_msg = MESSAGE_TEXT;
  END;
  RESET ROLE;
  INSERT INTO probe_results VALUES ('tenant cannot update an existing mandate', NOT result, err_msg);

  -- 3. The tenant CAN still read their own mandate (status UI must keep working).
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_tenant, 'role', 'authenticated')::text, true);
  PERFORM 1 FROM upi_mandates WHERE id = v_mandate;
  result := FOUND;
  RESET ROLE;
  INSERT INTO probe_results VALUES ('tenant can still read their own mandate', result, result::text);

  -- 4. A different tenant cannot see this mandate (cross-user isolation).
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other_tenant, 'role', 'authenticated')::text, true);
  PERFORM 1 FROM upi_mandates WHERE id = v_mandate;
  result := FOUND;
  RESET ROLE;
  INSERT INTO probe_results VALUES ('a different tenant cannot see this mandate', NOT result, result::text);

  -- 5. The owner CAN read a mandate against their property (existing policy).
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  PERFORM 1 FROM upi_mandates WHERE id = v_mandate;
  result := FOUND;
  RESET ROLE;
  INSERT INTO probe_results VALUES ('owner can read a mandate on their property', result, result::text);
END $$;

SELECT * FROM probe_results ORDER BY test;

ROLLBACK;

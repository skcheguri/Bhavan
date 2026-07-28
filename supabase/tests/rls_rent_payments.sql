-- RLS regression suite: rent_payments status transitions.
--
-- Run manually against the linked project (never against production
-- with real data outside a transaction):
--   npx supabase db query --linked --file supabase/tests/rls_rent_payments.sql
--
-- Everything runs inside BEGIN/ROLLBACK, so it never leaves data
-- behind. Requires at least one 'tenant' and one 'owner' row in
-- `users` to run for real; otherwise every probe reports "skipped".
--
-- This exists because migration 047 fixed a real hole found while
-- building this suite: rent_payments' INSERT/UPDATE policies didn't
-- constrain `status`, so a tenant could self-insert a row already
-- marked 'paid' with an arbitrary amount, bypassing the
-- verify-rent-payment edge function's Razorpay signature check
-- entirely. Re-run this after any future change to rent_payments'
-- RLS policies to make sure that hole doesn't reopen.

BEGIN;

CREATE TEMP TABLE probe_results (test TEXT, ok BOOLEAN, detail TEXT);

DO $$
DECLARE
  v_tenant UUID;
  v_owner UUID;
  v_other_tenant UUID;
  v_payment_id UUID;
  result BOOLEAN;
BEGIN
  SELECT id INTO v_tenant FROM users WHERE role = 'tenant' LIMIT 1;
  SELECT id INTO v_owner FROM users WHERE role = 'owner' LIMIT 1;
  SELECT id INTO v_other_tenant FROM users WHERE role = 'tenant' AND id <> v_tenant LIMIT 1;

  IF v_tenant IS NULL OR v_owner IS NULL THEN
    INSERT INTO probe_results VALUES ('all probes', true, 'skipped -- no test users in this environment');
    RETURN;
  END IF;

  -- 1. A tenant cannot self-insert a row already marked 'paid'.
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_tenant, 'role', 'authenticated')::text, true);
  BEGIN
    INSERT INTO rent_payments (tenant_id, owner_id, amount, month, payment_mode, status)
    VALUES (v_tenant, v_owner, 999999, '2099-01', 'cash', 'paid');
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
    INSERT INTO rent_payments (tenant_id, owner_id, amount, month, payment_mode, status)
    VALUES (v_tenant, v_owner, 15000, '2099-02', 'cash', 'pending')
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
    IF v_other_tenant IS NOT NULL THEN
      PERFORM set_config('role', 'authenticated', true);
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other_tenant, 'role', 'authenticated')::text, true);
      PERFORM 1 FROM rent_payments WHERE id = v_payment_id;
      result := FOUND;
      RESET ROLE;
      INSERT INTO probe_results VALUES ('a different tenant cannot see this payment', NOT result, result::text);
    END IF;
  END IF;
END $$;

SELECT * FROM probe_results ORDER BY test;

ROLLBACK;

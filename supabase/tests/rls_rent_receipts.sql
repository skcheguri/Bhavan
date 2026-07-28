-- RLS/trigger regression suite: rent_receipts field integrity.
--
-- Run manually against the linked project:
--   npx supabase db query --linked --file supabase/tests/rls_rent_receipts.sql
--
-- Everything runs inside BEGIN/ROLLBACK, so it never leaves data
-- behind. Requires at least one 'tenant' row and one 'owner' row in
-- `users` to run for real; otherwise every probe reports "skipped".
--
-- This exists because migration 052 fixed a real hole found while
-- building this suite: "Owners can manage own receipts" (ALL) had no
-- WITH CHECK, letting an owner rewrite a receipt's rent_amount,
-- tenant_name, dates, etc. after issuing it -- when the real UI only
-- ever writes sent_to_tenant/sent_at (useRentReceipts.ts). Fixed with
-- a BEFORE UPDATE trigger, same pattern as rental_agreements /
-- connection_requests / maintenance_requests. Re-run this after any
-- future change to rent_receipts' policies or triggers.

BEGIN;

CREATE TEMP TABLE probe_results (test TEXT, ok BOOLEAN, detail TEXT);

DO $$
DECLARE
  v_owner UUID;
  v_tenant UUID;
  v_receipt_id UUID;
  result BOOLEAN;
  err_msg TEXT := 'no error';
BEGIN
  SELECT id INTO v_owner FROM users WHERE role = 'owner' LIMIT 1;
  SELECT id INTO v_tenant FROM users WHERE role = 'tenant' LIMIT 1;

  IF v_owner IS NULL OR v_tenant IS NULL THEN
    INSERT INTO probe_results VALUES ('all probes', true, 'skipped -- no test users in this environment');
    RETURN;
  END IF;

  -- 1. Owner can still issue a receipt (the real flow).
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  BEGIN
    INSERT INTO rent_receipts (owner_id, tenant_id, receipt_number, landlord_name, tenant_name, rent_amount)
    VALUES (v_owner, v_tenant, 'REGTEST-RCPT', 'Test Landlord', 'Test Tenant', 25000)
    RETURNING id INTO v_receipt_id;
    result := true;
  EXCEPTION WHEN OTHERS THEN
    result := false;
    GET STACKED DIAGNOSTICS err_msg = MESSAGE_TEXT;
  END;
  RESET ROLE;
  INSERT INTO probe_results VALUES ('owner can still issue a receipt', result, err_msg);

  IF v_receipt_id IS NOT NULL THEN
    -- 2. Owner can still mark it sent (the real markShared-equivalent flow).
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    BEGIN
      UPDATE rent_receipts SET sent_to_tenant = true, sent_at = now() WHERE id = v_receipt_id;
      result := true;
    EXCEPTION WHEN OTHERS THEN
      result := false;
    END;
    RESET ROLE;
    INSERT INTO probe_results VALUES ('owner can still mark a receipt sent', result, result::text);

    -- 3. Owner cannot rewrite the rent amount after issuing it.
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    BEGIN
      UPDATE rent_receipts SET rent_amount = 99999 WHERE id = v_receipt_id;
      result := true;
    EXCEPTION WHEN OTHERS THEN
      result := false;
    END;
    RESET ROLE;
    INSERT INTO probe_results VALUES ('owner cannot rewrite rent_amount', NOT result, result::text);

    -- 4. Owner cannot rewrite the tenant name.
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    BEGIN
      UPDATE rent_receipts SET tenant_name = 'Someone Else' WHERE id = v_receipt_id;
      result := true;
    EXCEPTION WHEN OTHERS THEN
      result := false;
    END;
    RESET ROLE;
    INSERT INTO probe_results VALUES ('owner cannot rewrite tenant_name', NOT result, result::text);
  END IF;
END $$;

SELECT * FROM probe_results ORDER BY test;

ROLLBACK;

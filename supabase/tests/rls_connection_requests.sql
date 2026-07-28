-- RLS/trigger regression suite: connection_requests field integrity
-- and cross-user isolation.
--
-- Run manually against the linked project:
--   npx supabase db query --linked --file supabase/tests/rls_connection_requests.sql
--
-- Everything runs inside BEGIN/ROLLBACK, so it never leaves data
-- behind. Requires at least two 'tenant' rows, one 'owner' row, and one
-- listing in the linked project to run for real; otherwise every probe
-- reports "skipped".
--
-- This exists because migration 049 fixed a real hole found while
-- building this suite: "Owners can read and update their requests" is
-- a FOR ALL policy with no WITH CHECK at all, so an owner could
-- rewrite ANY column on a connection request naming them -- the
-- tenant's own message, the tenant_id (reassigning the request to a
-- different tenant), the listing price/title/location snapshot, even
-- owner_id itself -- when the only thing the real UI ever does is
-- `.update({ status, responded_at })` to approve/decline (see
-- useConnectionRequests.ts:108). Fixed with a BEFORE UPDATE trigger
-- (a plain RLS WITH CHECK can't compare OLD vs NEW, so this needed a
-- trigger, same pattern as the rate-limit trigger already on this
-- table from migration 045). Re-run this after any future change to
-- connection_requests' policies or triggers.

BEGIN;

CREATE TEMP TABLE probe_results (test TEXT, ok BOOLEAN, detail TEXT);

DO $$
DECLARE
  v_owner UUID;
  v_tenant UUID;
  v_other_tenant UUID;
  v_listing UUID;
  v_request_id UUID;
  result BOOLEAN;
  rows_affected INT;
  err_msg TEXT := 'no error';
BEGIN
  SELECT id INTO v_owner FROM users WHERE role = 'owner' LIMIT 1;
  SELECT id INTO v_tenant FROM users WHERE role = 'tenant' LIMIT 1;
  SELECT id INTO v_other_tenant FROM users WHERE role = 'tenant' AND id <> v_tenant LIMIT 1;
  -- Avoid the real "one active request per tenant/listing" unique
  -- constraint colliding with existing data.
  SELECT l.id INTO v_listing FROM listings l
    WHERE NOT EXISTS (SELECT 1 FROM connection_requests cr WHERE cr.tenant_id = v_tenant AND cr.listing_id = l.id)
    LIMIT 1;

  IF v_owner IS NULL OR v_tenant IS NULL OR v_listing IS NULL THEN
    INSERT INTO probe_results VALUES ('all probes', true, 'skipped -- no test users/listing in this environment');
    RETURN;
  END IF;

  -- 1. Tenant can create a connection request (the real flow).
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_tenant, 'role', 'authenticated')::text, true);
  BEGIN
    INSERT INTO connection_requests (tenant_id, listing_id, owner_id, message, status)
    VALUES (v_tenant, v_listing, v_owner, 'Original tenant message', 'pending')
    RETURNING id INTO v_request_id;
    result := true;
  EXCEPTION WHEN OTHERS THEN
    result := false;
    GET STACKED DIAGNOSTICS err_msg = MESSAGE_TEXT;
  END;
  RESET ROLE;
  INSERT INTO probe_results VALUES ('tenant can still create a connection request', result, err_msg);

  IF v_request_id IS NOT NULL THEN
    -- 2. Owner can still approve/decline (status + responded_at) -- the real flow.
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    BEGIN
      UPDATE connection_requests SET status = 'approved', responded_at = now() WHERE id = v_request_id;
      result := true;
    EXCEPTION WHEN OTHERS THEN
      result := false;
    END;
    RESET ROLE;
    INSERT INTO probe_results VALUES ('owner can still approve a request (status + responded_at)', result, result::text);

    -- 3. Owner cannot rewrite the tenant's message.
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    BEGIN
      UPDATE connection_requests SET message = 'rewritten by owner' WHERE id = v_request_id;
      result := true;
    EXCEPTION WHEN OTHERS THEN
      result := false;
    END;
    RESET ROLE;
    INSERT INTO probe_results VALUES ('owner cannot rewrite the tenant message', NOT result, result::text);

    -- 4. Owner cannot reassign the request to a different tenant.
    IF v_other_tenant IS NOT NULL THEN
      PERFORM set_config('role', 'authenticated', true);
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
      BEGIN
        UPDATE connection_requests SET tenant_id = v_other_tenant WHERE id = v_request_id;
        result := true;
      EXCEPTION WHEN OTHERS THEN
        result := false;
      END;
      RESET ROLE;
      INSERT INTO probe_results VALUES ('owner cannot reassign the request to a different tenant', NOT result, result::text);
    END IF;

    -- 5. Owner cannot alter the recorded listing_price snapshot.
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
    BEGIN
      UPDATE connection_requests SET listing_price = 999999 WHERE id = v_request_id;
      result := true;
    EXCEPTION WHEN OTHERS THEN
      result := false;
    END;
    RESET ROLE;
    INSERT INTO probe_results VALUES ('owner cannot alter the listing_price snapshot', NOT result, result::text);

    -- 6. A different tenant cannot see this request (cross-user isolation).
    IF v_other_tenant IS NOT NULL THEN
      PERFORM set_config('role', 'authenticated', true);
      PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other_tenant, 'role', 'authenticated')::text, true);
      PERFORM 1 FROM connection_requests WHERE id = v_request_id;
      result := FOUND;
      RESET ROLE;
      INSERT INTO probe_results VALUES ('a different tenant cannot see this request', NOT result, result::text);
    END IF;

    -- 7. The tenant who made the request cannot approve their own request
    --    (no owner-side write policy applies to them). An RLS-filtered
    --    UPDATE with no matching policy doesn't error, it just matches 0
    --    rows -- so check row count, not just for an exception.
    PERFORM set_config('role', 'authenticated', true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_tenant, 'role', 'authenticated')::text, true);
    UPDATE connection_requests SET status = 'approved' WHERE id = v_request_id;
    GET DIAGNOSTICS rows_affected = ROW_COUNT;
    RESET ROLE;
    INSERT INTO probe_results VALUES ('tenant cannot approve their own request', rows_affected = 0, rows_affected::text || ' rows affected');
  END IF;
END $$;

SELECT * FROM probe_results ORDER BY test;

ROLLBACK;

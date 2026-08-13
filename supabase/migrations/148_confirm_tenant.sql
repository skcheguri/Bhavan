-- ============================================================
-- "Confirm as tenant" -- promote an approved contact to the owner's
-- confirmed tenant (Option A: a shortlist + label, NOT a source of truth
-- for occupancy).
--
-- The rental-agreement and rent-receipt "Select tenant" dropdowns were
-- fed by every *approved* connection request -- i.e. every chat the owner
-- accepted, most of whom never become tenants. This adds an explicit,
-- reversible step the owner takes from an approved inquiry to mark "this
-- is my tenant." Those dropdowns then show only confirmed tenants.
--
-- Deliberately additive: status stays 'approved' (so the unique
-- one-active-request-per-listing index, chat access, and review
-- eligibility are all untouched). A signed rental_agreement remains the
-- ONLY thing that marks an active tenancy for occupancy and the
-- account-deletion guard -- confirming here changes neither.
-- ============================================================

ALTER TABLE connection_requests
  ADD COLUMN IF NOT EXISTS tenant_confirmed_at timestamptz;

-- Owner toggles the confirmation. SECURITY DEFINER so the rule ("only an
-- approved contact can be confirmed") is enforced server-side, not just
-- in the client. Only the owner of the request may call it. The existing
-- immutable-fields trigger denylists specific columns and does not
-- include tenant_confirmed_at, and the response rate-limit trigger only
-- fires on a pending->approved/declined status change, so this update
-- trips neither.
CREATE OR REPLACE FUNCTION set_connection_tenant(p_request_id uuid, p_confirmed boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r connection_requests;
BEGIN
  SELECT * INTO r FROM connection_requests WHERE id = p_request_id;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Request not found.'; END IF;
  IF auth.uid() <> r.owner_id THEN
    RAISE EXCEPTION 'Only the owner of this request can confirm its tenant.';
  END IF;

  IF p_confirmed THEN
    IF r.status <> 'approved' THEN
      RAISE EXCEPTION 'Only an approved contact can be confirmed as a tenant.';
    END IF;
    UPDATE connection_requests SET tenant_confirmed_at = now() WHERE id = p_request_id;
  ELSE
    UPDATE connection_requests SET tenant_confirmed_at = NULL WHERE id = p_request_id;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION set_connection_tenant(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_connection_tenant(uuid, boolean) TO authenticated;

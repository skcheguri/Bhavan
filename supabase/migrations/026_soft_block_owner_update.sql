-- ============================================================
-- useBrokerReport.ts's upsertSoftBlockSupabase() calls supabase-js
-- .upsert(payload, { onConflict: 'tenant_id' }) -- which compiles to
-- INSERT ... ON CONFLICT (tenant_id) DO UPDATE. Postgres requires BOTH
-- the INSERT policy AND the UPDATE policy to pass for that statement
-- shape, even when no conflicting row exists yet (it must be prepared
-- to take the update branch). Only "Tenant can update own soft block"
-- and "Admins can update soft blocks" existed -- so the reporting
-- owner's own session (the one actually detecting the 2-report
-- threshold and trying to flip active=true) could never succeed,
-- confirmed empirically ("new row violates row-level security policy"
-- on soft_block_states specifically, even with the INSERT-side EXISTS
-- check satisfied).
--
-- Scoped narrowly: an owner may update a soft-block row only for a
-- tenant they've actually reported, and a trigger pins the
-- resolution-only fields (aadhaar_re_verified, additional_details_provided,
-- details) back to their prior state unless the caller is the tenant
-- themselves or an admin -- an owner can flip the block on, but cannot
-- forge the tenant's own "I've resolved this" state.
-- ============================================================

CREATE POLICY "Reporting owner can update soft block" ON soft_block_states
FOR UPDATE
USING (EXISTS (SELECT 1 FROM broker_reports br WHERE br.tenant_id = soft_block_states.tenant_id AND br.owner_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM broker_reports br WHERE br.tenant_id = soft_block_states.tenant_id AND br.owner_id = auth.uid()));

CREATE OR REPLACE FUNCTION protect_soft_block_resolution_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() != NEW.tenant_id AND NOT is_admin() THEN
    IF TG_OP = 'UPDATE' THEN
      NEW.aadhaar_re_verified := OLD.aadhaar_re_verified;
      NEW.additional_details_provided := OLD.additional_details_provided;
      NEW.details := OLD.details;
    ELSE
      NEW.aadhaar_re_verified := false;
      NEW.additional_details_provided := false;
      NEW.details := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_soft_block_resolution_fields_trigger ON soft_block_states;
CREATE TRIGGER protect_soft_block_resolution_fields_trigger
BEFORE INSERT OR UPDATE ON soft_block_states
FOR EACH ROW
EXECUTE FUNCTION protect_soft_block_resolution_fields();

-- ============================================================
-- Data-layer audit — High #4: enforce the broker soft-block server-side.
--
-- The block was computed in the client (useBrokerReport) over whatever
-- broker_reports RLS returned. But an owner can only read their OWN report
-- of a tenant ("Owners can read own submitted reports", owner_id=auth.uid()),
-- so the >= 2-in-48h threshold was structurally unreachable from the owner
-- side and the auto-activation never fired for the very callers meant to be
-- protected. It only ever activated when the reported tenant (or an admin)
-- happened to load a page with the full set — the control was armed by its
-- own target. And computing it in a data-loading effect meant a READ issued
-- a WRITE (regenerating triggered_at on every StrictMode double-render).
--
-- Fixed by moving the decision into the database, where it sees every report
-- regardless of who is looking:
--   active := (reports for this tenant in the last 48h >= 2)
--             AND NOT (aadhaar_re_verified AND additional_details_provided)
--
-- Recomputed when a report is filed (activation) and when the tenant
-- completes remediation (deactivation). The client now only reads `active`.
--
-- Behaviour note: the block is now "sticky" — once two reports land it stays
-- until the tenant re-verifies and supplies details (or an admin clears the
-- reports), rather than self-lifting purely because the 48h window slid.
-- That is the stronger, intended anti-broker posture.
-- ============================================================

CREATE OR REPLACE FUNCTION public.recompute_soft_block(p_tenant uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_recent int;
  v_remediated boolean;
  v_block boolean;
BEGIN
  SELECT count(*) INTO v_recent
  FROM broker_reports
  WHERE tenant_id = p_tenant
    AND created_at > now() - interval '48 hours';

  SELECT COALESCE(aadhaar_re_verified AND additional_details_provided, false)
  INTO v_remediated
  FROM soft_block_states
  WHERE tenant_id = p_tenant;
  v_remediated := COALESCE(v_remediated, false);

  v_block := (v_recent >= 2) AND NOT v_remediated;

  INSERT INTO soft_block_states (tenant_id, active, triggered_at)
  VALUES (p_tenant, v_block, CASE WHEN v_block THEN now() ELSE NULL END)
  ON CONFLICT (tenant_id) DO UPDATE
    SET active = v_block,
        triggered_at = CASE
          WHEN v_block AND soft_block_states.triggered_at IS NULL THEN now()
          WHEN v_block THEN soft_block_states.triggered_at
          ELSE NULL
        END,
        updated_at = now();
END;
$function$;

-- Filing a report (re)computes the block, seeing all reports via definer rights.
CREATE OR REPLACE FUNCTION public.broker_report_recompute_block()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM recompute_soft_block(NEW.tenant_id);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_broker_report_recompute_block ON broker_reports;
CREATE TRIGGER trg_broker_report_recompute_block
  AFTER INSERT ON broker_reports
  FOR EACH ROW EXECUTE FUNCTION broker_report_recompute_block();

-- Completing remediation lifts the block. A BEFORE UPDATE trigger recomputes
-- `active` inline (no recursion) only when the remediation inputs change, so
-- recompute_soft_block's own active/triggered_at writes don't re-trigger it.
-- Runs after protect_soft_block_resolution_fields (name order 'p' < 't'), so a
-- non-tenant caller whose remediation edits were just reverted sees no change
-- here and the block is untouched.
CREATE OR REPLACE FUNCTION public.soft_block_recompute_active()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_recent int;
BEGIN
  IF NEW.aadhaar_re_verified IS DISTINCT FROM OLD.aadhaar_re_verified
     OR NEW.additional_details_provided IS DISTINCT FROM OLD.additional_details_provided THEN
    SELECT count(*) INTO v_recent
    FROM broker_reports
    WHERE tenant_id = NEW.tenant_id
      AND created_at > now() - interval '48 hours';

    IF (v_recent >= 2) AND NOT (NEW.aadhaar_re_verified AND NEW.additional_details_provided) THEN
      NEW.active := true;
      IF NEW.triggered_at IS NULL THEN NEW.triggered_at := now(); END IF;
    ELSE
      NEW.active := false;
      NEW.triggered_at := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_soft_block_recompute_active ON soft_block_states;
CREATE TRIGGER trg_soft_block_recompute_active
  BEFORE UPDATE ON soft_block_states
  FOR EACH ROW EXECUTE FUNCTION soft_block_recompute_active();

-- Backfill: activate any tenant who already crossed the threshold but was
-- never blocked because the owner-side client couldn't see the full set.
-- auth.uid() is NULL during migration, so protect_soft_block_resolution_fields
-- leaves the remediation fields alone here.
DO $$
DECLARE
  t uuid;
BEGIN
  FOR t IN SELECT DISTINCT tenant_id FROM broker_reports WHERE created_at > now() - interval '48 hours'
  LOOP
    PERFORM recompute_soft_block(t);
  END LOOP;
END $$;

-- ============================================================
-- Fix soft_block_states: missing INSERT policy (and a connected missing
-- UPDATE path) that silently broke the broker soft-block feature end to
-- end.
--
-- Before this migration, the table had only two SELECT policies and one
-- UPDATE policy restricted to admins. But useBrokerReport.ts writes via
-- the regular authenticated client (not service-role) in two flows:
--   1. upsertSoftBlockSupabase() creates the row the first time a
--      tenant crosses the report threshold -- this can run under
--      either the TENANT's own session (loading their status) or the
--      REPORTING OWNER's session (report() -> load() ->
--      buildBrokerReportStatus() recomputes and upserts inline).
--      With no INSERT policy at all, every first-time insert failed
--      silently (caught, console.warn'd, swallowed) -- the tenant was
--      never actually marked active=true, so the block never took
--      effect.
--   2. resolveAadhaar() / submitDetails() -- the tenant's own
--      self-service remediation steps -- update their OWN row under
--      their OWN session. The existing UPDATE policy only allowed
--      is_admin(), so even after a row existed, a tenant could never
--      complete either remediation step.
-- ============================================================

-- Row can be created by: the tenant themselves, an owner who has
-- actually filed a report against that tenant (the real trigger for
-- this table), or an admin. This mirrors the actual business logic
-- rather than allowing any authenticated user to fabricate a
-- soft-block row for an arbitrary tenant.
CREATE POLICY "Tenant, reporting owner, or admin can insert soft block" ON soft_block_states
FOR INSERT WITH CHECK (
    tenant_id = auth.uid()
    OR EXISTS (
        SELECT 1 FROM broker_reports br
        WHERE br.tenant_id = soft_block_states.tenant_id
          AND br.owner_id = auth.uid()
    )
    OR is_admin()
);

-- Tenant can update their own row (needed for the self-service
-- Aadhaar-reverify / additional-details remediation flow in
-- SoftBlockModal.tsx). Admin UPDATE policy already exists separately.
CREATE POLICY "Tenant can update own soft block" ON soft_block_states
FOR UPDATE USING (tenant_id = auth.uid())
WITH CHECK (tenant_id = auth.uid());

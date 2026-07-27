-- ============================================================
-- Owners had no SELECT policy on broker_reports at all -- only admins
-- and the reported tenant could read rows. This silently broke two
-- things for the reporting owner's own session:
--
-- 1. useBrokerReport(tenantId)'s fetchReportsSupabase() always returned
--    zero rows for an owner, so `alreadyReported`/`canBeReportedBy`
--    never reflected reality (the "Reported" badge never showed, and
--    the app-level duplicate-report guard was silently inert).
-- 2. soft_block_states' INSERT policy's EXISTS subquery
--    (`EXISTS (SELECT 1 FROM broker_reports br WHERE br.tenant_id = ...
--    AND br.owner_id = auth.uid())`) is itself subject to RLS on
--    broker_reports for the calling role -- with zero SELECT access,
--    that subquery always evaluated to false, so the owner's own
--    session could never upsert the soft-block row once the 2-report
--    threshold was hit. Confirmed empirically: an owner with two real,
--    valid reports on file still got "new row violates row-level
--    security policy" trying to write soft_block_states.
--
-- Scoped to only the reports the owner themselves filed (not other
-- owners' reports about the same tenant) -- matches what "did I already
-- report this person" should reveal, nothing more.
-- ============================================================

CREATE POLICY "Owners can read own submitted reports" ON broker_reports
FOR SELECT USING (owner_id = auth.uid());

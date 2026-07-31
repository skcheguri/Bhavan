-- ============================================================
-- Fix broker_reports.reason CHECK constraint mismatch.
--
-- The constraint allowed 'broker', 'commission', 'competing_listings',
-- 'refused_identity', 'other' -- but the app (ReportBrokerModal.tsx /
-- useBrokerReport.ts's ReportReason type, AND the admin dashboard's own
-- reasonLabels map in admin/broker-reports/page.tsx) has always sent
-- 'broker_agent', 'asked_commission', 'shared_competing_listing',
-- 'refused_identity', 'other'. Three of five reasons silently failed
-- every insert with a check-constraint violation -- confirmed empirically,
-- table was completely empty despite a real report attempt. The admin
-- page's own labels already assume the app's naming, so the constraint
-- is the side that's wrong.
-- ============================================================

ALTER TABLE broker_reports DROP CONSTRAINT broker_reports_reason_check;

ALTER TABLE broker_reports ADD CONSTRAINT broker_reports_reason_check
CHECK (reason = ANY (ARRAY['broker_agent'::text, 'asked_commission'::text, 'shared_competing_listing'::text, 'refused_identity'::text, 'other'::text]));

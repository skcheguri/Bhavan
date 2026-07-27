-- ============================================================
-- Bhavan Platform -- fix maintenance_requests.status CHECK constraint
-- ============================================================
-- The base schema only allowed status IN ('pending', 'in_progress',
-- 'completed', 'rejected'), but every piece of app code that reads or
-- writes this column (useMaintenanceRequests.ts, the tenant Requests
-- tab, and the owner Requests tab being wired up now) uses
-- 'pending' | 'acknowledged' | 'in_progress' | 'resolved' instead.
-- Any owner attempt to acknowledge or resolve a request would have
-- failed with a CHECK violation. Widening the constraint to match
-- what the app actually writes (dynamic lookup since the constraint
-- name isn't guaranteed -- see migration 004 for the same pattern).
-- ============================================================

DO $$
DECLARE
    old_constraint TEXT;
BEGIN
    SELECT con.conname INTO old_constraint
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'maintenance_requests' AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%status%';
    IF old_constraint IS NOT NULL THEN
        EXECUTE format('ALTER TABLE maintenance_requests DROP CONSTRAINT %I', old_constraint);
    END IF;
END $$;

ALTER TABLE maintenance_requests ADD CONSTRAINT maintenance_requests_status_check
    CHECK (status IN ('pending', 'acknowledged', 'in_progress', 'resolved'));

-- ============================================================
-- END OF MIGRATION
-- ============================================================

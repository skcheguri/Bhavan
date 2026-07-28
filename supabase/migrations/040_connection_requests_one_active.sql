-- Nothing prevented a tenant from having multiple pending/approved
-- connection_requests for the same listing -- the UI was the only
-- thing stopping a duplicate send, and (until just now) it didn't
-- actually check for an existing request before showing the button.
-- This is the defense-in-depth backstop: at most one pending-or-approved
-- request per (tenant, listing). A tenant can still send a new one after
-- a decline -- that's a legitimate "try again" case, not a duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS idx_connection_requests_one_active_per_tenant_listing
    ON connection_requests (tenant_id, listing_id)
    WHERE status IN ('pending', 'approved');

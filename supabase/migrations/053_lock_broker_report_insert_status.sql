-- Found while building the broker_reports RLS regression suite:
-- unlike the other tables in this series, broker_reports has NO
-- owner-side UPDATE policy at all (only admins can update, via
-- "Admins can update broker reports") -- so post-submission tampering
-- isn't possible here. But the owner's INSERT policy ("Owners can
-- create reports") only checks owner_id, not `status` or `admin_note`.
-- The real UI never sends either field at submission (useBrokerReport
-- ts:97-103 only sends tenant_id/owner_id/listing_id/reason/
-- reason_text, relying on status's DB default of 'pending'), but a raw
-- API call could submit a report already marked 'resolved' or
-- 'dismissed' -- skipping admin review entirely -- or with a
-- fabricated admin_note impersonating an admin's own review comment.

ALTER POLICY "Owners can create reports" ON broker_reports
  WITH CHECK (owner_id = auth.uid() AND status = 'pending' AND admin_note IS NULL);

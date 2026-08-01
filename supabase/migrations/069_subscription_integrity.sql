-- owner_subscriptions had a primary key on id but nothing stopping a
-- second row for the same owner. verify-subscription-payment branches on
-- "does a subscription row exist?" and inserts when it doesn't, so two
-- concurrent verifications (a double-click, a retried callback) could
-- create two rows. Every later read uses .maybeSingle(), which ERRORS on
-- multiple rows -- so a paying customer would silently render as free.
--
-- Collapse any existing duplicates to the most recently updated row
-- before adding the constraint that prevents it recurring.
DELETE FROM owner_subscriptions a
USING owner_subscriptions b
WHERE a.owner_id = b.owner_id
  AND (a.updated_at, a.id) < (b.updated_at, b.id);

ALTER TABLE owner_subscriptions
  ADD CONSTRAINT owner_subscriptions_owner_id_key UNIQUE (owner_id);

-- Indexes for the three foreign keys that had none. These are all small
-- admin tables today, but purge_unconfirmed_accounts() and account
-- deletion both cascade from users, and an unindexed FK makes each
-- deleted row a sequential scan here.
CREATE INDEX IF NOT EXISTS idx_listing_reports_reporter ON listing_reports (reporter_id);
CREATE INDEX IF NOT EXISTS idx_error_alert_settings_updated_by ON error_alert_settings (updated_by);
CREATE INDEX IF NOT EXISTS idx_error_rate_alerts_acknowledged_by ON error_rate_alerts (acknowledged_by);

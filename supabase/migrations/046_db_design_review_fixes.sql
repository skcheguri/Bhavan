-- ============================================================
-- Database design review fixes.
--
-- 1. Twelve foreign-key columns had no index at all -- Postgres doesn't
--    auto-index FK columns, and every one of these is a real, frequent
--    lookup pattern in this app (e.g. "reviews for this listing",
--    "receipts for this listing", "saved_listings for this listing").
--
-- 2. rent_payments, rental_agreements, rent_receipts, and billing_history
--    all CASCADE on user deletion. That means deleting a user account
--    would silently destroy real rent-payment history, signed rental
--    agreements, receipts, and billing records -- directly contradicting
--    the Privacy Policy's stated retention promise ("rent payment and
--    agreement records tied to a tenancy may be retained after account
--    closure"), and destroying records the OTHER party to the tenancy
--    still needs. Changed to RESTRICT: a user with real financial/legal
--    history can no longer be hard-deleted at all until a proper
--    soft-delete/anonymization flow exists -- that's the correct
--    constraint to have in place before such a flow is built, not an
--    inconvenience to route around. Non-financial tables (properties,
--    listings, maintenance requests, etc.) are untouched -- cascading
--    those away is fine, they're inventory/workflow, not financial
--    records.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_broker_reports_listing ON broker_reports(listing_id);
CREATE INDEX IF NOT EXISTS idx_client_error_logs_user ON client_error_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_community_comments_author ON community_comments(author_id);
CREATE INDEX IF NOT EXISTS idx_community_post_reports_reporter ON community_post_reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_contact_attempts_listing ON contact_attempts(listing_id);
CREATE INDEX IF NOT EXISTS idx_rent_receipts_listing ON rent_receipts(listing_id);
CREATE INDEX IF NOT EXISTS idx_rent_receipts_payment ON rent_receipts(rent_payment_id);
CREATE INDEX IF NOT EXISTS idx_rental_agreements_listing ON rental_agreements(listing_id);
CREATE INDEX IF NOT EXISTS idx_rental_agreements_unit ON rental_agreements(unit_id);
CREATE INDEX IF NOT EXISTS idx_reviews_listing ON reviews(listing_id);
CREATE INDEX IF NOT EXISTS idx_saved_listings_listing ON saved_listings(listing_id);
CREATE INDEX IF NOT EXISTS idx_upi_mandates_property ON upi_mandates(property_id);

ALTER TABLE rent_payments DROP CONSTRAINT rent_payments_owner_id_fkey;
ALTER TABLE rent_payments ADD CONSTRAINT rent_payments_owner_id_fkey
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT;

ALTER TABLE rent_payments DROP CONSTRAINT rent_payments_tenant_id_fkey;
ALTER TABLE rent_payments ADD CONSTRAINT rent_payments_tenant_id_fkey
    FOREIGN KEY (tenant_id) REFERENCES users(id) ON DELETE RESTRICT;

ALTER TABLE rental_agreements DROP CONSTRAINT rental_agreements_owner_id_fkey;
ALTER TABLE rental_agreements ADD CONSTRAINT rental_agreements_owner_id_fkey
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT;

ALTER TABLE rent_receipts DROP CONSTRAINT rent_receipts_owner_id_fkey;
ALTER TABLE rent_receipts ADD CONSTRAINT rent_receipts_owner_id_fkey
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT;

ALTER TABLE billing_history DROP CONSTRAINT billing_history_owner_id_fkey;
ALTER TABLE billing_history ADD CONSTRAINT billing_history_owner_id_fkey
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT;

-- ============================================================
-- END OF MIGRATION
-- ============================================================

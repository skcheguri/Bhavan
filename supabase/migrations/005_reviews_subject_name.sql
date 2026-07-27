-- ============================================================
-- Bhavan Platform -- reviews.subject_id should be optional
-- ============================================================
-- The review form only collects a free-text name for who's being
-- reviewed (tenant/owner), not a linked user account -- there's no
-- user-picker in the UI. Make subject_id optional and add a
-- subject_name text fallback (same denormalized-text pattern already
-- used for listing_title/listing_location on connection_requests).
-- ============================================================

ALTER TABLE reviews ALTER COLUMN subject_id DROP NOT NULL;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS subject_name TEXT;

-- ============================================================
-- END OF MIGRATION
-- ============================================================

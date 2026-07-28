-- ============================================================
-- Add a real `state` column alongside the existing `city` column, so the
-- list-property form's new State -> City cascading dropdown has
-- somewhere real to store the selected state (previously only city was
-- captured; state was dropped on the floor entirely).
-- ============================================================

ALTER TABLE properties ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS state TEXT;

CREATE INDEX IF NOT EXISTS idx_listings_state ON listings(state);

-- ============================================================
-- END OF MIGRATION
-- ============================================================

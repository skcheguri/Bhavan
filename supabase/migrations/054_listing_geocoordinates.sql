-- Adds coordinates so listings can be sorted/filtered by distance from a
-- searcher's current location. Populated best-effort at listing create/edit
-- time by geocoding the owner's address; listings without a resolved
-- address (e.g. geocoding failed) simply have NULL coordinates and are
-- excluded from distance-based sorting rather than blocking listing creation.
ALTER TABLE listings ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS idx_listings_coordinates ON listings (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

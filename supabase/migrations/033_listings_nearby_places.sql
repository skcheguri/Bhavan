-- ============================================================
-- "Nearby Places" on listing-detail has always rendered an empty
-- section -- useListingDetail.ts hardcodes `nearby: []` unconditionally,
-- and there's no column anywhere to store real data. Rather than
-- integrating an external Places API (per-request billing, needs an
-- Edge Function proxy + API key management), the owner enters up to 6
-- landmarks manually as free text when listing/editing a property --
-- optional, e.g. "City Hospital" + "1.2 km".
-- ============================================================

ALTER TABLE listings ADD COLUMN IF NOT EXISTS nearby_places JSONB DEFAULT '[]'::jsonb;

-- ============================================================
-- list-property/page.tsx's amenity submission tried to look up each
-- checked box's human-readable label via
-- `form.querySelector('label[for="' + id + '"]')` -- but the actual
-- markup wraps the checkbox INSIDE a <label> (implicit association),
-- there's no separate `<label for="...">` element, so that query
-- always returned null and every submission silently fell back to the
-- raw internal name ('amenity_wifi', 'amenity_security', ...) instead
-- of the intended label ('WiFi Included', '24/7 Security', ...).
-- Confirmed live: every real listing had raw keys stored. The
-- submission code itself is fixed in the same change as this
-- migration; this backfills the listings created before that fix.
-- ============================================================

UPDATE listings
SET amenities = (
  SELECT array_agg(
    CASE elem
      WHEN 'amenity_wifi' THEN 'WiFi Included'
      WHEN 'amenity_ac' THEN 'Air Conditioning'
      WHEN 'amenity_gym' THEN 'Gym / Fitness'
      WHEN 'amenity_security' THEN '24/7 Security'
      WHEN 'amenity_lift' THEN 'Lift / Elevator'
      WHEN 'amenity_power' THEN 'Power Backup'
      WHEN 'amenity_water' THEN '24/7 Water'
      WHEN 'amenity_pets' THEN 'Pet Friendly'
      WHEN 'amenity_balcony' THEN 'Balcony'
      ELSE elem
    END
  )
  FROM unnest(amenities) AS elem
)
WHERE amenities IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM unnest(amenities) AS elem WHERE elem LIKE 'amenity\_%' ESCAPE '\'
  );

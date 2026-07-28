-- The tenant-facing "New Request" form offers 10 categories (plumbing,
-- electrical, water, elevator, carpentry, painting, ac, security,
-- housekeeping, other), but this check constraint was still the
-- original narrower baseline list (plumbing, electrical, appliance,
-- structural, cleaning, other) -- so most category choices in the
-- actual UI could never be submitted.
ALTER TABLE maintenance_requests DROP CONSTRAINT maintenance_requests_category_check;
ALTER TABLE maintenance_requests ADD CONSTRAINT maintenance_requests_category_check
    CHECK (category = ANY (ARRAY[
        'plumbing'::text, 'electrical'::text, 'water'::text, 'elevator'::text,
        'carpentry'::text, 'painting'::text, 'ac'::text, 'security'::text,
        'housekeeping'::text, 'other'::text
    ]));

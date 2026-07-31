-- ============================================================
-- Bhavan Platform -- Seed one test owner + property + listing
-- ============================================================
-- Not a migration -- run manually, once, whenever you want a real
-- listing to test against (browsing, "Request to Connect", etc.).
-- This seeded owner has no auth.users row / password, so you can't log
-- in as them -- it exists purely so there's a real UUID listing for a
-- real (signed-up) tenant account to interact with.
-- Safe to re-run: uses a fixed id and ON CONFLICT DO NOTHING.
-- ============================================================

INSERT INTO users (id, email, name, role, verified_email, verified_aadhaar)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'seed-owner@bhavan.test',
    'Suresh Patel',
    'owner',
    true,
    true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO properties (id, owner_id, name, address, city, monthly_income, verified)
VALUES (
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    'Prestige Towers',
    'Koramangala, Bangalore',
    'Bangalore',
    22000,
    true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO listings (
    id, property_id, owner_id, title, description, price, deposit,
    maintenance_charge, location, city, bedrooms, bathrooms, area_sqft,
    furnished, property_type, status, verified, category
)
VALUES (
    '00000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    'Sunny 2BHK in Koramangala',
    'Test listing seeded for development -- beautifully renovated 2-bedroom apartment with modern kitchen.',
    22000,
    66000,
    2000,
    'Koramangala, Bangalore',
    'Bangalore',
    2,
    2,
    1150,
    true,
    'apartment',
    'active',
    true,
    'residential'
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- END OF SEED
-- ============================================================

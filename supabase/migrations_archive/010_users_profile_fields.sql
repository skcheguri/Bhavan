-- ============================================================
-- Bhavan Platform -- add missing profile columns to users
-- ============================================================
-- The Personal Information edit form (owner-profile and
-- tenant-profile) has always collected date of birth, occupation,
-- emergency contact, move-in date, and current flat -- but none of
-- these columns ever existed on `users`. Edits appeared to save
-- (toast + local state) but silently never persisted, resetting on
-- next login/refresh.
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS occupation TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS move_in_date DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS current_flat TEXT;

-- ============================================================
-- END OF MIGRATION
-- ============================================================

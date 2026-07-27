-- ============================================================
-- Real vacation-rental booking requests.
--
-- Previously handleVacationBook() in listing-detail/page.tsx just
-- awaited a 1200ms setTimeout and showed a fake "Booking Request Sent!"
-- confirmation -- no table existed to write to, and the "reserved
-- dates" calendar it checked against was never actually populated
-- (useListingDetail.ts's mapped Listing object never sets
-- reservedDates, so it was always []), so double-booking was never
-- prevented in the first place either.
--
-- Modeled as a request/approval flow (matching the UI copy: "will
-- confirm your stay within 24 hours") rather than instant confirmation
-- -- multiple pending requests for overlapping dates are allowed (the
-- owner picks one), but two CONFIRMED bookings can never overlap for
-- the same listing, enforced at the database level via an EXCLUDE
-- constraint so a race between two simultaneous requests can't both
-- succeed.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS vacation_bookings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    check_in DATE NOT NULL,
    check_out DATE NOT NULL,
    guest_count INTEGER NOT NULL DEFAULT 1,
    total_price INTEGER NOT NULL,
    status TEXT CHECK (status IN ('pending', 'confirmed', 'declined', 'cancelled')) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CHECK (check_out > check_in),
    -- Only CONFIRMED bookings block a listing's dates -- pending
    -- requests can overlap (the owner hasn't picked one yet).
    EXCLUDE USING gist (
        listing_id WITH =,
        daterange(check_in, check_out) WITH &&
    ) WHERE (status = 'confirmed')
);

CREATE INDEX idx_vacation_bookings_listing ON vacation_bookings(listing_id);
CREATE INDEX idx_vacation_bookings_tenant ON vacation_bookings(tenant_id);
CREATE INDEX idx_vacation_bookings_owner ON vacation_bookings(owner_id);

CREATE TRIGGER update_vacation_bookings_updated_at BEFORE UPDATE ON vacation_bookings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE vacation_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant can read own bookings" ON vacation_bookings
FOR SELECT USING (tenant_id = auth.uid());

CREATE POLICY "Owner can read bookings on own listings" ON vacation_bookings
FOR SELECT USING (owner_id = auth.uid());

CREATE POLICY "Admins can read all bookings" ON vacation_bookings
FOR SELECT USING (is_admin());

CREATE POLICY "Tenant can create own booking request" ON vacation_bookings
FOR INSERT WITH CHECK (tenant_id = auth.uid());

CREATE POLICY "Owner can update status on own listings" ON vacation_bookings
FOR UPDATE USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Tenant can cancel own booking" ON vacation_bookings
FOR UPDATE USING (tenant_id = auth.uid()) WITH CHECK (tenant_id = auth.uid());

-- Public-safe calendar view: anyone browsing a listing (including
-- logged-out visitors) needs to see which dates are already booked, but
-- has no business seeing WHO booked them. Only confirmed bookings are
-- exposed (pending requests aren't "blocked" dates).
CREATE OR REPLACE VIEW vacation_bookings_public WITH (security_invoker = false) AS
  SELECT listing_id, check_in, check_out
  FROM vacation_bookings
  WHERE status = 'confirmed';

GRANT SELECT ON vacation_bookings_public TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

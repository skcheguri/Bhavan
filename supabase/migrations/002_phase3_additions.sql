-- ============================================================
-- Bhavan Platform -- Phase 3 additions
-- Adds tables/columns for features that were mock-data-only:
-- reviews, rental agreements, rent receipts, community post
-- reports, broker report admin workflow, Aadhaar verification
-- display fields.
-- Run this in the Supabase SQL editor against the project
-- already running bhavan_schema.sql.
-- ============================================================

-- ============================================================
-- 1. REVIEWS (feedback / ratings between tenant & owner)
-- ============================================================
CREATE TABLE IF NOT EXISTS reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reviewer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject_id UUID REFERENCES users(id) ON DELETE SET NULL,
    subject_name TEXT,
    listing_id UUID REFERENCES listings(id) ON DELETE SET NULL,
    role TEXT CHECK (role IN ('owner_on_renter', 'renter_on_owner')) NOT NULL,
    property_name TEXT,
    location TEXT,
    tenancy_period TEXT,
    overall_rating INTEGER CHECK (overall_rating BETWEEN 1 AND 5) NOT NULL,
    answers JSONB DEFAULT '[]',
    comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_reviews_reviewer ON reviews(reviewer_id);
CREATE INDEX idx_reviews_subject ON reviews(subject_id);

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read reviews" ON reviews FOR SELECT USING (true);
CREATE POLICY "Authenticated can create own reviews" ON reviews FOR INSERT TO authenticated WITH CHECK (reviewer_id = auth.uid());
CREATE POLICY "Reviewers can delete own reviews" ON reviews FOR DELETE TO authenticated USING (reviewer_id = auth.uid());

-- ============================================================
-- 2. RENTAL AGREEMENTS (generated agreement records)
-- ============================================================
CREATE TABLE IF NOT EXISTS rental_agreements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agreement_number TEXT UNIQUE NOT NULL,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES users(id) ON DELETE SET NULL,
    unit_id UUID REFERENCES units(id) ON DELETE SET NULL,
    tenant_name TEXT NOT NULL,
    tenant_address TEXT,
    tenant_phone TEXT,
    tenant_email TEXT,
    tenant_pan TEXT,
    tenant_aadhaar_masked TEXT,
    landlord_name TEXT NOT NULL,
    landlord_address TEXT,
    landlord_phone TEXT,
    landlord_email TEXT,
    landlord_pan TEXT,
    property_address TEXT,
    property_description TEXT,
    flat_number TEXT,
    carpet_area INTEGER,
    lease_start_date DATE,
    lease_end_date DATE,
    monthly_rent INTEGER,
    security_deposit INTEGER,
    rent_due_day INTEGER,
    payment_mode TEXT,
    maintenance_amount INTEGER,
    notice_period_days INTEGER,
    lock_in_months INTEGER,
    renewal_clause TEXT,
    signed_by_landlord BOOLEAN DEFAULT FALSE,
    signed_by_tenant BOOLEAN DEFAULT FALSE,
    shared_with_tenant BOOLEAN DEFAULT FALSE,
    shared_at TIMESTAMP WITH TIME ZONE,
    witness1_name TEXT,
    witness1_address TEXT,
    witness2_name TEXT,
    witness2_address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_rental_agreements_owner ON rental_agreements(owner_id);
CREATE INDEX idx_rental_agreements_tenant ON rental_agreements(tenant_id);

ALTER TABLE rental_agreements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can manage own agreements" ON rental_agreements FOR ALL USING (owner_id = auth.uid());
CREATE POLICY "Owners can insert own agreements" ON rental_agreements FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Tenants can read agreements naming them" ON rental_agreements FOR SELECT USING (tenant_id = auth.uid());

-- ============================================================
-- 3. RENT RECEIPTS (generated receipt records)
-- ============================================================
CREATE TABLE IF NOT EXISTS rent_receipts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    receipt_number TEXT UNIQUE NOT NULL,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES users(id) ON DELETE SET NULL,
    rent_payment_id UUID REFERENCES rent_payments(id) ON DELETE SET NULL,
    landlord_name TEXT NOT NULL,
    landlord_pan TEXT,
    landlord_address TEXT,
    tenant_name TEXT NOT NULL,
    tenant_pan TEXT,
    property_address TEXT,
    period_from DATE,
    period_to DATE,
    rent_amount INTEGER NOT NULL,
    payment_mode TEXT CHECK (payment_mode IN ('cash', 'cheque', 'upi', 'bank_transfer', 'card')),
    transaction_ref TEXT,
    payment_date DATE,
    includes_maintenance BOOLEAN DEFAULT FALSE,
    maintenance_amount INTEGER DEFAULT 0,
    notes TEXT,
    sent_to_tenant BOOLEAN DEFAULT FALSE,
    sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_rent_receipts_owner ON rent_receipts(owner_id);
CREATE INDEX idx_rent_receipts_tenant ON rent_receipts(tenant_id);

ALTER TABLE rent_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can manage own receipts" ON rent_receipts FOR ALL USING (owner_id = auth.uid());
CREATE POLICY "Owners can insert own receipts" ON rent_receipts FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Tenants can read receipts naming them" ON rent_receipts FOR SELECT USING (tenant_id = auth.uid());

-- ============================================================
-- 4. COMMUNITY POST REPORTS + hidden flag (admin moderation)
-- ============================================================
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS hidden BOOLEAN DEFAULT FALSE;

-- The base schema's "Public can read posts" policy (USING (true)) predates
-- the `hidden` column and would let anyone still fetch hidden posts directly
-- via the API, making the moderation "Hide Post" action a no-op at the data
-- layer. Replace it with a version that actually excludes hidden posts for
-- everyone except admins.
DROP POLICY IF EXISTS "Public can read posts" ON community_posts;
CREATE POLICY "Public can read visible posts" ON community_posts FOR SELECT USING (
    hidden = FALSE OR is_admin()
);

CREATE TABLE IF NOT EXISTS community_post_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
    reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(post_id, reporter_id)
);

CREATE INDEX idx_community_post_reports_post ON community_post_reports(post_id);

ALTER TABLE community_post_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read post reports" ON community_post_reports FOR SELECT USING (
    is_admin()
);
CREATE POLICY "Authenticated can report posts" ON community_post_reports FOR INSERT TO authenticated WITH CHECK (reporter_id = auth.uid());
-- Needed for the "Dismiss Reports" admin action, which deletes all report
-- rows for a post; without this DELETE policy RLS silently blocks it.
CREATE POLICY "Admins can dismiss post reports" ON community_post_reports FOR DELETE USING (
    is_admin()
);

CREATE POLICY "Admins can update posts" ON community_posts FOR UPDATE USING (
    is_admin()
);

-- ============================================================
-- 5. BROKER REPORTS -- admin moderation workflow columns
-- ============================================================
ALTER TABLE broker_reports ADD COLUMN IF NOT EXISTS status TEXT CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')) DEFAULT 'pending';
ALTER TABLE broker_reports ADD COLUMN IF NOT EXISTS admin_note TEXT;
ALTER TABLE broker_reports ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

DROP TRIGGER IF EXISTS update_broker_reports_updated_at ON broker_reports;
CREATE TRIGGER update_broker_reports_updated_at BEFORE UPDATE ON broker_reports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE POLICY "Admins can read all broker reports" ON broker_reports FOR SELECT USING (
    is_admin()
);
CREATE POLICY "Admins can update broker reports" ON broker_reports FOR UPDATE USING (
    is_admin()
);

CREATE POLICY "Admins can update soft blocks" ON soft_block_states FOR UPDATE USING (
    is_admin()
);

-- ============================================================
-- 6. USERS -- Aadhaar verification display fields
-- (masking rules per requirements.md 6.5.4: never store full number)
-- ============================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS aadhaar_last4 TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS aadhaar_verified_at TIMESTAMP WITH TIME ZONE;

-- The base schema only allows self-update on users (auth.uid() = id), so an
-- admin approving someone else's Aadhaar verification (setting
-- verified_aadhaar/aadhaar_last4/aadhaar_verified_at on *their* row) would be
-- silently blocked by RLS without this.
CREATE POLICY "Admins can update any user" ON users FOR UPDATE USING (
    is_admin()
);

-- ============================================================
-- 7. AADHAAR VERIFICATIONS (submission queue for admin review)
-- Matches requirements.md 6.5: OCR extraction, name match score,
-- provider verification, retry logic, masked failure reasons.
-- ============================================================
CREATE TABLE IF NOT EXISTS aadhaar_verifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    aadhaar_name_extracted TEXT,
    aadhaar_last4 TEXT,
    match_score INTEGER,
    status TEXT CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
    failure_code TEXT CHECK (failure_code IN ('BLURRY_IMAGE', 'NAME_MISMATCH', 'INVALID_AADHAAR', 'ALREADY_USED', 'PROVIDER_ERROR', 'EXPIRED_SESSION')),
    rejection_reason TEXT,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    reviewed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_aadhaar_verifications_user ON aadhaar_verifications(user_id);
CREATE INDEX idx_aadhaar_verifications_status ON aadhaar_verifications(status);

ALTER TABLE aadhaar_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own verification submissions" ON aadhaar_verifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can insert own verification submissions" ON aadhaar_verifications FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins can read all verification submissions" ON aadhaar_verifications FOR SELECT USING (
    is_admin()
);
CREATE POLICY "Admins can update verification submissions" ON aadhaar_verifications FOR UPDATE USING (
    is_admin()
);

-- ============================================================
-- END OF MIGRATION
-- ============================================================

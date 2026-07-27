-- ============================================================
-- Bhavan Platform -- real Aadhaar e-KYC verification support.
-- The actual OTP send/verify calls happen server-side in the
-- `aadhaar-verify` Edge Function (never in the browser, so a
-- provider API key never reaches the client). This migration
-- adds the audit trail + status columns that function writes to.
-- ============================================================

-- ---- 1. Verification status on the user's profile row.
-- `verified_aadhaar` and `aadhaar_last4` already exist in the base
-- schema; this adds a richer status + timestamp for the UI/support.
-- ============================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS aadhaar_verification_status TEXT
    CHECK (aadhaar_verification_status IN ('unverified', 'pending', 'verified', 'failed'))
    DEFAULT 'unverified';
ALTER TABLE users ADD COLUMN IF NOT EXISTS aadhaar_verified_at TIMESTAMP WITH TIME ZONE;

-- ---- 2. Verification attempts audit trail.
-- One row per OTP request. Never stores the full Aadhaar number or
-- the OTP itself -- only the last 4 digits and the provider's own
-- reference id, which the Edge Function uses to validate that a
-- "verify" call belongs to a request it actually issued (never trust
-- a client-supplied "I'm verified" flag).
-- ============================================================
CREATE TABLE IF NOT EXISTS aadhaar_verification_attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider_reference TEXT NOT NULL,
    aadhaar_last4 TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('otp_sent', 'verified', 'failed', 'expired')) DEFAULT 'otp_sent',
    failure_reason TEXT,
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    verified_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_aadhaar_attempts_user ON aadhaar_verification_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_aadhaar_attempts_reference ON aadhaar_verification_attempts(provider_reference);

ALTER TABLE aadhaar_verification_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own aadhaar attempts" ON aadhaar_verification_attempts
    FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can insert own aadhaar attempts" ON aadhaar_verification_attempts
    FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can update own aadhaar attempts" ON aadhaar_verification_attempts
    FOR UPDATE USING (user_id = auth.uid());

-- ============================================================
-- END OF MIGRATION
-- ============================================================

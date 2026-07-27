-- ============================================================
-- Repurpose the "Aadhaar Verification" admin tab into a read-only
-- audit log, since it was reading from a table (aadhaar_verifications)
-- that nothing in the codebase ever writes to -- confirmed empirically,
-- the real Aadhaar flow (aadhaar-verify Edge Function) is a fully
-- automated OTP e-KYC via a licensed third-party provider, writing
-- directly to users.verified_aadhaar and to
-- aadhaar_verification_attempts. There is no pending human decision
-- left to review -- the provider already made the call in real time --
-- so admins get visibility (who attempted, pass/fail, when) rather
-- than a dead approve/reject queue.
--
-- aadhaar_verification_attempts had no admin SELECT policy at all.
-- ============================================================

CREATE POLICY "Admins can read all aadhaar attempts" ON aadhaar_verification_attempts
FOR SELECT USING (is_admin());

-- The old manual-review table/RPC are now genuinely dead: nothing
-- inserts into aadhaar_verifications, and admin_verified_users() is
-- superseded by querying users_public directly (verified_aadhaar is
-- already a public column there).
DROP TABLE IF EXISTS aadhaar_verifications;
DROP FUNCTION IF EXISTS admin_verified_users(INT);

NOTIFY pgrst, 'reload schema';

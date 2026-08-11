-- ============================================================
-- Close a self-serve verification hole: mark_aadhaar_verified() and
-- set_aadhaar_verification_status() were EXECUTE-granted to
-- `authenticated` (migration 042), so any logged-in user could call
--   supabase.rpc('mark_aadhaar_verified', { p_last4: '1234' })
-- from the browser console and award themselves the "Aadhaar Verified"
-- badge without ever talking to the KYC provider.
--
-- The only legitimate caller is the aadhaar-verify edge function, and
-- only AFTER the provider has confirmed the OTP. That function used to
-- run these RPCs as the caller's own JWT (which is exactly why the grant
-- to `authenticated` existed); it now calls them with the service role
-- key instead, so the grant can be service_role-only.
--
-- Because the service role has no auth.uid(), both functions take the
-- target user id explicitly. The old single-argument signatures are
-- dropped outright -- keeping them around would keep the hole open.
-- ============================================================

DROP FUNCTION IF EXISTS mark_aadhaar_verified(text);
DROP FUNCTION IF EXISTS set_aadhaar_verification_status(text);

CREATE FUNCTION set_aadhaar_verification_status(p_user_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;
  -- Same escape hatch as migration 042: without it the
  -- protect_privileged_user_columns() trigger pins the verification
  -- columns back to their old values.
  PERFORM set_config('bhavan.trusted_verification_write', 'true', true);
  UPDATE users SET aadhaar_verification_status = p_status WHERE id = p_user_id;
END;
$$;

CREATE FUNCTION mark_aadhaar_verified(p_user_id uuid, p_last4 text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id is required';
  END IF;
  PERFORM set_config('bhavan.trusted_verification_write', 'true', true);
  UPDATE users
  SET verified_aadhaar = true,
      aadhaar_last4 = p_last4,
      aadhaar_verification_status = 'verified',
      aadhaar_verified_at = now()
  WHERE id = p_user_id;
END;
$$;

-- Functions are EXECUTE-granted to PUBLIC by default on creation, so the
-- explicit revoke is the fix, not a formality.
REVOKE EXECUTE ON FUNCTION set_aadhaar_verification_status(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION mark_aadhaar_verified(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION set_aadhaar_verification_status(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION mark_aadhaar_verified(uuid, text) TO service_role;

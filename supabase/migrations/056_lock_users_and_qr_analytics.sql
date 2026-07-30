-- Finding 1: "Public read users" (qual: true) sat on the base `users` table
-- alongside the properly-scoped `users_public` view (id, name, avatar_url,
-- role, verified_aadhaar, created_at only). It's currently inert -- neither
-- anon nor authenticated has a SELECT grant on `users`, so RLS never gets
-- evaluated for reads -- but it's a landmine: the moment anyone grants
-- SELECT on this table (e.g. via the dashboard's table editor, which can
-- do this automatically), every user's phone, Aadhaar last-4, DOB, and
-- emergency contact become world-readable with zero other changes. Dead
-- code with no functional purpose since users_public already serves every
-- legitimate public-read need in the app -- just remove it.
DROP POLICY IF EXISTS "Public read users" ON users;

-- Finding 2: qr_analytics allowed any request (including anon, needed for
-- unauthenticated QR-code scans) to UPDATE scans_count/messages_sent to
-- ANY value for ANY listing -- not just increment their own scan. The
-- client did a manual select-then-write, but RLS (not client JS) is what
-- actually constrains this, so a direct API call could set arbitrary
-- values. Not a privacy leak (no PII in this table) but a real integrity
-- hole: someone could vandalize a competitor's stats or fake their own
-- performance numbers. Route mutations through the same atomic
-- SECURITY DEFINER RPC pattern already used for listings.views_count.
CREATE OR REPLACE FUNCTION increment_qr_counter(p_listing_id uuid, p_field text, p_delta integer DEFAULT 1)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_field NOT IN ('scans_count', 'messages_sent') THEN
    RAISE EXCEPTION 'invalid field: %', p_field;
  END IF;

  INSERT INTO qr_analytics (listing_id, scan_date, scans_count, messages_sent)
  VALUES (
    p_listing_id,
    CURRENT_DATE,
    CASE WHEN p_field = 'scans_count' THEN GREATEST(p_delta, 0) ELSE 0 END,
    CASE WHEN p_field = 'messages_sent' THEN GREATEST(p_delta, 0) ELSE 0 END
  )
  ON CONFLICT (listing_id, scan_date) DO UPDATE SET
    scans_count = GREATEST(0, qr_analytics.scans_count + CASE WHEN p_field = 'scans_count' THEN p_delta ELSE 0 END),
    messages_sent = GREATEST(0, qr_analytics.messages_sent + CASE WHEN p_field = 'messages_sent' THEN p_delta ELSE 0 END);
END;
$$;

GRANT EXECUTE ON FUNCTION increment_qr_counter(uuid, text, integer) TO anon, authenticated;

DROP POLICY IF EXISTS "Anyone can record a QR scan" ON qr_analytics;
DROP POLICY IF EXISTS "Anyone can update a QR scan count" ON qr_analytics;
REVOKE INSERT, UPDATE ON qr_analytics FROM anon, authenticated;

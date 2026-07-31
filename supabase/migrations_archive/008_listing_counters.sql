-- ============================================================
-- Bhavan Platform -- functional listing counters
-- ============================================================
-- listings.views_count / inquiries_count / saves_count have existed
-- in the schema since the start but nothing ever updated them -- My
-- Listings cards showed hardcoded numbers ('187', '14', '32').
--
-- PostgREST's .update() can only set a column to a literal value, not
-- `column + 1`, and views need to increment for anonymous visitors
-- too (who have no UPDATE grant on listings at all). A SECURITY
-- DEFINER function handles both: atomic increment, and bypasses RLS
-- so anon can bump views_count without a general listings UPDATE
-- policy for anon.
-- ============================================================

CREATE OR REPLACE FUNCTION increment_listing_counter(p_listing_id UUID, p_counter TEXT, p_delta INT DEFAULT 1)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_counter = 'views_count' THEN
        UPDATE listings SET views_count = GREATEST(0, COALESCE(views_count, 0) + p_delta) WHERE id = p_listing_id;
    ELSIF p_counter = 'saves_count' THEN
        UPDATE listings SET saves_count = GREATEST(0, COALESCE(saves_count, 0) + p_delta) WHERE id = p_listing_id;
    ELSIF p_counter = 'inquiries_count' THEN
        UPDATE listings SET inquiries_count = GREATEST(0, COALESCE(inquiries_count, 0) + p_delta) WHERE id = p_listing_id;
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_listing_counter(UUID, TEXT, INT) TO anon, authenticated;

-- ============================================================
-- END OF MIGRATION
-- ============================================================

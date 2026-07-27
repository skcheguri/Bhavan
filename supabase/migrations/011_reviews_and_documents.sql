-- ============================================================
-- Bhavan Platform -- restrict reviews to real relationships +
-- document-generator support columns
-- ============================================================

-- ---- 1. Reviews: enforce reviewer/subject actually had an approved
-- connection before a review can be inserted with a real subject_id.
-- Free-text-only reviews (subject_id NULL, from the public /feedback
-- page) are still allowed -- only linked reviews are gated.
-- ============================================================
DROP POLICY IF EXISTS "Authenticated can create own reviews" ON reviews;
CREATE POLICY "Authenticated can create own reviews" ON reviews FOR INSERT TO authenticated WITH CHECK (
    reviewer_id = auth.uid()
    AND (
        subject_id IS NULL
        OR EXISTS (
            SELECT 1 FROM connection_requests cr
            WHERE cr.status = 'approved'
              AND (
                  (cr.tenant_id = reviewer_id AND cr.owner_id = subject_id)
                  OR (cr.owner_id = reviewer_id AND cr.tenant_id = subject_id)
              )
        )
    )
);

CREATE INDEX IF NOT EXISTS idx_reviews_subject ON reviews(subject_id);

-- ---- 2. Rental agreements: configurable terms & conditions +
-- link back to the listing the agreement was generated for.
-- ============================================================
ALTER TABLE rental_agreements ADD COLUMN IF NOT EXISTS clauses TEXT[] DEFAULT '{}';
ALTER TABLE rental_agreements ADD COLUMN IF NOT EXISTS listing_id UUID REFERENCES listings(id) ON DELETE SET NULL;

-- ---- 3. Rent receipts: same listing link for consistency.
-- ============================================================
ALTER TABLE rent_receipts ADD COLUMN IF NOT EXISTS listing_id UUID REFERENCES listings(id) ON DELETE SET NULL;

-- ============================================================
-- END OF MIGRATION
-- ============================================================

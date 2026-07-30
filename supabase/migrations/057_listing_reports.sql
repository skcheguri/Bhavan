-- Lets a tenant flag a listing as misleading (photos don't match the
-- property, inaccurate details, etc.) after viewing or visiting it --
-- closes the loop on listing-accuracy fraud that an admin's own review
-- (at submission time) might miss. Mirrors the existing
-- community_post_reports / broker_reports shape.
CREATE TABLE listing_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason text NOT NULL,
  reason_text text,
  status text NOT NULL DEFAULT 'pending',
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);

ALTER TABLE listing_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenants can report a listing" ON listing_reports
  FOR INSERT WITH CHECK (reporter_id = auth.uid());

CREATE POLICY "Reporters can read own reports" ON listing_reports
  FOR SELECT USING (reporter_id = auth.uid());

CREATE POLICY "Admins can read all listing reports" ON listing_reports
  FOR SELECT USING (is_admin());

CREATE POLICY "Admins can update listing reports" ON listing_reports
  FOR UPDATE USING (is_admin());

CREATE INDEX idx_listing_reports_listing_id ON listing_reports (listing_id);
CREATE INDEX idx_listing_reports_status ON listing_reports (status);

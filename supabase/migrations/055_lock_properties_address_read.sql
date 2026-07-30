-- "Tenants can read properties" (qual: true) let anyone -- including an
-- unauthenticated request using only the public anon key -- read every
-- property's full street address via a direct REST call. No app code path
-- actually needs that: only the owning owner and admins (property
-- verification review) ever query this table. Scope it to match.
DROP POLICY IF EXISTS "Tenants can read properties" ON properties;

CREATE POLICY "Owners and admins can read properties" ON properties
  FOR SELECT
  USING (owner_id = auth.uid() OR is_admin());

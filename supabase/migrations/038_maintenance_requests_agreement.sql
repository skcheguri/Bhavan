-- maintenance_requests.property_id was NOT NULL and FK'd to `properties`,
-- the same dead/unpopulated table rent_payments used to point at. Worse,
-- the owner's ability to even SEE a request at all was gated entirely
-- through "does a properties row with this owner_id exist" -- which for
-- every real tenancy in this app (created via rental_agreements) it
-- never does. So owners could never see or be notified of a request
-- regardless of anything client-side.
--
-- Switches the real relationship to agreement_id (-> rental_agreements,
-- the table the app actually populates), with owner_id derived
-- server-side by trigger from the agreement -- never trusted from the
-- client -- so a tenant can't spoof which owner gets notified.

ALTER TABLE maintenance_requests
    ADD COLUMN IF NOT EXISTS agreement_id UUID REFERENCES rental_agreements(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES users(id);

ALTER TABLE maintenance_requests ALTER COLUMN property_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION set_maintenance_request_owner()
RETURNS TRIGGER AS $$
DECLARE
  v_owner_id UUID;
  v_agreement_tenant_id UUID;
BEGIN
  IF NEW.agreement_id IS NULL THEN
    RAISE EXCEPTION 'agreement_id is required';
  END IF;

  SELECT owner_id, tenant_id INTO v_owner_id, v_agreement_tenant_id
  FROM rental_agreements
  WHERE id = NEW.agreement_id;

  IF v_owner_id IS NULL OR v_agreement_tenant_id IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'agreement_id does not belong to this tenant';
  END IF;

  NEW.owner_id := v_owner_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_maintenance_request_owner ON maintenance_requests;
CREATE TRIGGER trg_set_maintenance_request_owner
    BEFORE INSERT ON maintenance_requests
    FOR EACH ROW EXECUTE FUNCTION set_maintenance_request_owner();

DROP POLICY IF EXISTS "Owners can read property requests" ON maintenance_requests;
DROP POLICY IF EXISTS "Owners can update property requests" ON maintenance_requests;

CREATE POLICY "Owners can read their tenants requests" ON maintenance_requests
    FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY "Owners can update their tenants requests" ON maintenance_requests
    FOR UPDATE USING (owner_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_maintenance_requests_owner_id ON maintenance_requests(owner_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_requests_agreement_id ON maintenance_requests(agreement_id);

CREATE OR REPLACE FUNCTION notify_maintenance_request_created(p_request_id UUID)
RETURNS VOID AS $$
DECLARE
  v_owner_id UUID;
  v_category TEXT;
  v_title TEXT;
BEGIN
  SELECT owner_id, category, title INTO v_owner_id, v_category, v_title
  FROM maintenance_requests
  WHERE id = p_request_id AND tenant_id = auth.uid();

  IF v_owner_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO notifications (user_id, type, title, message, action_url)
  VALUES (
    v_owner_id,
    'maintenance',
    'New maintenance request',
    'A tenant reported a ' || v_category || ' issue' || CASE WHEN v_title IS NOT NULL AND v_title <> '' THEN ': ' || v_title ELSE '' END || '.',
    '/owner-profile'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION notify_maintenance_request_created(UUID) TO authenticated;

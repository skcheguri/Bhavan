-- "Book a Visit" / "Schedule a Visit" was entirely client-side fake --
-- it just flipped a local `visitSubmitted` flag for 5 seconds and reset,
-- with a TODO noting no backing table existed yet. With nothing ever
-- persisted, there was no way to know a request already existed, so the
-- button stayed clickable forever and a tenant could "send" the same
-- visit request any number of times.
--
-- owner_id is derived server-side (by trigger) from an approved
-- connection_requests row for the same tenant+listing -- never trusted
-- from the client -- which also enforces the same rule the UI already
-- shows the button under: you can only request a visit once the owner
-- has approved your connection request.

CREATE TABLE IF NOT EXISTS property_visits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    visit_date DATE NOT NULL,
    visit_time TEXT NOT NULL,
    visitor_name TEXT NOT NULL,
    visitor_phone TEXT NOT NULL,
    visitor_email TEXT NOT NULL,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'confirmed', 'cancelled', 'completed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_property_visits_tenant_id ON property_visits(tenant_id);
CREATE INDEX IF NOT EXISTS idx_property_visits_owner_id ON property_visits(owner_id);
CREATE INDEX IF NOT EXISTS idx_property_visits_listing_id ON property_visits(listing_id);

-- At most one active (requested/confirmed) visit per tenant+listing --
-- the actual backstop against duplicate visit requests.
CREATE UNIQUE INDEX IF NOT EXISTS idx_property_visits_one_active_per_tenant_listing
    ON property_visits (tenant_id, listing_id)
    WHERE status IN ('requested', 'confirmed');

CREATE OR REPLACE FUNCTION set_property_visit_owner()
RETURNS TRIGGER AS $$
DECLARE
  v_owner_id UUID;
BEGIN
  SELECT owner_id INTO v_owner_id
  FROM connection_requests
  WHERE tenant_id = NEW.tenant_id AND listing_id = NEW.listing_id AND status = 'approved'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'No approved connection request for this listing';
  END IF;

  NEW.owner_id := v_owner_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_property_visit_owner ON property_visits;
CREATE TRIGGER trg_set_property_visit_owner
    BEFORE INSERT ON property_visits
    FOR EACH ROW EXECUTE FUNCTION set_property_visit_owner();

ALTER TABLE property_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenants can insert own visits" ON property_visits
    FOR INSERT WITH CHECK (tenant_id = auth.uid());
CREATE POLICY "Tenants can read own visits" ON property_visits
    FOR SELECT USING (tenant_id = auth.uid());
CREATE POLICY "Owners can read their visits" ON property_visits
    FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY "Owners can update their visits" ON property_visits
    FOR UPDATE USING (owner_id = auth.uid());

CREATE OR REPLACE FUNCTION notify_visit_requested(p_visit_id UUID)
RETURNS VOID AS $$
DECLARE
  v_owner_id UUID;
  v_listing_title TEXT;
  v_visit_date DATE;
  v_visit_time TEXT;
BEGIN
  SELECT pv.owner_id, l.title, pv.visit_date, pv.visit_time
  INTO v_owner_id, v_listing_title, v_visit_date, v_visit_time
  FROM property_visits pv
  JOIN listings l ON l.id = pv.listing_id
  WHERE pv.id = p_visit_id AND pv.tenant_id = auth.uid();

  IF v_owner_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO notifications (user_id, type, title, message, action_url)
  VALUES (
    v_owner_id,
    'lease',
    'New visit request',
    'A tenant requested to visit "' || v_listing_title || '" on ' || to_char(v_visit_date, 'DD Mon YYYY') || ' at ' || v_visit_time || '.',
    '/owner-profile?tab=inquiries'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION notify_visit_requested(UUID) TO authenticated;

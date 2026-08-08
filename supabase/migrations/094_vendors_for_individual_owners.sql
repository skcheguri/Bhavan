-- Extend the contractor list to owners who are not in a society.
--
-- 093 scoped vendors to a community, which was too narrow. Most owners on
-- Bhavan are not in a society at all, and their problem is identical: a
-- tenant reports a leaking tap, the owner rings a plumber, and nothing
-- records who was called or whether they came. The maintenance_request
-- hangs for exactly the reason a society ticket did.
--
-- So a vendor belongs to EITHER a society or an owner, never both and
-- never neither.

ALTER TABLE service_vendors
  ALTER COLUMN community_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE service_vendors DROP CONSTRAINT IF EXISTS service_vendors_scope_check;
ALTER TABLE service_vendors ADD CONSTRAINT service_vendors_scope_check
  CHECK (num_nonnulls(community_id, owner_id) = 1);

CREATE INDEX IF NOT EXISTS idx_service_vendors_owner
  ON service_vendors (owner_id, active, trade);

-- The two surfaces have different category vocabularies -- community
-- tickets say 'lift' and 'cleaning', maintenance requests say 'elevator'
-- and 'housekeeping'. That inconsistency predates this feature and is not
-- worth a migration to unify: existing rows and two UIs depend on it. The
-- trade list is simply the union, so "suggest a vendor for this category"
-- keeps working within whichever vocabulary the caller already speaks.
ALTER TABLE service_vendors DROP CONSTRAINT IF EXISTS service_vendors_trade_check;
ALTER TABLE service_vendors ADD CONSTRAINT service_vendors_trade_check
  CHECK (trade IN (
    -- community_tickets
    'lift', 'water', 'electricity', 'security', 'parking', 'cleaning', 'common_area',
    -- maintenance_requests
    'plumbing', 'electrical', 'elevator', 'carpentry', 'painting', 'ac', 'housekeeping',
    'other'
  ));

-- The assignment column has to exist before the policy below can
-- reference it: a policy body is parsed and validated at CREATE time, so
-- ordering inside a migration matters as much as ordering between them.
ALTER TABLE maintenance_requests
  ADD COLUMN IF NOT EXISTS assigned_vendor_id uuid REFERENCES service_vendors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz;

-- ---------------------------------------------------------------------
-- RLS for the owner-scoped half
-- ---------------------------------------------------------------------

DROP POLICY IF EXISTS "Members read vendors" ON service_vendors;
CREATE POLICY "Members read vendors" ON service_vendors
  FOR SELECT TO authenticated
  USING (
    (community_id IS NOT NULL AND (is_community_member(community_id) OR is_admin()))
    OR owner_id = auth.uid()
    -- A tenant sees "assigned to Ramesh" on their own request, which needs
    -- them to read that one vendor row. Scoped to vendors actually
    -- attached to a request of theirs, so an owner's whole contractor
    -- list is not readable by every tenant they have.
    OR EXISTS (
      SELECT 1 FROM maintenance_requests r
      WHERE r.assigned_vendor_id = service_vendors.id
        AND r.tenant_id = auth.uid()
    )
    OR is_admin()
  );

DROP POLICY IF EXISTS "Paid admins add vendors" ON service_vendors;
CREATE POLICY "Vendors are added by their owner" ON service_vendors
  FOR INSERT TO authenticated
  WITH CHECK (
    -- A society list is part of the paid tooling.
    (community_id IS NOT NULL
      AND is_community_admin(community_id)
      AND community_is_paid(community_id))
    -- An owner's own list is not gated. It is a phone book of people they
    -- already ring, and charging for it would mean the tenant request
    -- keeps hanging for everyone who has not bought Pro -- which is the
    -- problem this exists to fix.
    OR (owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "Admins manage vendors" ON service_vendors;
CREATE POLICY "Admins manage vendors" ON service_vendors
  FOR UPDATE TO authenticated
  USING (
    (community_id IS NOT NULL AND (is_community_admin(community_id) OR is_admin()))
    OR owner_id = auth.uid()
  )
  WITH CHECK (
    (community_id IS NOT NULL AND (is_community_admin(community_id) OR is_admin()))
    OR owner_id = auth.uid()
  );

DROP POLICY IF EXISTS "Admins remove vendors" ON service_vendors;
CREATE POLICY "Admins remove vendors" ON service_vendors
  FOR DELETE TO authenticated
  USING (
    (community_id IS NOT NULL AND (is_community_admin(community_id) OR is_admin()))
    OR owner_id = auth.uid()
  );

-- ---------------------------------------------------------------------
-- Assignment on a tenant's maintenance request
-- ---------------------------------------------------------------------

-- Deliberately NOT adding an 'assigned' status here, unlike
-- community_tickets. Two screens map this column to labels and one sorts
-- by it, and a new value would ripple through both for no gain: the
-- assignee is shown as its own line on the card, so the status can go on
-- meaning what it already means.

CREATE OR REPLACE FUNCTION public.stamp_request_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  IF NEW.assigned_vendor_id IS DISTINCT FROM OLD.assigned_vendor_id THEN
    NEW.assigned_at := CASE WHEN NEW.assigned_vendor_id IS NULL THEN NULL ELSE now() END;

    -- Ringing somebody is progress; leaving it 'pending' afterwards is the
    -- hanging this feature exists to stop.
    IF NEW.assigned_vendor_id IS NOT NULL AND NEW.status = 'pending' THEN
      NEW.status := 'acknowledged';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_request_assignment ON maintenance_requests;
CREATE TRIGGER trg_stamp_request_assignment
  BEFORE UPDATE ON maintenance_requests
  FOR EACH ROW EXECUTE FUNCTION stamp_request_assignment();

-- A landlord must not be able to attach a vendor belonging to somebody
-- else -- that would put a stranger's name and phone number in front of
-- their tenant.
CREATE OR REPLACE FUNCTION public.guard_request_vendor_scope()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.assigned_vendor_id IS NOT NULL
     AND NEW.assigned_vendor_id IS DISTINCT FROM OLD.assigned_vendor_id THEN
    IF NOT EXISTS (
      SELECT 1 FROM service_vendors v
      WHERE v.id = NEW.assigned_vendor_id
        AND v.owner_id = NEW.owner_id
    ) THEN
      RAISE EXCEPTION 'That contractor is not on your list';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_request_vendor_scope ON maintenance_requests;
CREATE TRIGGER trg_guard_request_vendor_scope
  BEFORE UPDATE ON maintenance_requests
  FOR EACH ROW EXECUTE FUNCTION guard_request_vendor_scope();

-- Tell the tenant somebody is coming. Wrapped, per 080.
CREATE OR REPLACE FUNCTION public.notify_request_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_vendor text;
BEGIN
  IF NEW.assigned_vendor_id IS DISTINCT FROM OLD.assigned_vendor_id
     AND NEW.assigned_vendor_id IS NOT NULL THEN
    BEGIN
      SELECT name INTO v_vendor FROM service_vendors WHERE id = NEW.assigned_vendor_id;

      INSERT INTO notifications (user_id, type, title, message, action_url)
      VALUES (
        NEW.tenant_id, 'maintenance',
        'Someone is coming',
        '"' || NEW.title || '" has been assigned to ' || coalesce(v_vendor, 'a contractor') || '.',
        '/tenant-profile?tab=requests'
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'request assignment notification failed: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_request_assignment ON maintenance_requests;
CREATE TRIGGER trg_notify_request_assignment
  AFTER UPDATE ON maintenance_requests
  FOR EACH ROW EXECUTE FUNCTION notify_request_assignment();

-- Found while building the maintenance_requests RLS regression suite:
-- "Owners can update their tenants requests" has no WITH CHECK at all
-- -- an owner can UPDATE any column on a request naming them, not just
-- the status/landlord_notes/resolved_at set the real UI ever writes
-- (useMaintenanceRequests.ts:195-216, updateStatus only ever sets
-- status, updated_at, resolved_at, landlord_notes). Left as-is, an
-- owner could rewrite the tenant's own description/title/category
-- after the fact, swap the images, or reprioritize a request the
-- tenant marked urgent down to low -- none of which any legitimate
-- feature does.
--
-- Same pattern as the connection_requests fix (migration 049): this
-- needs real OLD-vs-NEW comparison, so it's a trigger, not a plain
-- WITH CHECK. is_admin() is exempted the same way.

CREATE OR REPLACE FUNCTION enforce_maintenance_request_immutable_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT is_admin() THEN
        IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
            OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
            OR NEW.property_id IS DISTINCT FROM OLD.property_id
            OR NEW.agreement_id IS DISTINCT FROM OLD.agreement_id
            OR NEW.category IS DISTINCT FROM OLD.category
            OR NEW.description IS DISTINCT FROM OLD.description
            OR NEW.title IS DISTINCT FROM OLD.title
            OR NEW.unit IS DISTINCT FROM OLD.unit
            OR NEW.preferred_time IS DISTINCT FROM OLD.preferred_time
            OR NEW.images IS DISTINCT FROM OLD.images
            OR NEW.priority IS DISTINCT FROM OLD.priority
            OR NEW.created_at IS DISTINCT FROM OLD.created_at
        THEN
            RAISE EXCEPTION 'Only status, landlord_notes, updated_at, and resolved_at may be changed on a maintenance request.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_maintenance_requests_immutable_fields ON maintenance_requests;
CREATE TRIGGER trg_maintenance_requests_immutable_fields
    BEFORE UPDATE ON maintenance_requests
    FOR EACH ROW EXECUTE FUNCTION enforce_maintenance_request_immutable_fields();

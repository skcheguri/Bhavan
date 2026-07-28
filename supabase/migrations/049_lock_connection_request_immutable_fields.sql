-- Found while building the connection_requests RLS regression suite:
-- "Owners can read and update their requests" is a FOR ALL policy with
-- no WITH CHECK at all -- an owner can UPDATE any column on a request
-- naming them, not just the status/responded_at pair the real UI ever
-- writes (useConnectionRequests.ts:108 only ever does
-- `.update({ status, responded_at })`). Left as-is, an owner could
-- rewrite the tenant's own message after the fact, reassign the
-- request to a different tenant_id, change the listing snapshot
-- fields, or even reassign owner_id -- none of which any legitimate
-- feature does, and all of which undermine the record as evidence of
-- what was actually requested and by whom.
--
-- Unlike the rent_payments/rental_agreements fixes, this needs real
-- OLD-vs-NEW comparison (a plain WITH CHECK only sees the new row), so
-- it's a trigger, following the same pattern as the rate-limit trigger
-- already on this table from migration 045. is_admin() is exempted the
-- same way that trigger already exempts admins, so a future admin
-- moderation path isn't blocked by this.

CREATE OR REPLACE FUNCTION enforce_connection_request_immutable_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT is_admin() THEN
        IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
            OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
            OR NEW.listing_id IS DISTINCT FROM OLD.listing_id
            OR NEW.message IS DISTINCT FROM OLD.message
            OR NEW.move_in_date IS DISTINCT FROM OLD.move_in_date
            OR NEW.occupation IS DISTINCT FROM OLD.occupation
            OR NEW.scanned_via_qr IS DISTINCT FROM OLD.scanned_via_qr
            OR NEW.listing_title IS DISTINCT FROM OLD.listing_title
            OR NEW.listing_location IS DISTINCT FROM OLD.listing_location
            OR NEW.listing_price IS DISTINCT FROM OLD.listing_price
            OR NEW.created_at IS DISTINCT FROM OLD.created_at
        THEN
            RAISE EXCEPTION 'Only status and responded_at may be changed on a connection request.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_connection_requests_immutable_fields ON connection_requests;
CREATE TRIGGER trg_connection_requests_immutable_fields
    BEFORE UPDATE ON connection_requests
    FOR EACH ROW EXECUTE FUNCTION enforce_connection_request_immutable_fields();

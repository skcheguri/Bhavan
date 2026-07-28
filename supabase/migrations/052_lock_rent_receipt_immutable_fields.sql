-- Found while building the rent_receipts RLS regression suite: same
-- shape as rental_agreements (migration 048). "Owners can manage own
-- receipts" is a FOR ALL policy with no WITH CHECK, and the separate
-- "Owners can insert own receipts" only checks owner_id. Neither stops
-- an owner from rewriting a receipt's rent_amount, tenant_name, dates,
-- etc. after issuing it -- when the real UI only ever writes
-- sent_to_tenant/sent_at (useRentReceipts.ts's markShared-equivalent
-- flow). A rent receipt is a financial/legal record; letting the
-- issuer silently rewrite it after the fact defeats its purpose as
-- proof of what was actually paid.
--
-- Needs OLD-vs-NEW comparison (two fields are legitimately mutable,
-- not one fixed safe value), so it's a trigger, same pattern as
-- connection_requests/maintenance_requests.

CREATE OR REPLACE FUNCTION enforce_rent_receipt_immutable_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT is_admin() THEN
        IF NEW.owner_id IS DISTINCT FROM OLD.owner_id
            OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
            OR NEW.rent_payment_id IS DISTINCT FROM OLD.rent_payment_id
            OR NEW.listing_id IS DISTINCT FROM OLD.listing_id
            OR NEW.receipt_number IS DISTINCT FROM OLD.receipt_number
            OR NEW.landlord_name IS DISTINCT FROM OLD.landlord_name
            OR NEW.landlord_pan IS DISTINCT FROM OLD.landlord_pan
            OR NEW.landlord_address IS DISTINCT FROM OLD.landlord_address
            OR NEW.tenant_name IS DISTINCT FROM OLD.tenant_name
            OR NEW.tenant_pan IS DISTINCT FROM OLD.tenant_pan
            OR NEW.property_address IS DISTINCT FROM OLD.property_address
            OR NEW.period_from IS DISTINCT FROM OLD.period_from
            OR NEW.period_to IS DISTINCT FROM OLD.period_to
            OR NEW.rent_amount IS DISTINCT FROM OLD.rent_amount
            OR NEW.payment_mode IS DISTINCT FROM OLD.payment_mode
            OR NEW.transaction_ref IS DISTINCT FROM OLD.transaction_ref
            OR NEW.payment_date IS DISTINCT FROM OLD.payment_date
            OR NEW.includes_maintenance IS DISTINCT FROM OLD.includes_maintenance
            OR NEW.maintenance_amount IS DISTINCT FROM OLD.maintenance_amount
            OR NEW.notes IS DISTINCT FROM OLD.notes
            OR NEW.created_at IS DISTINCT FROM OLD.created_at
        THEN
            RAISE EXCEPTION 'Only sent_to_tenant and sent_at may be changed on a rent receipt.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rent_receipts_immutable_fields ON rent_receipts;
CREATE TRIGGER trg_rent_receipts_immutable_fields
    BEFORE UPDATE ON rent_receipts
    FOR EACH ROW EXECUTE FUNCTION enforce_rent_receipt_immutable_fields();

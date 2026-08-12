-- ============================================================
-- Landlord signature on rent receipts.
--
-- rent_receipts.signed_by_landlord existed as a flag nothing ever set,
-- and the receipt document rendered a "Landlord's Signature" line that
-- was really just the printed name with no record of an actual signing.
-- A receipt is issued BY the landlord, so issuing it IS the signing act:
-- both the auto-issued receipt (migration 135) and a hand-created one now
-- record signed_by_landlord = true with a timestamp, and the document
-- shows "signed on <date>".
-- ============================================================

ALTER TABLE rent_receipts
  ADD COLUMN IF NOT EXISTS landlord_signed_at timestamptz;

-- Existing receipts were issued by their landlord; stamp them as signed
-- at issue time. (The immutability trigger only guards the core content
-- fields, not the signature columns, so this update is allowed.)
UPDATE rent_receipts
  SET signed_by_landlord = true, landlord_signed_at = created_at
  WHERE landlord_signed_at IS NULL;

-- Auto-issue trigger (from 135): record the landlord signature too.
CREATE OR REPLACE FUNCTION issue_rent_receipt_on_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ra rental_agreements;
  v_period_from date;
BEGIN
  IF NEW.status <> 'paid' OR OLD.status IS NOT DISTINCT FROM 'paid'
     OR NEW.payment_mode <> 'razorpay' OR NEW.agreement_id IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    IF EXISTS (SELECT 1 FROM rent_receipts WHERE rent_payment_id = NEW.id) THEN
      RETURN NEW;
    END IF;

    SELECT * INTO ra FROM rental_agreements WHERE id = NEW.agreement_id;
    IF ra.id IS NULL THEN
      RETURN NEW;
    END IF;

    BEGIN
      v_period_from := to_date(NEW.month, 'FMMonth YYYY');
    EXCEPTION WHEN OTHERS THEN
      v_period_from := NULL;
    END;

    INSERT INTO rent_receipts (
      receipt_number, owner_id, tenant_id, rent_payment_id,
      landlord_name, landlord_pan, landlord_address,
      tenant_name, tenant_pan, property_address,
      period_from, period_to,
      rent_amount, payment_mode, transaction_ref, payment_date,
      includes_maintenance, maintenance_amount, notes,
      sent_to_tenant, sent_at,
      signed_by_landlord, landlord_signed_at
    ) VALUES (
      'RR-' || to_char(now(), 'YYYY') || '-' || upper(substr(replace(NEW.id::text, '-', ''), 1, 8)),
      NEW.owner_id, NEW.tenant_id, NEW.id,
      ra.landlord_name, ra.landlord_pan, ra.landlord_address,
      ra.tenant_name, ra.tenant_pan, ra.property_address,
      v_period_from,
      CASE WHEN v_period_from IS NULL THEN NULL ELSE (v_period_from + interval '1 month' - interval '1 day')::date END,
      round(NEW.amount / 100.0)::integer,
      'upi',
      NEW.razorpay_payment_id,
      current_date,
      false, 0,
      'Auto-issued for online rent payment.',
      true, now(),
      true, now()
    );

    INSERT INTO notifications (user_id, type, title, message, action_url)
    VALUES (
      NEW.tenant_id, 'payment', 'Rent receipt ready',
      'Your receipt for ' || COALESCE(NEW.month, 'this month') || ' is ready to view and download.',
      '/tenant-profile?tab=rentManagement&sub=documents'
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'auto rent receipt failed for payment %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

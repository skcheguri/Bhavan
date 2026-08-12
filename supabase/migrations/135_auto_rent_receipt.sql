-- ============================================================
-- Auto-issue a rent receipt when an online rent payment is captured,
-- and drop the dead receipt_url column.
--
-- Two separate facts, one root cause:
--   * rent_payments.receipt_url was declared and typed but written by
--     nothing -- the real receipt system is the rent_receipts table
--     (structured rows rendered on demand by buildRentReceiptHtml), which
--     receipt_url duplicates and never used. Dropped.
--   * No receipt was ever produced automatically for a successful online
--     rent payment -- a tenant who paid through Razorpay got a paid row
--     and no receipt unless the OWNER remembered to hand-make one on
--     /rent-receipts. Now a receipt is issued the moment the payment is
--     marked paid, from the rental agreement's own details, and the
--     tenant is notified.
--
-- The whole body is exception-guarded: a receipt is a courtesy on top of
-- the payment, never a condition of it, so nothing here may roll back the
-- capture that just succeeded.
-- ============================================================

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
  -- Only on the pending->paid transition of an online payment that is
  -- tied to an agreement, and only once per payment.
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

    -- NEW.month is a label like 'August 2026'. Parse it for the receipt
    -- period; if it doesn't parse, leave the period null rather than fail.
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
      sent_to_tenant, sent_at
    ) VALUES (
      'RR-' || to_char(now(), 'YYYY') || '-' || upper(substr(replace(NEW.id::text, '-', ''), 1, 8)),
      NEW.owner_id, NEW.tenant_id, NEW.id,
      ra.landlord_name, ra.landlord_pan, ra.landlord_address,
      ra.tenant_name, ra.tenant_pan, ra.property_address,
      v_period_from,
      CASE WHEN v_period_from IS NULL THEN NULL ELSE (v_period_from + interval '1 month' - interval '1 day')::date END,
      -- rent_payments.amount is paise; rent_receipts.rent_amount is rupees.
      round(NEW.amount / 100.0)::integer,
      'upi',  -- closest allowed value; Razorpay rent in India is predominantly UPI
      NEW.razorpay_payment_id,
      current_date,
      false, 0,
      'Auto-issued for online rent payment.',
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

DROP TRIGGER IF EXISTS trg_rent_payment_auto_receipt ON rent_payments;
CREATE TRIGGER trg_rent_payment_auto_receipt
  AFTER UPDATE OF status ON rent_payments
  FOR EACH ROW EXECUTE FUNCTION issue_rent_receipt_on_payment();

-- The dead column: superseded by rent_receipts, written by nothing.
ALTER TABLE rent_payments DROP COLUMN IF EXISTS receipt_url;

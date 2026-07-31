-- The notifications table, the bell UI, and the /notifications page were
-- all fully built and working -- but nothing anywhere ever inserted a
-- row into `notifications`. Tenants never got notified when an owner
-- shared a rental agreement, shared a rent receipt, or approved a
-- connection request, because nothing wrote those events.
--
-- notifications' own RLS only allows `user_id = auth.uid()` on INSERT,
-- so an owner's client can't directly insert a notification addressed
-- to their tenant. These SECURITY DEFINER functions bridge that gap,
-- each re-deriving the tenant id from a row the caller must actually
-- own (owner_id = auth.uid()) rather than trusting a caller-supplied
-- tenant id -- so this can't be used to spam notifications at an
-- arbitrary user.

CREATE OR REPLACE FUNCTION notify_agreement_shared(p_agreement_id UUID)
RETURNS VOID AS $$
DECLARE
  v_tenant_id UUID;
  v_agreement_number TEXT;
BEGIN
  SELECT tenant_id, agreement_number INTO v_tenant_id, v_agreement_number
  FROM rental_agreements
  WHERE id = p_agreement_id AND owner_id = auth.uid();

  IF v_tenant_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO notifications (user_id, type, title, message, action_url)
  VALUES (
    v_tenant_id,
    'lease',
    'Rental agreement shared',
    'Your landlord shared a rental agreement (' || v_agreement_number || ') with you.',
    '/tenant-profile'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION notify_receipt_shared(p_receipt_id UUID)
RETURNS VOID AS $$
DECLARE
  v_tenant_id UUID;
  v_receipt_number TEXT;
BEGIN
  SELECT tenant_id, receipt_number INTO v_tenant_id, v_receipt_number
  FROM rent_receipts
  WHERE id = p_receipt_id AND owner_id = auth.uid();

  IF v_tenant_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO notifications (user_id, type, title, message, action_url)
  VALUES (
    v_tenant_id,
    'payment',
    'Rent receipt shared',
    'Your landlord shared a rent receipt (' || v_receipt_number || ') with you.',
    '/tenant-profile'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION notify_connection_request_approved(p_request_id UUID)
RETURNS VOID AS $$
DECLARE
  v_tenant_id UUID;
  v_listing_title TEXT;
BEGIN
  SELECT tenant_id, listing_title INTO v_tenant_id, v_listing_title
  FROM connection_requests
  WHERE id = p_request_id AND owner_id = auth.uid() AND status = 'approved';

  IF v_tenant_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO notifications (user_id, type, title, message, action_url)
  VALUES (
    v_tenant_id,
    'inquiry',
    'Request approved',
    'Your request for "' || v_listing_title || '" was approved.',
    '/tenant-profile'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION notify_agreement_shared(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION notify_receipt_shared(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION notify_connection_request_approved(UUID) TO authenticated;

-- notify_connection_request_approved (added earlier) covers the owner
-- approving a request, but nothing ever notified the owner that a new
-- request came in in the first place -- the actual event the tenant
-- triggers by sending one.
--
-- connection_requests.owner_id is client-supplied at insert time (no
-- RLS check ties it to the listing), so it isn't trustworthy as a
-- notification target on its own. This re-derives the real owner from
-- listings.owner_id via listing_id instead, so a tenant can't spoof
-- who gets notified by inserting an arbitrary owner_id.
CREATE OR REPLACE FUNCTION notify_connection_request_created(p_request_id UUID)
RETURNS VOID AS $$
DECLARE
  v_real_owner_id UUID;
  v_listing_title TEXT;
  v_tenant_name TEXT;
BEGIN
  SELECT l.owner_id, cr.listing_title INTO v_real_owner_id, v_listing_title
  FROM connection_requests cr
  JOIN listings l ON l.id = cr.listing_id
  WHERE cr.id = p_request_id AND cr.tenant_id = auth.uid();

  IF v_real_owner_id IS NULL THEN
    RETURN;
  END IF;

  SELECT name INTO v_tenant_name FROM users WHERE id = auth.uid();

  INSERT INTO notifications (user_id, type, title, message, action_url)
  VALUES (
    v_real_owner_id,
    'inquiry',
    'New connection request',
    COALESCE(v_tenant_name, 'A tenant') || ' sent a request for "' || v_listing_title || '".',
    '/owner-profile?tab=inquiries'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION notify_connection_request_created(UUID) TO authenticated;

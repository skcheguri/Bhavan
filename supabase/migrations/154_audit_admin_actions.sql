-- Wire the dormant audit_logs table to platform-admin actions.
--
-- audit_logs has existed since the baseline with a read policy
-- ("Admins can read audit logs", is_admin()) but NO insert policy and
-- nothing writing to it -- a security table everyone assumes is populated
-- is worse than none (HANDOVER 4.6). This populates it.
--
-- Two write paths, because admin actions reach the database two ways:
--
--  1. Direct client writes under is_admin() RLS, and the admin-only
--     SECURITY DEFINER RPCs (admin_mark_payout_paid, admin_withhold_payout,
--     admin_stamp_rental_agreement). Both carry the admin's JWT -- auth.uid()
--     and is_admin() reflect the *caller* even inside a SECURITY DEFINER
--     function -- so an is_admin()-gated AFTER trigger on the moderated
--     tables captures all of them, including the RPC-driven updates, without
--     touching the RPCs. This is covered here.
--
--  2. Service-role edge functions (admin-suspend-user, refund-payment). They
--     bypass RLS and present no JWT, so auth.uid() is NULL and these triggers
--     never fire for them -- those functions write their own audit row
--     explicitly (see the function sources). Not covered here, by design.
--
-- The trigger fires only for admin writes (WHEN is_admin()), so the same
-- table being written by a tenant/owner in the normal flow never logs, and
-- the trigger is scoped to UPDATE/DELETE -- the verbs admin moderation
-- actually uses -- so high-frequency public INSERT paths (the contact form,
-- bookings, report submissions) are untouched.

CREATE OR REPLACE FUNCTION public.audit_admin_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text := CASE TG_OP
    WHEN 'UPDATE' THEN 'update'
    WHEN 'DELETE' THEN 'delete'
    ELSE lower(TG_OP)
  END;
BEGIN
  -- SECURITY DEFINER so it can write audit_logs (admin-read-only, no insert
  -- policy). The WHEN (is_admin()) on each trigger is the gate; auth.uid()
  -- here is the acting admin.
  INSERT INTO audit_logs (user_id, action, table_name, record_id, before, after)
  VALUES (
    auth.uid(),
    v_action,
    TG_TABLE_NAME,
    CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
    to_jsonb(OLD),
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END
  );
  RETURN NULL; -- AFTER trigger: return value is ignored
END;
$$;

COMMENT ON FUNCTION public.audit_admin_write() IS
  'AFTER UPDATE/DELETE trigger: records an admin moderation action in audit_logs. Attach only with WHEN (is_admin()).';

-- Attach to every table a platform admin moderates. UPDATE/DELETE only.
-- broker_reports     -- resolve / dismiss a report
CREATE TRIGGER audit_admin_broker_reports
  AFTER UPDATE OR DELETE ON broker_reports
  FOR EACH ROW WHEN (is_admin())
  EXECUTE FUNCTION audit_admin_write();

-- listing_reports    -- resolve a reported listing
CREATE TRIGGER audit_admin_listing_reports
  AFTER UPDATE OR DELETE ON listing_reports
  FOR EACH ROW WHEN (is_admin())
  EXECUTE FUNCTION audit_admin_write();

-- contact_inquiries  -- mark a support/contact inquiry handled
CREATE TRIGGER audit_admin_contact_inquiries
  AFTER UPDATE OR DELETE ON contact_inquiries
  FOR EACH ROW WHEN (is_admin())
  EXECUTE FUNCTION audit_admin_write();

-- communities        -- approve / suspend / delete a society
CREATE TRIGGER audit_admin_communities
  AFTER UPDATE OR DELETE ON communities
  FOR EACH ROW WHEN (is_admin())
  EXECUTE FUNCTION audit_admin_write();

-- properties         -- approve / revoke property ownership verification
CREATE TRIGGER audit_admin_properties
  AFTER UPDATE OR DELETE ON properties
  FOR EACH ROW WHEN (is_admin())
  EXECUTE FUNCTION audit_admin_write();

-- listings           -- admin takedown / edit of a listing
CREATE TRIGGER audit_admin_listings
  AFTER UPDATE OR DELETE ON listings
  FOR EACH ROW WHEN (is_admin())
  EXECUTE FUNCTION audit_admin_write();

-- vacation_bookings  -- admin_mark_payout_paid / admin_withhold_payout
CREATE TRIGGER audit_admin_vacation_bookings
  AFTER UPDATE OR DELETE ON vacation_bookings
  FOR EACH ROW WHEN (is_admin())
  EXECUTE FUNCTION audit_admin_write();

-- rental_agreements  -- admin_stamp_rental_agreement
CREATE TRIGGER audit_admin_rental_agreements
  AFTER UPDATE OR DELETE ON rental_agreements
  FOR EACH ROW WHEN (is_admin())
  EXECUTE FUNCTION audit_admin_write();

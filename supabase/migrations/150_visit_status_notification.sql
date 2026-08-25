-- ============================================================
-- Second-audit fix (HANDOVER §4.7d). GS2-S2: property-visit status
-- changes never notified the tenant. notify_visit_requested tells the
-- owner about a new request, but when the owner confirms or cancels it,
-- the tenant was never told -- a two-sided flow notified in one direction
-- only. Add a notification to the tenant on the owner's confirm/cancel.
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_visit_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  IF NEW.status NOT IN ('confirmed', 'cancelled') THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT title INTO v_title FROM listings WHERE id = NEW.listing_id;
    v_title := COALESCE(v_title, 'the property');

    IF NEW.status = 'confirmed' THEN
      INSERT INTO notifications (user_id, type, title, message, action_url)
      VALUES (NEW.tenant_id, 'inquiry', 'Visit confirmed',
              'Your visit to ' || v_title || ' on '
                || to_char(NEW.visit_date, 'DD Mon') || ' at ' || NEW.visit_time
                || ' is confirmed.',
              '/tenant-profile');
    ELSE
      INSERT INTO notifications (user_id, type, title, message, action_url)
      VALUES (NEW.tenant_id, 'inquiry', 'Visit cancelled',
              'Your visit to ' || v_title || ' on '
                || to_char(NEW.visit_date, 'DD Mon')
                || ' was cancelled by the owner.',
              '/tenant-profile');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'visit status notification failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_visit_status ON property_visits;
CREATE TRIGGER trg_notify_visit_status
  AFTER UPDATE OF status ON property_visits
  FOR EACH ROW EXECUTE FUNCTION notify_visit_status_change();

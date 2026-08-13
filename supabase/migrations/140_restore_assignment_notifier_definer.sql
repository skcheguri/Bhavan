-- 140: restore SECURITY DEFINER on notify_request_assignment
--
-- Migration 105 fixed the dead link in this notification and, in doing
-- so, broke the notification. It used CREATE OR REPLACE FUNCTION and
-- restated only LANGUAGE plpgsql. That form does not merge with the
-- previous definition -- every property left unstated is reset -- so the
-- SECURITY DEFINER and SET search_path that 094 gave this function were
-- silently dropped.
--
-- The body inserts into notifications with user_id = NEW.tenant_id, but
-- the person performing the UPDATE that fires the trigger is the OWNER
-- assigning a contractor. As SECURITY INVOKER the insert runs as the
-- owner and meets "Users can insert own notifications"
-- (WITH CHECK user_id = auth.uid()), which is false here. The insert is
-- refused, the refusal is caught by this function's own
-- EXCEPTION WHEN OTHERS, and downgraded to a RAISE WARNING nobody reads.
--
-- Net effect since 105: assigning a contractor tells the tenant nothing.
-- No bell entry, and no push either, because the push dispatcher hangs
-- off the notifications INSERT that never happened. The bug was invisible
-- precisely because 105 also added the swallow that hid it.
--
-- Verified on production before writing this: pg_proc.prosecdef = false
-- and proconfig = null for this function.
--
-- Same body as 105 -- only the function properties change.

CREATE OR REPLACE FUNCTION public.notify_request_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
        '/tenant-profile?tab=rentManagement&sub=requests'
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'request assignment notification failed: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

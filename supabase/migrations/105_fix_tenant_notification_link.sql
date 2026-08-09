-- 105: send the tenant somewhere that exists
--
-- "Someone is coming" links a tenant to /tenant-profile?tab=requests.
-- There is no `requests` tab on the tenant profile. Its tabs are
-- overview, saved, inquiries, messages, rentManagement, reviews and
-- settings, and the page validates the ?tab param against that list:
--
--   tabParam && PROFILE_TABS.includes(tabParam) ? tabParam : 'overview'
--
-- So the link does not fail, it silently lands on Overview. A tenant
-- told that a contractor is coming taps the notification and arrives at
-- their profile summary, with no sign of the request the message was
-- about. The fallback is what hides it: an invalid tab looks exactly
-- like no tab at all.
--
-- Tenant maintenance lives one level deeper, at
-- ?tab=rentManagement&sub=requests. Another function in this schema
-- already writes ?tab=rentManagement&sub=documents correctly, so the
-- shape was established -- this one just did not follow it.

CREATE OR REPLACE FUNCTION public.notify_request_assignment()
RETURNS trigger
LANGUAGE plpgsql
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

-- Notifications already sent still carry the dead link. They are the
-- ones a tenant is looking at right now, so fixing only the trigger
-- would leave the reported symptom exactly as it is.
UPDATE public.notifications
   SET action_url = '/tenant-profile?tab=rentManagement&sub=requests'
 WHERE action_url = '/tenant-profile?tab=requests';

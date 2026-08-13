-- 111: land the reader on the tab their review is actually on
--
-- /feedback has two tabs -- "Owner on Tenant" and "Tenant on Owner" --
-- and opens on the first. A review notification links to bare /feedback,
-- so an owner told "A tenant reviewed you" arrives at the reviews they
-- wrote about their tenants. The review they were just told about is one
-- tab away, and nothing on screen says so.
--
-- Which tab a review sits on is exactly its role, so the link can just
-- carry it. Same failure as migration 105: the link resolved, it just
-- resolved somewhere that quietly did not contain the thing.

CREATE OR REPLACE FUNCTION public.notify_review_received()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from text;
BEGIN
  BEGIN
    SELECT name INTO v_from FROM users WHERE id = NEW.reviewer_id;

    INSERT INTO notifications (user_id, type, title, message, action_url)
    VALUES (
      NEW.subject_id,
      'platform',
      CASE WHEN NEW.role = 'owner_on_renter'
           THEN 'An owner reviewed you'
           ELSE 'A tenant reviewed you' END,
      coalesce(v_from, 'Someone') || ' left a review of your '
        || CASE WHEN NEW.role = 'owner_on_renter' THEN 'tenancy' ELSE 'property' END
        || coalesce(' at ' || nullif(NEW.property_name, ''), '') || '.',
      '/feedback?tab=' || NEW.role
    );
  EXCEPTION WHEN OTHERS THEN
    -- A review must not fail because its notification did.
    RAISE WARNING 'review notification failed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

-- The notifications already sent are the ones being read right now, so
-- fixing only the trigger would leave the reported symptom in place. The
-- title records which side the review came from.
UPDATE public.notifications
   SET action_url = CASE
       WHEN title = 'An owner reviewed you' THEN '/feedback?tab=owner_on_renter'
       WHEN title = 'A tenant reviewed you' THEN '/feedback?tab=renter_on_owner'
       ELSE action_url
     END
 WHERE action_url = '/feedback'
   AND title IN ('An owner reviewed you', 'A tenant reviewed you');

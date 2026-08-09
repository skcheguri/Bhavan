-- 110: tell the people who were reviewed before the trigger existed
--
-- 107 added notify_review_received. Triggers only fire forward, so every
-- review written before it landed still has nobody told about it -- and
-- those are precisely the reviews behind the report that started this:
-- "didn't get notification". Fixing the trigger alone would leave the
-- reported symptom exactly as it is.
--
-- Worded in the past tense, because these are not new events. Skips any
-- review whose subject already has a review notification, so re-running
-- this migration cannot double-notify.

INSERT INTO public.notifications (user_id, type, title, message, action_url, created_at)
SELECT
  r.subject_id,
  'platform',
  CASE WHEN r.role = 'owner_on_renter'
       THEN 'An owner reviewed you'
       ELSE 'A tenant reviewed you' END,
  coalesce(u.name, 'Someone') || ' left a review of your '
    || CASE WHEN r.role = 'owner_on_renter' THEN 'tenancy' ELSE 'property' END
    || coalesce(' at ' || nullif(r.property_name, ''), '') || '.',
  '/feedback',
  r.created_at
FROM public.reviews r
LEFT JOIN public.users u ON u.id = r.reviewer_id
WHERE r.subject_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.notifications n
     WHERE n.user_id = r.subject_id
       AND n.action_url = '/feedback'
       AND n.created_at = r.created_at
  );

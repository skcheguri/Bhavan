-- ============================================================
-- Pro plan renewals: warn before they lapse, and tell the owner when
-- they do.
--
-- expire_lapsed_subscriptions() flipped owner_subscriptions to 'expired'
-- on the right day (correct), but silently: no pre-lapse reminder and no
-- lapse notice. A paying owner's Pro just stopped one morning with
-- nothing said -- the same gap society plans had before migration 089,
-- fixed the same way. This rewrites that daily job to do all three
-- stages (14-day reminder, 3-day reminder, then expire + notice) while
-- keeping the job name/schedule so the cron watchdog is unaffected.
--
-- Notifications go to the owner -- the one person who can renew. Keying
-- the reminder on current_period_end means a renewal that pushes the end
-- date out resets the reminder sequence by itself.
-- ============================================================

ALTER TABLE owner_subscriptions
  ADD COLUMN IF NOT EXISTS renewal_reminded_for timestamptz,
  ADD COLUMN IF NOT EXISTS renewal_reminder_stage smallint NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.expire_lapsed_subscriptions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  r record;
  touched integer := 0;
BEGIN
  -- Stage 1: a fortnight out (excluding the last three days, so a nearly
  -- due plan does not get both reminders in one run).
  FOR r IN
    SELECT owner_id, current_period_end
    FROM owner_subscriptions
    WHERE status = 'active'
      AND plan <> 'free'
      AND current_period_end IS NOT NULL
      AND current_period_end > now() + interval '3 days'
      AND current_period_end <= now() + interval '14 days'
      AND (renewal_reminded_for IS DISTINCT FROM current_period_end
           OR renewal_reminder_stage < 1)
  LOOP
    BEGIN
      INSERT INTO notifications (user_id, type, title, message, action_url)
      VALUES (r.owner_id, 'payment', 'Your Pro plan renews soon',
              'Your Bhavan Pro plan expires on ' || to_char(r.current_period_end, 'DD Mon YYYY')
                || '. Renew to keep your Pro features.',
              '/owner-profile?tab=billing');
      UPDATE owner_subscriptions
         SET renewal_reminder_stage = 1, renewal_reminded_for = r.current_period_end, updated_at = now()
       WHERE owner_id = r.owner_id;
      touched := touched + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'pro renewal reminder (stage 1) failed for %: %', r.owner_id, SQLERRM;
    END;
  END LOOP;

  -- Stage 2: the last few days.
  FOR r IN
    SELECT owner_id, current_period_end
    FROM owner_subscriptions
    WHERE status = 'active'
      AND plan <> 'free'
      AND current_period_end IS NOT NULL
      AND current_period_end > now()
      AND current_period_end <= now() + interval '3 days'
      AND (renewal_reminded_for IS DISTINCT FROM current_period_end
           OR renewal_reminder_stage < 2)
  LOOP
    BEGIN
      INSERT INTO notifications (user_id, type, title, message, action_url)
      VALUES (r.owner_id, 'payment', 'Your Pro plan expires this week',
              'Your Bhavan Pro plan expires on ' || to_char(r.current_period_end, 'DD Mon YYYY')
                || '. Renew now so your Pro features do not switch off.',
              '/owner-profile?tab=billing');
      UPDATE owner_subscriptions
         SET renewal_reminder_stage = 2, renewal_reminded_for = r.current_period_end, updated_at = now()
       WHERE owner_id = r.owner_id;
      touched := touched + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'pro renewal reminder (stage 2) failed for %: %', r.owner_id, SQLERRM;
    END;
  END LOOP;

  -- The lapse: flip to expired AND say so. Silence after a plan stops
  -- reads as the app being broken.
  FOR r IN
    SELECT owner_id
    FROM owner_subscriptions
    WHERE status = 'active'
      AND current_period_end IS NOT NULL
      AND current_period_end < now()
  LOOP
    BEGIN
      UPDATE owner_subscriptions SET status = 'expired', updated_at = now() WHERE owner_id = r.owner_id;
      INSERT INTO notifications (user_id, type, title, message, action_url)
      VALUES (r.owner_id, 'payment', 'Your Pro plan has expired',
              'Your Bhavan Pro plan has ended. Renew any time to restore your Pro features.',
              '/owner-profile?tab=billing');
      touched := touched + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'pro lapse handling failed for %: %', r.owner_id, SQLERRM;
    END;
  END LOOP;

  RETURN touched;
END;
$fn$;

COMMENT ON FUNCTION public.expire_lapsed_subscriptions() IS
  'Daily 03:30. Warns Pro owners at 14 and 3 days, then marks lapsed plans expired and notifies the owner.';

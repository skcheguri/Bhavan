-- ============================================================
-- Database correctness audit (2026-08-13) — Medium.
--
--   #6  chat notifications: the coalescing UPDATE slid created_at forward,
--       so a never-cleared thread muted its own 5-minute window forever.
--   #7  maintenance escalation advanced the ladder and stamped escalated_at
--       even when the dedupe sent nothing — burning stages on notifications
--       that never went out.
--   #8  listings.inquiries_count only ever increased (no DELETE handling),
--       and a booking-confirm's inquiry-response burned the owner's manual
--       response rate limit.
--   #9  a cancelled-but-not-yet-refunded booking could be paid out to the
--       host while the guest's refund was still in flight.
--   #10 an admin recording a contribution on behalf of a member was
--       impossible under RLS, though the trigger already anticipated it.
--   #11 a no_show could be marked on the morning of check-in (and paid out
--       the same day), before the guest had the day to arrive.
--   #12 account deletion treated an open-ended lease as inactive while
--       occupancy treated it as active — an owner could self-delete and
--       strand the tenant.
--   #13 the maintenance-escalation cron job was not in the watchdog, so a
--       stall raised no alert.
-- ============================================================

-- ---- #6  chat notification window must actually expire ----
-- The coalescing UPDATE reset created_at to now(), so as long as messages
-- kept arriving under 5 minutes apart and the recipient never opened the
-- app, the row stayed "< 5 min old" forever and no second push ever fired.
-- Refresh the text but leave created_at at the first message's time, so the
-- window genuinely closes and a new bell + push resume the conversation.
CREATE OR REPLACE FUNCTION notify_new_chat_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id  uuid;
  v_owner_id   uuid;
  v_recipient  uuid;
  v_sender_id  uuid;
  v_sender_name text;
  v_action_url text;
  v_preview    text;
  v_existing   uuid;
BEGIN
  SELECT tenant_id, owner_id INTO v_tenant_id, v_owner_id
  FROM connection_requests
  WHERE id = NEW.request_id;

  IF v_tenant_id IS NULL OR v_owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.sender = 'tenant' THEN
    v_sender_id := v_tenant_id;
    v_recipient := v_owner_id;
    v_action_url := '/owner-profile?tab=messages&request=' || NEW.request_id::text;
  ELSE
    v_sender_id := v_owner_id;
    v_recipient := v_tenant_id;
    v_action_url := '/tenant-profile?tab=messages&request=' || NEW.request_id::text;
  END IF;

  SELECT COALESCE(NULLIF(TRIM(name), ''), 'Someone') INTO v_sender_name
  FROM users WHERE id = v_sender_id;

  v_preview := LEFT(REGEXP_REPLACE(NEW.text, '\s+', ' ', 'g'), 120);

  SELECT id INTO v_existing
  FROM notifications
  WHERE user_id = v_recipient
    AND type = 'message'
    AND NOT read
    AND action_url = v_action_url
    AND created_at > now() - interval '5 minutes'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    -- Refresh only the preview text. created_at is deliberately NOT touched:
    -- the burst-collapse window is measured from the first message, so it
    -- expires on time even for a thread the recipient never opens.
    UPDATE notifications
       SET message = v_sender_name || ': ' || v_preview
     WHERE id = v_existing;
    RETURN NEW;
  END IF;

  INSERT INTO notifications (user_id, type, title, message, action_url)
  VALUES (
    v_recipient,
    'message',
    'New message from ' || v_sender_name,
    v_sender_name || ': ' || v_preview,
    v_action_url
  );

  RETURN NEW;
END;
$$;

-- ---- #7  escalate the ladder only when a notification actually went out ----
CREATE OR REPLACE FUNCTION public.run_maintenance_escalation()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  r record;
  sent integer := 0;
  v_inserted integer;
  v_title text;
  v_message text;
  spacing CONSTANT interval := interval '1 hour';
BEGIN
  FOR r IN
    SELECT t.id, t.title, t.community_id, t.escalation_stage
    FROM community_tickets t
    WHERE t.status IN ('open', 'assigned')
      AND t.assigned_vendor_id IS NULL
      AND t.escalation_stage < 2
      AND (t.escalated_at IS NULL OR t.escalated_at < now() - spacing)
      AND t.created_at < now() - (
        CASE WHEN t.priority = 'high' THEN interval '4 hours' ELSE interval '24 hours' END
        * (t.escalation_stage + 1)
      )
  LOOP
    BEGIN
      v_title := CASE WHEN r.escalation_stage = 0
                      THEN 'Still waiting on someone'
                      ELSE 'This has been open a while' END;
      v_message := '"' || r.title || '" has nobody assigned yet.';

      INSERT INTO notifications (user_id, type, title, message, action_url)
      SELECT m.user_id, 'maintenance', v_title, v_message, '/society'
      FROM community_members m
      WHERE m.community_id = r.community_id
        AND m.status = 'approved'
        AND m.role = 'admin'
        AND NOT EXISTS (
          SELECT 1 FROM notifications n
          WHERE n.user_id = m.user_id
            AND n.type = 'maintenance'
            AND n.title = v_title
            AND n.message = v_message
            AND n.created_at > now() - spacing
        );
      GET DIAGNOSTICS v_inserted = ROW_COUNT;

      -- Only advance the ladder if somebody was actually notified. When the
      -- dedupe suppressed every insert, leave the stage and escalated_at
      -- alone so this ticket is retried once the spacing window clears,
      -- rather than silently climbing to the cap having told no one.
      IF v_inserted > 0 THEN
        UPDATE community_tickets
           SET escalation_stage = r.escalation_stage + 1,
               escalated_at = now(),
               updated_at = now()
         WHERE id = r.id;
        sent := sent + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'ticket escalation failed for %: %', r.id, SQLERRM;
    END;
  END LOOP;

  FOR r IN
    SELECT q.id, q.title, q.owner_id, q.escalation_stage
    FROM maintenance_requests q
    WHERE q.status = 'pending'
      AND q.escalation_stage < 2
      AND (q.escalated_at IS NULL OR q.escalated_at < now() - spacing)
      AND q.created_at < now() - (
        CASE WHEN q.priority IN ('high', 'urgent') THEN interval '4 hours' ELSE interval '24 hours' END
        * (q.escalation_stage + 1)
      )
  LOOP
    BEGIN
      v_inserted := 0;
      IF r.owner_id IS NOT NULL THEN
        v_title := CASE WHEN r.escalation_stage = 0
                        THEN 'A tenant is waiting'
                        ELSE 'Still unanswered' END;
        v_message := '"' || r.title || '" has not been acknowledged yet.';

        INSERT INTO notifications (user_id, type, title, message, action_url)
        SELECT r.owner_id, 'maintenance', v_title, v_message, '/owner-profile?tab=requests'
        WHERE NOT EXISTS (
          SELECT 1 FROM notifications n
          WHERE n.user_id = r.owner_id
            AND n.type = 'maintenance'
            AND n.title = v_title
            AND n.message = v_message
            AND n.created_at > now() - spacing
        );
        GET DIAGNOSTICS v_inserted = ROW_COUNT;
      END IF;

      IF v_inserted > 0 THEN
        UPDATE maintenance_requests
           SET escalation_stage = r.escalation_stage + 1,
               escalated_at = now(),
               updated_at = now()
         WHERE id = r.id;
        sent := sent + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'request escalation failed for %: %', r.id, SQLERRM;
    END;
  END LOOP;

  RETURN sent;
END;
$fn$;

-- ---- #8  inquiries_count symmetric; booking-confirm doesn't burn the quota ----
-- The counter mirrored connection_requests but only counted INSERTs, so any
-- delete (owner action historically, or an FK cascade) drifted it upward
-- forever. Handle DELETE like the saves counter does.
CREATE OR REPLACE FUNCTION sync_listing_inquiries_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE listings SET inquiries_count = COALESCE(inquiries_count, 0) + 1 WHERE id = NEW.listing_id;
    RETURN NEW;
  ELSE
    UPDATE listings SET inquiries_count = GREATEST(0, COALESCE(inquiries_count, 0) - 1) WHERE id = OLD.listing_id;
    RETURN OLD;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_connection_requests_sync_count ON connection_requests;
CREATE TRIGGER trg_connection_requests_sync_count
  AFTER INSERT OR DELETE ON connection_requests
  FOR EACH ROW EXECUTE FUNCTION sync_listing_inquiries_count();

-- The inquiry-response rate limit exists to throttle an owner manually
-- approving/declining inquiries. The booking-confirm path (127) flips a
-- pending request to approved as the service role, which was charging the
-- owner a slot for a response they never made — and could exhaust their
-- 50/day so real inquiries could no longer be answered. Charge only when
-- the owner themselves is the actor.
CREATE OR REPLACE FUNCTION public.enforce_inquiry_response_rate_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF NEW.status IS DISTINCT FROM OLD.status
        AND OLD.status = 'pending'
        AND NEW.status IN ('approved', 'declined')
        AND NOT is_admin()
        AND auth.uid() = NEW.owner_id THEN
        PERFORM check_and_record_rate_limit(NEW.owner_id, NULL, 'inquiry_response', 50, 200);
    END IF;
    RETURN NEW;
END;
$function$;

-- ---- #9  never pay out a cancelled booking with a live refund ----
CREATE OR REPLACE FUNCTION admin_mark_payout_paid(p_booking uuid, p_reference text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking vacation_bookings;
  v_title text;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Admins only.';
  END IF;

  SELECT * INTO v_booking FROM vacation_bookings WHERE id = p_booking;
  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'Booking not found.';
  END IF;
  -- A cancelled booking is only a host forfeit if no refund was issued or
  -- is in flight. refunded_at is set the moment a refund is initiated, so it
  -- distinguishes "guest forfeited, host keeps it" from "guest is being
  -- refunded" — without it, an admin could release the payout while the
  -- refund settled and the platform would pay both sides.
  IF NOT (vacation_booking_payout_due(v_booking)
          OR (v_booking.status = 'cancelled'
              AND v_booking.payment_status = 'paid'
              AND v_booking.payout_status = 'unpaid'
              AND v_booking.refunded_at IS NULL)) THEN
    RAISE EXCEPTION 'This booking has no payout due.';
  END IF;

  UPDATE vacation_bookings
  SET payout_status = 'paid',
      payout_reference = NULLIF(trim(COALESCE(p_reference, '')), ''),
      payout_at = now()
  WHERE id = p_booking;

  BEGIN
    SELECT title INTO v_title FROM listings WHERE id = v_booking.listing_id;
    INSERT INTO notifications (user_id, type, title, message, action_url)
    VALUES (
      v_booking.owner_id,
      'payment',
      'Payout sent',
      'Rs. ' || COALESCE(v_booking.base_amount, v_booking.total_price)::text
        || ' for the stay at ' || COALESCE(v_title, 'your property')
        || ' (' || to_char(v_booking.check_in, 'DD Mon') || ' - ' || to_char(v_booking.check_out, 'DD Mon')
        || ') has been transferred to your payout account.',
      '/owner-profile?tab=bookings'
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'payout notification failed: %', SQLERRM;
  END;
END;
$$;

REVOKE EXECUTE ON FUNCTION admin_mark_payout_paid(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_mark_payout_paid(uuid, text) TO authenticated, service_role;

-- ---- #10  let a society admin record a contribution for a member ----
-- The trigger (085 force_claimed_contribution) already keeps a 'confirmed'
-- status for admins, but the INSERT policy hard-required user_id = auth.uid(),
-- so the treasurer's "record an offline payment for a member" action was
-- impossible. Allow a community admin (or platform admin) to insert for
-- anyone in an open community, keeping the self-service member branch.
DROP POLICY IF EXISTS "Members record their own payment" ON community_contributions;
CREATE POLICY "Members record their own payment" ON community_contributions
  FOR INSERT TO authenticated
  WITH CHECK (
    community_is_open(collection_community(collection_id))
    AND (
      (user_id = auth.uid() AND is_community_member(collection_community(collection_id)))
      OR is_community_admin(collection_community(collection_id))
      OR is_admin()
    )
  );

-- ---- #11  no_show only after check-in day has passed ----
CREATE OR REPLACE FUNCTION enforce_vacation_booking_transitions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.listing_id IS DISTINCT FROM OLD.listing_id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
     OR NEW.check_in IS DISTINCT FROM OLD.check_in
     OR NEW.check_out IS DISTINCT FROM OLD.check_out
     OR NEW.guest_count IS DISTINCT FROM OLD.guest_count
     OR NEW.total_price IS DISTINCT FROM OLD.total_price
     OR NEW.base_amount IS DISTINCT FROM OLD.base_amount
     OR NEW.service_fee IS DISTINCT FROM OLD.service_fee
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Booking terms are immutable after creation.';
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NOT NULL AND NOT is_admin() THEN
    RAISE EXCEPTION 'Booking status changes go through the booking endpoints.';
  END IF;

  -- no_show is only valid once the check-in day has fully passed: the guest
  -- has until the end of check-in day to arrive, so the earliest a host can
  -- declare a no-show is the following day (< CURRENT_DATE, not <=).
  IF (OLD.status = 'awaiting_payment' AND NEW.status IN ('pending', 'cancelled'))
     OR (OLD.status = 'pending' AND NEW.status IN ('confirmed', 'declined', 'cancelled'))
     OR (OLD.status = 'confirmed' AND NEW.status = 'cancelled')
     OR (OLD.status = 'confirmed' AND NEW.status = 'no_show' AND OLD.check_in < CURRENT_DATE) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Booking cannot move from % to %.', OLD.status, NEW.status;
END;
$$;

-- ---- #12  deletion and occupancy agree on what an active tenancy is ----
-- The guard excluded open-ended (NULL end date) leases, so an owner on one
-- could self-delete and leave the tenant with a null-phone, null-email,
-- login-less counterparty while occupancy stayed pinned rented_out. Align it
-- with property_has_active_tenancy: an agreement in force (both parties
-- signed or beyond) with a NULL or future end date blocks deletion; a mere
-- draft does not.
CREATE OR REPLACE FUNCTION delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  caller_role text;
  active_leases integer;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT role INTO caller_role FROM users WHERE id = uid;
  IF caller_role = 'admin' THEN
    RAISE EXCEPTION 'Admin accounts can''t be self-deleted through this flow -- have another admin remove your admin access first.';
  END IF;

  SELECT count(*) INTO active_leases
  FROM rental_agreements
  WHERE (owner_id = uid OR tenant_id = uid)
    AND agreement_status IN ('pending_admin', 'stamped', 'completed')
    AND (lease_end_date IS NULL OR lease_end_date >= CURRENT_DATE);

  IF active_leases > 0 THEN
    RAISE EXCEPTION 'You still have % rental agreement(s) running. End or transfer the tenancy before deleting your account, so the other party isn''t left without a contactable counterparty.', active_leases;
  END IF;

  PERFORM set_config('bhavan.trusted_verification_write', 'true', true);

  UPDATE users SET
    name = 'Deleted User',
    email = 'deleted-' || uid::text || '@deleted.mybhavan.invalid',
    phone = NULL,
    avatar_url = NULL,
    date_of_birth = NULL,
    occupation = NULL,
    emergency_contact = NULL,
    current_flat = NULL,
    move_in_date = NULL,
    aadhaar_last4 = NULL,
    aadhaar_verified_at = NULL,
    aadhaar_verification_status = 'unverified',
    verified_email = false,
    verified_phone = false,
    verified_aadhaar = false,
    deleted_at = now()
  WHERE id = uid;

  UPDATE rental_agreements
  SET tenant_phone = NULL, tenant_email = NULL
  WHERE tenant_id = uid;

  UPDATE rental_agreements
  SET landlord_phone = NULL, landlord_email = NULL
  WHERE owner_id = uid;

  UPDATE listings SET status = 'inactive' WHERE owner_id = uid;

  DELETE FROM saved_listings WHERE user_id = uid;
  DELETE FROM notifications WHERE user_id = uid;
  DELETE FROM notification_preferences WHERE user_id = uid;
  DELETE FROM user_push_tokens WHERE user_id = uid;

  DELETE FROM auth.users WHERE id = uid;
END;
$$;

-- ---- #13  watch the maintenance-escalation job too ----
CREATE OR REPLACE FUNCTION public.check_cron_health_and_alert()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  watched CONSTANT text[] := ARRAY[
    'check-error-rate',
    'purge-unconfirmed-accounts',
    'expire-lapsed-subscriptions',
    'society-renewal-reminders',
    'check-razorpay-webhook-failures',
    'maintenance-escalation'
  ];
  grace   CONSTANT interval[] := ARRAY[
    interval '20 minutes',       -- runs every 5 minutes
    interval '26 hours',         -- runs daily at 03:00
    interval '26 hours',         -- runs daily at 03:30
    interval '26 hours',         -- runs daily at 04:00
    interval '2 hours',          -- runs every 30 minutes
    interval '2 hours 30 minutes' -- runs hourly at :15
  ];
  i int;
  last_ok timestamptz;
  stalled text[] := ARRAY[]::text[];
  oldest timestamptz := now();
  existing_id uuid;
  summary text;
BEGIN
  IF (SELECT count(*) FROM cron.job_run_details
      WHERE start_time > now() - interval '2 days') = 0 THEN
    RETURN;
  END IF;

  FOR i IN 1 .. array_length(watched, 1) LOOP
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = watched[i] AND active) THEN
      CONTINUE;
    END IF;

    SELECT max(d.start_time) INTO last_ok
    FROM cron.job_run_details d
    JOIN cron.job j ON j.jobid = d.jobid
    WHERE j.jobname = watched[i] AND d.status = 'succeeded';

    IF last_ok IS NULL OR last_ok < now() - grace[i] THEN
      stalled := stalled || watched[i];
      oldest := least(oldest, COALESCE(last_ok, now() - grace[i]));
    END IF;
  END LOOP;

  IF array_length(stalled, 1) IS NULL THEN
    RETURN;
  END IF;

  summary := 'Scheduled job(s) not succeeding: ' || array_to_string(stalled, ', ')
             || '. Oldest successful run: ' || to_char(oldest, 'YYYY-MM-DD HH24:MI') || ' UTC.';

  SELECT id INTO existing_id
  FROM error_rate_alerts
  WHERE kind = 'cron_stalled' AND acknowledged_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF existing_id IS NOT NULL THEN
    UPDATE error_rate_alerts
       SET window_end = now(), error_count = array_length(stalled, 1), detail = summary, created_at = now()
     WHERE id = existing_id;
  ELSE
    INSERT INTO error_rate_alerts (kind, window_start, window_end, error_count, threshold_count, detail)
    VALUES ('cron_stalled', oldest, now(), array_length(stalled, 1), 0, summary);
  END IF;
END;
$$;

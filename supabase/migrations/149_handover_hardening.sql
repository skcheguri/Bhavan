-- ============================================================
-- Handover hardening (2026-08-25). DB-layer fixes from the gap-sweep
-- audit (HANDOVER §4.7c). Each block is a re-runnable CREATE OR REPLACE /
-- DROP+CREATE. IDs (GS-n) map to the register.
-- ============================================================

-- ---- GS-1 (CRITICAL): stop self-registration as admin -------------------
-- handle_new_auth_user copied `role` straight from client-controlled
-- raw_user_meta_data; users_role_check allows 'admin' and is_admin() is a
-- pure role lookup, so signUp({data:{role:'admin'}}) on the anon key granted
-- full data-layer admin. Whitelist the role to tenant/owner; admins are only
-- ever created by an existing admin / manual DB action.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    INSERT INTO public.users (id, email, name, role, phone, verified_phone, verified_email)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'name', NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''), 'User'),
        CASE WHEN NEW.raw_user_meta_data->>'role' IN ('tenant', 'owner')
             THEN NEW.raw_user_meta_data->>'role'
             ELSE 'tenant' END,
        NEW.phone,
        NEW.phone_confirmed_at IS NOT NULL,
        NEW.email_confirmed_at IS NOT NULL
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$function$;

-- ---- GS-3 (HIGH): a signed agreement cannot be DELETEd ------------------
-- "Owners can manage own agreements" is FOR ALL and the 141 workflow guard
-- is UPDATE-only, so an owner could DELETE a fully-executed lease via REST,
-- nulling every linked rent_payments.agreement_id. Block non-draft deletes
-- for non-admins.
CREATE OR REPLACE FUNCTION public.enforce_rental_agreement_no_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  IF NOT is_admin() AND OLD.agreement_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'A signed agreement cannot be deleted. Contact support to void it.';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_rental_agreements_no_delete ON rental_agreements;
CREATE TRIGGER trg_rental_agreements_no_delete
  BEFORE DELETE ON rental_agreements
  FOR EACH ROW EXECUTE FUNCTION enforce_rental_agreement_no_delete();

-- ---- GS-4 (HIGH): owner cannot insert rent_payments for any tenant ------
-- The owner-side INSERT policy left tenant_id/agreement_id/amount free, so an
-- owner could fabricate a "paid" row in a stranger's ledger (visible via the
-- tenant SELECT policy). Mirror the 132 tenant-side fix: require a real
-- agreement between this owner and that tenant.
DROP POLICY IF EXISTS "Owners can insert own received rent payments" ON rent_payments;
CREATE POLICY "Owners can insert own received rent payments" ON rent_payments
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    AND status = 'pending'
    AND EXISTS (
      SELECT 1 FROM rental_agreements ra
      WHERE ra.owner_id = auth.uid()
        AND ra.tenant_id = rent_payments.tenant_id
    )
  );

-- ---- GS-5 (HIGH): lock down maintenance functions to service_role -------
-- These SECURITY DEFINER functions mutate billing/notification/escalation/
-- alert state and had no REVOKE, so any anon-key holder could invoke them via
-- /rest/v1/rpc. Cron runs as postgres (superuser) and is unaffected.
REVOKE EXECUTE ON FUNCTION public.check_error_rate_and_alert()      FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.check_error_rate_and_alert()      TO service_role;
REVOKE EXECUTE ON FUNCTION public.check_webhook_failures_and_alert() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.check_webhook_failures_and_alert() TO service_role;
REVOKE EXECUTE ON FUNCTION public.check_cron_health_and_alert()     FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.check_cron_health_and_alert()     TO service_role;
REVOKE EXECUTE ON FUNCTION public.run_maintenance_escalation()      FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.run_maintenance_escalation()      TO service_role;
-- expire_lapsed_subscriptions is redefined + locked in the GS-37 block below.

-- ---- GS-31 (MED): ticket guard must authorize on the SOURCE society -----
-- The early return checked is_community_admin(NEW.community_id), so an admin
-- of the destination society could pull another society's ticket into theirs
-- and rewrite its fields. Authorize on OLD.community_id.
CREATE OR REPLACE FUNCTION public.guard_community_ticket_changes()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR is_admin() OR is_community_admin(OLD.community_id) THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Only a society admin can change a ticket''s status';
  END IF;
  IF NEW.admin_notes IS DISTINCT FROM OLD.admin_notes THEN
    RAISE EXCEPTION 'Only a society admin can add notes to a ticket';
  END IF;
  IF NEW.assigned_vendor_id IS DISTINCT FROM OLD.assigned_vendor_id THEN
    RAISE EXCEPTION 'Only a society admin can assign this to someone';
  END IF;
  IF NEW.vendor_would_use_again IS DISTINCT FROM OLD.vendor_would_use_again THEN
    RAISE EXCEPTION 'Only a society admin can rate the contractor';
  END IF;
  IF NEW.resolved_at IS DISTINCT FROM OLD.resolved_at THEN
    RAISE EXCEPTION 'Only a society admin can resolve a ticket';
  END IF;
  IF NEW.community_id IS DISTINCT FROM OLD.community_id
     OR NEW.raised_by IS DISTINCT FROM OLD.raised_by THEN
    RAISE EXCEPTION 'A ticket cannot be moved to another society or owner';
  END IF;

  RETURN NEW;
END;
$$;

-- ---- GS-32 (MED): confirmed contribution — freeze reference, block delete
-- guard_contribution_changes froze amount/status/identity on a confirmed row
-- but left `reference` (the bank-matching key) editable; and the DELETE policy
-- let an owner delete a reconciled contribution, silently dropping the
-- treasurer's total. Freeze the reference and block the delete.
CREATE OR REPLACE FUNCTION public.guard_contribution_changes()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL
     OR is_admin()
     OR is_community_admin(collection_community(NEW.collection_id)) THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Only a society admin can confirm a payment';
  END IF;
  IF NEW.confirmed_by IS DISTINCT FROM OLD.confirmed_by
     OR NEW.confirmed_at IS DISTINCT FROM OLD.confirmed_at THEN
    RAISE EXCEPTION 'Confirmation is recorded by the admin who checked it';
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.collection_id IS DISTINCT FROM OLD.collection_id THEN
    RAISE EXCEPTION 'A contribution cannot be moved to another owner or collection';
  END IF;

  -- Amount AND the bank-matching reference freeze once an admin has
  -- reconciled the payment.
  IF OLD.status = 'confirmed'
     AND (NEW.amount_rupees IS DISTINCT FROM OLD.amount_rupees
          OR NEW.reference IS DISTINCT FROM OLD.reference) THEN
    RAISE EXCEPTION 'This payment has been confirmed. Ask your admin to change it.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_contribution_delete()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'confirmed'
     AND NOT is_admin()
     AND NOT is_community_admin(collection_community(OLD.collection_id)) THEN
    RAISE EXCEPTION 'A confirmed contribution cannot be deleted. Ask your society admin.';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_contribution_delete ON community_contributions;
CREATE TRIGGER trg_guard_contribution_delete
  BEFORE DELETE ON community_contributions
  FOR EACH ROW EXECUTE FUNCTION guard_contribution_delete();

-- ---- GS-33 (MED): reviews must reference a real agreement --------------
-- The one-per-tenancy unique index is partial (agreement_id IS NOT NULL) and
-- the INSERT policy accepted agreement_id IS NULL, so a reviewer could post
-- unlimited reviews of the same counterparty (and re-fire notify_review) by
-- omitting agreement_id. Require ra.id = reviews.agreement_id.
DROP POLICY IF EXISTS "Reviews require a real tenancy" ON public.reviews;
CREATE POLICY "Reviews require a real tenancy"
  ON public.reviews FOR INSERT
  WITH CHECK (
    reviewer_id = auth.uid()
    AND subject_id IS DISTINCT FROM reviewer_id
    AND EXISTS (
      SELECT 1
      FROM rental_agreements ra
      WHERE
        ra.id = reviews.agreement_id
        AND (
          (ra.owner_id = reviews.reviewer_id
           AND ra.tenant_id = reviews.subject_id
           AND reviews.role = 'owner_on_renter')
          OR
          (ra.tenant_id = reviews.reviewer_id
           AND ra.owner_id = reviews.subject_id
           AND reviews.role = 'renter_on_owner')
        )
    )
  );

-- ---- GS-37 (LOW batch) -------------------------------------------------

-- Duplicate receipts: no UNIQUE on rent_receipts.rent_payment_id (the trigger
-- dedup is a non-atomic IF EXISTS, and the manual owner insert path skips it).
CREATE UNIQUE INDEX IF NOT EXISTS rent_receipts_one_per_payment
  ON rent_receipts (rent_payment_id) WHERE rent_payment_id IS NOT NULL;

-- blocked_between leaked block existence to any authenticated prober. Reveal
-- the real answer only to a party, an admin, or the service role (auth.uid()
-- IS NULL); a third-party prober gets false. Policy calls always involve the
-- caller as a party, so their behaviour is unchanged.
CREATE OR REPLACE FUNCTION public.blocked_between(p_a uuid, p_b uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN auth.uid() IS NOT NULL AND auth.uid() <> p_a AND auth.uid() <> p_b AND NOT is_admin()
      THEN false
    ELSE EXISTS (
      SELECT 1 FROM user_blocks b
      WHERE (b.blocker_id = p_a AND b.blocked_id = p_b)
         OR (b.blocker_id = p_b AND b.blocked_id = p_a)
    )
  END;
$$;

-- poll_closed missing SET search_path (hygiene; SECURITY INVOKER + no tables,
-- so not exploitable, fixed for consistency).
CREATE OR REPLACE FUNCTION public.poll_closed(p_closed_at timestamptz, p_closes_at timestamptz)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT p_closed_at IS NOT NULL
      OR (p_closes_at IS NOT NULL AND p_closes_at <= now());
$$;

-- seed_first_community_admin only fired AFTER UPDATE, so a community inserted
-- already 'active' (service-role import) got no admin and was unadministrable.
-- Also seed on INSERT-into-active.
CREATE OR REPLACE FUNCTION public.seed_first_community_admin()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'active' AND (TG_OP = 'INSERT' OR OLD.status <> 'active') THEN
    INSERT INTO community_members (community_id, user_id, role, status, approved_by, approved_at)
    VALUES (NEW.id, NEW.created_by, 'admin', 'approved', NEW.reviewed_by, now())
    ON CONFLICT (community_id, user_id) DO UPDATE
      SET role = 'admin', status = 'approved', approved_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_first_community_admin ON communities;
CREATE TRIGGER trg_seed_first_community_admin
  AFTER INSERT OR UPDATE ON communities
  FOR EACH ROW EXECUTE FUNCTION seed_first_community_admin();

-- Vacation booking request rules never asserted owner_id against the listing.
-- Defense-in-depth (browser INSERT is revoked), but a bug in the edge function
-- would route payouts/notifications to the wrong account. Assert it.
CREATE OR REPLACE FUNCTION enforce_vacation_booking_request_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active integer;
  v_max_guests integer;
  v_owner uuid;
BEGIN
  IF is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM 'awaiting_payment' OR NEW.payment_status IS DISTINCT FROM 'unpaid' THEN
    RAISE EXCEPTION 'A new booking starts unpaid, awaiting payment.';
  END IF;

  IF NEW.check_in < CURRENT_DATE THEN
    RAISE EXCEPTION 'Check-in cannot be in the past.';
  END IF;

  SELECT l.owner_id, COALESCE(l.max_guests, 4) INTO v_owner, v_max_guests
  FROM listings l WHERE l.id = NEW.listing_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Listing not found.';
  END IF;
  IF NEW.owner_id IS DISTINCT FROM v_owner THEN
    RAISE EXCEPTION 'Booking owner must match the listing owner.';
  END IF;
  IF NEW.owner_id = NEW.tenant_id THEN
    RAISE EXCEPTION 'You cannot book your own listing.';
  END IF;
  IF NEW.guest_count < 1 OR NEW.guest_count > v_max_guests THEN
    RAISE EXCEPTION 'This property hosts between 1 and % guests.', v_max_guests;
  END IF;

  SELECT count(*) INTO v_active FROM vacation_bookings
  WHERE tenant_id = NEW.tenant_id
    AND status IN ('pending', 'confirmed')
    AND check_out >= CURRENT_DATE;
  IF v_active >= 3 THEN
    RAISE EXCEPTION 'You already have 3 upcoming bookings or requests. Cancel one before requesting another stay.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM vacation_bookings
    WHERE tenant_id = NEW.tenant_id
      AND listing_id = NEW.listing_id
      AND status IN ('pending', 'confirmed')
      AND daterange(check_in, check_out) && daterange(NEW.check_in, NEW.check_out)
  ) THEN
    RAISE EXCEPTION 'You already have a request for these dates at this property.';
  END IF;

  PERFORM check_and_record_rate_limit(NEW.tenant_id, NULL, 'vacation_booking', 5, 15);

  RETURN NEW;
END;
$$;

-- expire_lapsed_subscriptions: the stage-3 lapse loop lacked `plan <> 'free'`,
-- so an active free row with a past period-end got flipped to 'expired' and a
-- bogus "Pro plan expired" notice. Add the guard. (Also locks the function to
-- service_role per GS-5.)
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

  FOR r IN
    SELECT owner_id
    FROM owner_subscriptions
    WHERE status = 'active'
      AND plan <> 'free'
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

REVOKE EXECUTE ON FUNCTION public.expire_lapsed_subscriptions() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.expire_lapsed_subscriptions() TO service_role;

-- delete_my_account over-blocked a tenant for the HOST's unsettled payout
-- (the money-in-limbo clause was symmetric). Gate that clause to the owner
-- side; a completed-stay tenant should not be held for a payout they don't
-- control. Reproduces the 147 body with that one change.
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
  active_bookings integer;
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
    AND agreement_status IN ('pending_admin', 'signed', 'stamped', 'completed')
    AND (lease_end_date IS NULL OR lease_end_date >= CURRENT_DATE);

  IF active_leases > 0 THEN
    RAISE EXCEPTION 'You still have % rental agreement(s) running. End or transfer the tenancy before deleting your account, so the other party isn''t left without a contactable counterparty.', active_leases;
  END IF;

  SELECT count(*) INTO active_bookings
  FROM vacation_bookings
  WHERE (owner_id = uid OR tenant_id = uid)
    AND (
      (status IN ('pending', 'confirmed') AND check_out >= CURRENT_DATE)
      OR (owner_id = uid AND payment_status = 'paid' AND payout_status = 'unpaid')
    );

  IF active_bookings > 0 THEN
    RAISE EXCEPTION 'You have % vacation booking(s) that are still active or hold money that hasn''t been settled yet. Cancel or complete them -- and let any host payout clear -- before deleting your account.', active_bookings;
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
  DELETE FROM host_payout_accounts WHERE user_id = uid;

  DELETE FROM auth.users WHERE id = uid;
END;
$$;

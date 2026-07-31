-- ============================================================
-- BASELINE: complete schema of the Bhavan production database.
--
-- Generated 2026-07-31 directly from the live project's system
-- catalogs (pg_get_functiondef / pg_get_constraintdef / pg_policies /
-- pg_get_triggerdef etc.), because the original migrations 002-063
-- could not rebuild a database from scratch: the ~22 core tables only
-- ever existed in a hand-maintained snapshot (bhavan_schema.sql) that
-- had gone stale. Those historical migrations are preserved in
-- supabase/migrations_archive/ for reference; this file supersedes
-- them and the snapshot. Remote migration history was repaired to
-- list only this baseline (supabase migration repair).
--
-- Target: a fresh SUPABASE project (auth/storage/realtime schemas and
-- the anon/authenticated/service_role roles already exist, and
-- Supabase's default privileges grant table access automatically, so
-- no explicit GRANTs are emitted).
--
-- New migrations continue from 064_ upward.
-- ============================================================

SET check_function_bodies = off;

-- ---- Extensions ----

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;


-- ---- Tables ----

CREATE TABLE aadhaar_verification_attempts (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    provider_reference text NOT NULL,
    aadhaar_last4 text NOT NULL,
    status text DEFAULT 'otp_sent'::text NOT NULL,
    failure_reason text,
    requested_at timestamp with time zone DEFAULT now(),
    verified_at timestamp with time zone
);

CREATE TABLE audit_logs (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    user_id uuid,
    action text NOT NULL,
    table_name text,
    record_id uuid,
    before jsonb,
    after jsonb,
    ip_address text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE billing_history (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    owner_id uuid NOT NULL,
    subscription_id uuid,
    invoice_number text NOT NULL,
    plan text NOT NULL,
    amount integer NOT NULL,
    gst_amount integer DEFAULT 0,
    total_amount integer NOT NULL,
    currency text DEFAULT 'INR'::text,
    status text DEFAULT 'pending'::text,
    razorpay_payment_id text,
    razorpay_invoice_id text,
    billing_period_start date,
    billing_period_end date,
    paid_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    razorpay_order_id text
);

CREATE TABLE broker_reports (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    owner_id uuid NOT NULL,
    listing_id uuid,
    reason text NOT NULL,
    reason_text text,
    created_at timestamp with time zone DEFAULT now(),
    status text DEFAULT 'pending'::text,
    admin_note text,
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE chat_messages (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    request_id uuid NOT NULL,
    sender text NOT NULL,
    text text NOT NULL,
    read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE client_error_logs (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    message text NOT NULL,
    stack text,
    component_stack text,
    source text NOT NULL,
    url text,
    user_agent text,
    user_id uuid,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE community_comments (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    post_id uuid NOT NULL,
    author_id uuid NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE community_post_reports (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    post_id uuid NOT NULL,
    reporter_id uuid NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE community_posts (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    author_id uuid NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    category text DEFAULT 'general'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    hidden boolean DEFAULT false
);

CREATE TABLE connection_requests (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    listing_id uuid NOT NULL,
    owner_id uuid NOT NULL,
    message text,
    status text DEFAULT 'pending'::text,
    move_in_date text,
    occupation text,
    scanned_via_qr boolean DEFAULT false,
    listing_title text,
    listing_location text,
    listing_price integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    responded_at timestamp with time zone
);

CREATE TABLE contact_attempts (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    user_id uuid,
    device_fingerprint text NOT NULL,
    ip_address text,
    listing_id uuid,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE contact_inquiries (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    subject text NOT NULL,
    message text NOT NULL,
    status text DEFAULT 'new'::text NOT NULL,
    admin_notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    device_fingerprint text
);

CREATE TABLE documents (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    file_url text,
    status text DEFAULT 'pending'::text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE error_alert_settings (
    id boolean DEFAULT true NOT NULL,
    threshold_count integer DEFAULT 10 NOT NULL,
    window_minutes integer DEFAULT 15 NOT NULL,
    webhook_url text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid
);

CREATE TABLE error_rate_alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    window_start timestamp with time zone NOT NULL,
    window_end timestamp with time zone NOT NULL,
    error_count integer NOT NULL,
    threshold_count integer NOT NULL,
    webhook_notified boolean DEFAULT false NOT NULL,
    webhook_error text,
    acknowledged_at timestamp with time zone,
    acknowledged_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE listing_reports (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    listing_id uuid NOT NULL,
    reporter_id uuid NOT NULL,
    reason text NOT NULL,
    reason_text text,
    status text DEFAULT 'pending'::text NOT NULL,
    admin_note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_at timestamp with time zone
);

CREATE TABLE listings (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    property_id uuid,
    owner_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    price integer NOT NULL,
    deposit integer DEFAULT 0,
    maintenance_charge integer DEFAULT 0,
    location text,
    city text,
    bedrooms integer,
    bathrooms integer,
    area_sqft integer,
    furnished boolean DEFAULT false,
    property_type text,
    images text[] DEFAULT '{}'::text[],
    amenities text[] DEFAULT '{}'::text[],
    status text DEFAULT 'draft'::text,
    verified boolean DEFAULT false,
    views_count integer DEFAULT 0,
    inquiries_count integer DEFAULT 0,
    saves_count integer DEFAULT 0,
    category text DEFAULT 'residential'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    parking text DEFAULT 'none'::text,
    nearby_places jsonb DEFAULT '[]'::jsonb,
    state text,
    latitude double precision,
    longitude double precision
);

CREATE TABLE maintenance_requests (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    property_id uuid,
    category text NOT NULL,
    description text NOT NULL,
    priority text DEFAULT 'medium'::text,
    status text DEFAULT 'pending'::text,
    images text[] DEFAULT '{}'::text[],
    landlord_notes text,
    title text,
    unit text,
    preferred_time text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    resolved_at timestamp with time zone,
    agreement_id uuid,
    owner_id uuid
);

CREATE TABLE notification_preferences (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    category text NOT NULL,
    push_enabled boolean DEFAULT true,
    sms_enabled boolean DEFAULT false,
    email_enabled boolean DEFAULT true,
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE notifications (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    read boolean DEFAULT false,
    push_delivered boolean DEFAULT false,
    sms_delivered boolean DEFAULT false,
    email_delivered boolean DEFAULT false,
    read_at timestamp with time zone,
    action_url text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE owner_subscriptions (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    owner_id uuid NOT NULL,
    plan text DEFAULT 'free'::text,
    status text DEFAULT 'trial'::text,
    razorpay_subscription_id text,
    razorpay_customer_id text,
    current_period_start timestamp with time zone,
    current_period_end timestamp with time zone,
    trial_ends_at timestamp with time zone,
    cancel_at_period_end boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE properties (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    owner_id uuid NOT NULL,
    name text NOT NULL,
    address text NOT NULL,
    city text,
    total_units integer DEFAULT 0,
    occupied_units integer DEFAULT 0,
    monthly_income integer DEFAULT 0,
    verification_doc_url text,
    verified boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    verification_rejection_reason text,
    verification_reviewed_at timestamp with time zone,
    state text
);

CREATE TABLE property_visits (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    owner_id uuid NOT NULL,
    listing_id uuid NOT NULL,
    visit_date date NOT NULL,
    visit_time text NOT NULL,
    visitor_name text NOT NULL,
    visitor_phone text NOT NULL,
    visitor_email text NOT NULL,
    note text,
    status text DEFAULT 'requested'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE purged_unconfirmed_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    original_user_id uuid NOT NULL,
    email text,
    phone text,
    name text,
    role text,
    account_created_at timestamp with time zone,
    purged_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE qr_analytics (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    listing_id uuid NOT NULL,
    scan_date date NOT NULL,
    scans_count integer DEFAULT 0,
    messages_sent integer DEFAULT 0
);

CREATE TABLE rate_limit_events (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    actor uuid,
    device_fingerprint text,
    action text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE rent_payments (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    property_id uuid,
    property_unit_id uuid,
    owner_id uuid NOT NULL,
    amount integer NOT NULL,
    month text NOT NULL,
    payment_mode text NOT NULL,
    transaction_ref text,
    status text DEFAULT 'pending'::text,
    razorpay_payment_id text,
    failure_reason text,
    receipt_url text,
    reconciled_at timestamp with time zone,
    reconciliation_note text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    razorpay_order_id text,
    agreement_id uuid
);

CREATE TABLE rent_receipts (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    receipt_number text NOT NULL,
    owner_id uuid NOT NULL,
    tenant_id uuid,
    rent_payment_id uuid,
    landlord_name text NOT NULL,
    landlord_pan text,
    landlord_address text,
    tenant_name text NOT NULL,
    tenant_pan text,
    property_address text,
    period_from date,
    period_to date,
    rent_amount integer NOT NULL,
    payment_mode text,
    transaction_ref text,
    payment_date date,
    includes_maintenance boolean DEFAULT false,
    maintenance_amount integer DEFAULT 0,
    notes text,
    sent_to_tenant boolean DEFAULT false,
    sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    listing_id uuid
);

CREATE TABLE rental_agreements (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    agreement_number text NOT NULL,
    owner_id uuid NOT NULL,
    tenant_id uuid,
    unit_id uuid,
    tenant_name text NOT NULL,
    tenant_address text,
    tenant_phone text,
    tenant_email text,
    tenant_pan text,
    tenant_aadhaar_masked text,
    landlord_name text NOT NULL,
    landlord_address text,
    landlord_phone text,
    landlord_email text,
    landlord_pan text,
    property_address text,
    property_description text,
    flat_number text,
    carpet_area integer,
    lease_start_date date,
    lease_end_date date,
    monthly_rent integer,
    security_deposit integer,
    rent_due_day integer,
    payment_mode text,
    maintenance_amount integer,
    notice_period_days integer,
    lock_in_months integer,
    renewal_clause text,
    signed_by_landlord boolean DEFAULT false,
    signed_by_tenant boolean DEFAULT false,
    shared_with_tenant boolean DEFAULT false,
    shared_at timestamp with time zone,
    witness1_name text,
    witness1_address text,
    witness2_name text,
    witness2_address text,
    created_at timestamp with time zone DEFAULT now(),
    clauses text[] DEFAULT '{}'::text[],
    listing_id uuid
);

CREATE TABLE reviews (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    reviewer_id uuid NOT NULL,
    subject_id uuid NOT NULL,
    listing_id uuid,
    role text NOT NULL,
    property_name text,
    location text,
    tenancy_period text,
    overall_rating integer NOT NULL,
    answers jsonb DEFAULT '[]'::jsonb,
    comment text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE saved_listings (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    listing_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE soft_block_states (
    tenant_id uuid NOT NULL,
    active boolean DEFAULT false,
    triggered_at timestamp with time zone,
    aadhaar_re_verified boolean DEFAULT false,
    additional_details_provided boolean DEFAULT false,
    details jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE subscription_features (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    owner_id uuid NOT NULL,
    feature_key text NOT NULL,
    enabled boolean DEFAULT false,
    source text DEFAULT 'plan'::text,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE units (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    property_id uuid NOT NULL,
    unit_number text NOT NULL,
    rent_amount integer DEFAULT 0,
    maintenance_charge integer DEFAULT 0,
    status text DEFAULT 'vacant'::text,
    tenant_id uuid,
    tenant_name text,
    lease_start date,
    lease_end date,
    agreement_generated boolean DEFAULT false,
    last_payment_status text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE upi_mandates (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    owner_id uuid NOT NULL,
    property_id uuid NOT NULL,
    upi_id text NOT NULL,
    bank_account text,
    mandate_amount integer NOT NULL,
    frequency text DEFAULT 'monthly'::text,
    start_date date,
    end_date date,
    status text DEFAULT 'active'::text,
    razorpay_token text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE user_push_tokens (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    user_id uuid NOT NULL,
    fcm_token text NOT NULL,
    device_name text,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

CREATE TABLE users (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    email text,
    name text,
    role text DEFAULT 'tenant'::text,
    phone text,
    verified_email boolean DEFAULT false,
    verified_phone boolean DEFAULT false,
    verified_aadhaar boolean DEFAULT false,
    avatar_url text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    aadhaar_last4 text,
    aadhaar_verified_at timestamp with time zone,
    date_of_birth date,
    occupation text,
    emergency_contact text,
    move_in_date date,
    current_flat text,
    aadhaar_verification_status text DEFAULT 'unverified'::text,
    suspended boolean DEFAULT false NOT NULL,
    suspended_reason text,
    suspended_at timestamp with time zone
);

CREATE TABLE vacation_bookings (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    listing_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    owner_id uuid NOT NULL,
    check_in date NOT NULL,
    check_out date NOT NULL,
    guest_count integer DEFAULT 1 NOT NULL,
    total_price integer NOT NULL,
    status text DEFAULT 'pending'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


-- ---- Primary keys & unique constraints ----

ALTER TABLE aadhaar_verification_attempts ADD CONSTRAINT aadhaar_verification_attempts_pkey PRIMARY KEY (id);
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);
ALTER TABLE billing_history ADD CONSTRAINT billing_history_invoice_number_key UNIQUE (invoice_number);
ALTER TABLE billing_history ADD CONSTRAINT billing_history_pkey PRIMARY KEY (id);
ALTER TABLE broker_reports ADD CONSTRAINT broker_reports_pkey PRIMARY KEY (id);
ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);
ALTER TABLE client_error_logs ADD CONSTRAINT client_error_logs_pkey PRIMARY KEY (id);
ALTER TABLE community_comments ADD CONSTRAINT community_comments_pkey PRIMARY KEY (id);
ALTER TABLE community_post_reports ADD CONSTRAINT community_post_reports_pkey PRIMARY KEY (id);
ALTER TABLE community_post_reports ADD CONSTRAINT community_post_reports_post_id_reporter_id_key UNIQUE (post_id, reporter_id);
ALTER TABLE community_posts ADD CONSTRAINT community_posts_pkey PRIMARY KEY (id);
ALTER TABLE connection_requests ADD CONSTRAINT connection_requests_pkey PRIMARY KEY (id);
ALTER TABLE contact_attempts ADD CONSTRAINT contact_attempts_pkey PRIMARY KEY (id);
ALTER TABLE contact_inquiries ADD CONSTRAINT contact_inquiries_pkey PRIMARY KEY (id);
ALTER TABLE documents ADD CONSTRAINT documents_pkey PRIMARY KEY (id);
ALTER TABLE error_alert_settings ADD CONSTRAINT error_alert_settings_pkey PRIMARY KEY (id);
ALTER TABLE error_rate_alerts ADD CONSTRAINT error_rate_alerts_pkey PRIMARY KEY (id);
ALTER TABLE listing_reports ADD CONSTRAINT listing_reports_pkey PRIMARY KEY (id);
ALTER TABLE listings ADD CONSTRAINT listings_pkey PRIMARY KEY (id);
ALTER TABLE maintenance_requests ADD CONSTRAINT maintenance_requests_pkey PRIMARY KEY (id);
ALTER TABLE notification_preferences ADD CONSTRAINT notification_preferences_pkey PRIMARY KEY (id);
ALTER TABLE notification_preferences ADD CONSTRAINT notification_preferences_user_id_category_key UNIQUE (user_id, category);
ALTER TABLE notifications ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);
ALTER TABLE owner_subscriptions ADD CONSTRAINT owner_subscriptions_pkey PRIMARY KEY (id);
ALTER TABLE properties ADD CONSTRAINT properties_pkey PRIMARY KEY (id);
ALTER TABLE property_visits ADD CONSTRAINT property_visits_pkey PRIMARY KEY (id);
ALTER TABLE purged_unconfirmed_accounts ADD CONSTRAINT purged_unconfirmed_accounts_pkey PRIMARY KEY (id);
ALTER TABLE qr_analytics ADD CONSTRAINT qr_analytics_listing_id_scan_date_key UNIQUE (listing_id, scan_date);
ALTER TABLE qr_analytics ADD CONSTRAINT qr_analytics_pkey PRIMARY KEY (id);
ALTER TABLE rate_limit_events ADD CONSTRAINT rate_limit_events_pkey PRIMARY KEY (id);
ALTER TABLE rent_payments ADD CONSTRAINT rent_payments_pkey PRIMARY KEY (id);
ALTER TABLE rent_receipts ADD CONSTRAINT rent_receipts_pkey PRIMARY KEY (id);
ALTER TABLE rent_receipts ADD CONSTRAINT rent_receipts_receipt_number_key UNIQUE (receipt_number);
ALTER TABLE rental_agreements ADD CONSTRAINT rental_agreements_agreement_number_key UNIQUE (agreement_number);
ALTER TABLE rental_agreements ADD CONSTRAINT rental_agreements_pkey PRIMARY KEY (id);
ALTER TABLE reviews ADD CONSTRAINT reviews_pkey PRIMARY KEY (id);
ALTER TABLE saved_listings ADD CONSTRAINT saved_listings_pkey PRIMARY KEY (id);
ALTER TABLE saved_listings ADD CONSTRAINT saved_listings_user_id_listing_id_key UNIQUE (user_id, listing_id);
ALTER TABLE soft_block_states ADD CONSTRAINT soft_block_states_pkey PRIMARY KEY (tenant_id);
ALTER TABLE subscription_features ADD CONSTRAINT subscription_features_pkey PRIMARY KEY (id);
ALTER TABLE units ADD CONSTRAINT units_pkey PRIMARY KEY (id);
ALTER TABLE upi_mandates ADD CONSTRAINT upi_mandates_pkey PRIMARY KEY (id);
ALTER TABLE user_push_tokens ADD CONSTRAINT user_push_tokens_pkey PRIMARY KEY (id);
ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email);
ALTER TABLE users ADD CONSTRAINT users_pkey PRIMARY KEY (id);
ALTER TABLE vacation_bookings ADD CONSTRAINT vacation_bookings_pkey PRIMARY KEY (id);


-- ---- Check constraints ----

ALTER TABLE aadhaar_verification_attempts ADD CONSTRAINT aadhaar_verification_attempts_status_check CHECK ((status = ANY (ARRAY['otp_sent'::text, 'verified'::text, 'failed'::text, 'expired'::text])));
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_action_check CHECK ((action = ANY (ARRAY['create'::text, 'update'::text, 'delete'::text, 'login'::text, 'logout'::text, 'report'::text, 'block'::text, 'verify'::text, 'payment'::text])));
ALTER TABLE billing_history ADD CONSTRAINT billing_history_plan_check CHECK ((plan = ANY (ARRAY['free'::text, 'pro_monthly'::text, 'pro_annual'::text])));
ALTER TABLE billing_history ADD CONSTRAINT billing_history_status_check CHECK ((status = ANY (ARRAY['paid'::text, 'failed'::text, 'refunded'::text, 'pending'::text])));
ALTER TABLE broker_reports ADD CONSTRAINT broker_reports_reason_check CHECK ((reason = ANY (ARRAY['broker_agent'::text, 'asked_commission'::text, 'shared_competing_listing'::text, 'refused_identity'::text, 'other'::text])));
ALTER TABLE broker_reports ADD CONSTRAINT broker_reports_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'reviewed'::text, 'resolved'::text, 'dismissed'::text])));
ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_sender_check CHECK ((sender = ANY (ARRAY['tenant'::text, 'landlord'::text])));
ALTER TABLE client_error_logs ADD CONSTRAINT client_error_logs_source_check CHECK ((source = ANY (ARRAY['error_boundary'::text, 'window_error'::text, 'unhandled_rejection'::text])));
ALTER TABLE community_posts ADD CONSTRAINT community_posts_category_check CHECK ((category = ANY (ARRAY['discussion'::text, 'advice'::text, 'review'::text, 'event'::text, 'general'::text])));
ALTER TABLE connection_requests ADD CONSTRAINT connection_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'declined'::text])));
ALTER TABLE contact_inquiries ADD CONSTRAINT contact_inquiries_status_check CHECK ((status = ANY (ARRAY['new'::text, 'in_progress'::text, 'resolved'::text])));
ALTER TABLE documents ADD CONSTRAINT documents_status_check CHECK ((status = ANY (ARRAY['active'::text, 'verified'::text, 'pending'::text, 'expired'::text])));
ALTER TABLE documents ADD CONSTRAINT documents_type_check CHECK ((type = ANY (ARRAY['agreement'::text, 'aadhaar'::text, 'receipt'::text, 'checklist'::text, 'utility_bill'::text, 'other'::text])));
ALTER TABLE error_alert_settings ADD CONSTRAINT error_alert_settings_singleton CHECK ((id = true));
ALTER TABLE listings ADD CONSTRAINT listings_parking_check CHECK ((parking = ANY (ARRAY['none'::text, '2-wheeler'::text, '4-wheeler'::text, 'both'::text])));
ALTER TABLE listings ADD CONSTRAINT listings_property_type_check CHECK ((property_type = ANY (ARRAY['apartment'::text, 'house'::text, 'room'::text, 'villa'::text, 'cottage'::text, 'houseboat'::text, 'treehouse'::text, 'farmhouse'::text, 'beach-house'::text])));
ALTER TABLE listings ADD CONSTRAINT listings_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'draft'::text])));
ALTER TABLE maintenance_requests ADD CONSTRAINT maintenance_requests_category_check CHECK ((category = ANY (ARRAY['plumbing'::text, 'electrical'::text, 'water'::text, 'elevator'::text, 'carpentry'::text, 'painting'::text, 'ac'::text, 'security'::text, 'housekeeping'::text, 'other'::text])));
ALTER TABLE maintenance_requests ADD CONSTRAINT maintenance_requests_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'urgent'::text])));
ALTER TABLE maintenance_requests ADD CONSTRAINT maintenance_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'acknowledged'::text, 'in_progress'::text, 'resolved'::text])));
ALTER TABLE notification_preferences ADD CONSTRAINT notification_preferences_category_check CHECK ((category = ANY (ARRAY['maintenance'::text, 'inquiries'::text, 'payments'::text, 'lease'::text, 'community'::text, 'platform'::text])));
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK ((type = ANY (ARRAY['maintenance'::text, 'inquiry'::text, 'lease'::text, 'payment'::text, 'platform'::text])));
ALTER TABLE owner_subscriptions ADD CONSTRAINT owner_subscriptions_plan_check CHECK ((plan = ANY (ARRAY['free'::text, 'pro_monthly'::text, 'pro_annual'::text])));
ALTER TABLE owner_subscriptions ADD CONSTRAINT owner_subscriptions_status_check CHECK ((status = ANY (ARRAY['trial'::text, 'active'::text, 'past_due'::text, 'cancelled'::text, 'expired'::text])));
ALTER TABLE property_visits ADD CONSTRAINT property_visits_status_check CHECK ((status = ANY (ARRAY['requested'::text, 'confirmed'::text, 'cancelled'::text, 'completed'::text])));
ALTER TABLE rent_payments ADD CONSTRAINT rent_payments_payment_mode_check CHECK ((payment_mode = ANY (ARRAY['upi_autopay'::text, 'razorpay'::text, 'cash'::text])));
ALTER TABLE rent_payments ADD CONSTRAINT rent_payments_status_check CHECK ((status = ANY (ARRAY['paid'::text, 'pending'::text, 'failed'::text, 'refunded'::text, 'reconciled'::text])));
ALTER TABLE rent_receipts ADD CONSTRAINT rent_receipts_payment_mode_check CHECK ((payment_mode = ANY (ARRAY['cash'::text, 'cheque'::text, 'upi'::text, 'bank_transfer'::text, 'card'::text])));
ALTER TABLE reviews ADD CONSTRAINT reviews_overall_rating_check CHECK (((overall_rating >= 1) AND (overall_rating <= 5)));
ALTER TABLE reviews ADD CONSTRAINT reviews_role_check CHECK ((role = ANY (ARRAY['owner_on_renter'::text, 'renter_on_owner'::text])));
ALTER TABLE subscription_features ADD CONSTRAINT subscription_features_source_check CHECK ((source = ANY (ARRAY['plan'::text, 'addon'::text, 'trial'::text])));
ALTER TABLE units ADD CONSTRAINT units_last_payment_status_check CHECK ((last_payment_status = ANY (ARRAY['paid'::text, 'pending'::text, 'failed'::text, 'overdue'::text])));
ALTER TABLE units ADD CONSTRAINT units_status_check CHECK ((status = ANY (ARRAY['vacant'::text, 'occupied'::text, 'under_maintenance'::text])));
ALTER TABLE upi_mandates ADD CONSTRAINT upi_mandates_status_check CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'cancelled'::text, 'expired'::text])));
ALTER TABLE users ADD CONSTRAINT users_aadhaar_verification_status_check CHECK ((aadhaar_verification_status = ANY (ARRAY['unverified'::text, 'pending'::text, 'verified'::text, 'failed'::text])));
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK ((role = ANY (ARRAY['tenant'::text, 'owner'::text, 'admin'::text])));
ALTER TABLE vacation_bookings ADD CONSTRAINT vacation_bookings_check CHECK ((check_out > check_in));
ALTER TABLE vacation_bookings ADD CONSTRAINT vacation_bookings_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'declined'::text, 'cancelled'::text])));


-- ---- Foreign keys ----

ALTER TABLE aadhaar_verification_attempts ADD CONSTRAINT aadhaar_verification_attempts_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE billing_history ADD CONSTRAINT billing_history_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE billing_history ADD CONSTRAINT billing_history_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES owner_subscriptions(id) ON DELETE SET NULL;
ALTER TABLE broker_reports ADD CONSTRAINT broker_reports_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE SET NULL;
ALTER TABLE broker_reports ADD CONSTRAINT broker_reports_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE broker_reports ADD CONSTRAINT broker_reports_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_request_id_fkey FOREIGN KEY (request_id) REFERENCES connection_requests(id) ON DELETE CASCADE;
ALTER TABLE client_error_logs ADD CONSTRAINT client_error_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE community_comments ADD CONSTRAINT community_comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE community_comments ADD CONSTRAINT community_comments_post_id_fkey FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE;
ALTER TABLE community_post_reports ADD CONSTRAINT community_post_reports_post_id_fkey FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE;
ALTER TABLE community_post_reports ADD CONSTRAINT community_post_reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE community_posts ADD CONSTRAINT community_posts_author_id_fkey FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE connection_requests ADD CONSTRAINT connection_requests_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE;
ALTER TABLE connection_requests ADD CONSTRAINT connection_requests_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE connection_requests ADD CONSTRAINT connection_requests_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE contact_attempts ADD CONSTRAINT contact_attempts_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE SET NULL;
ALTER TABLE contact_attempts ADD CONSTRAINT contact_attempts_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE documents ADD CONSTRAINT documents_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE error_alert_settings ADD CONSTRAINT error_alert_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE error_rate_alerts ADD CONSTRAINT error_rate_alerts_acknowledged_by_fkey FOREIGN KEY (acknowledged_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE listing_reports ADD CONSTRAINT listing_reports_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE;
ALTER TABLE listing_reports ADD CONSTRAINT listing_reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE listings ADD CONSTRAINT listings_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE listings ADD CONSTRAINT listings_property_id_fkey FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE SET NULL;
ALTER TABLE maintenance_requests ADD CONSTRAINT maintenance_requests_agreement_id_fkey FOREIGN KEY (agreement_id) REFERENCES rental_agreements(id) ON DELETE SET NULL;
ALTER TABLE maintenance_requests ADD CONSTRAINT maintenance_requests_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES users(id);
ALTER TABLE maintenance_requests ADD CONSTRAINT maintenance_requests_property_id_fkey FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;
ALTER TABLE maintenance_requests ADD CONSTRAINT maintenance_requests_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE notification_preferences ADD CONSTRAINT notification_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE notifications ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE owner_subscriptions ADD CONSTRAINT owner_subscriptions_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE properties ADD CONSTRAINT properties_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE property_visits ADD CONSTRAINT property_visits_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE;
ALTER TABLE property_visits ADD CONSTRAINT property_visits_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE property_visits ADD CONSTRAINT property_visits_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE qr_analytics ADD CONSTRAINT qr_analytics_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE;
ALTER TABLE rent_payments ADD CONSTRAINT rent_payments_agreement_id_fkey FOREIGN KEY (agreement_id) REFERENCES rental_agreements(id) ON DELETE SET NULL;
ALTER TABLE rent_payments ADD CONSTRAINT rent_payments_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE rent_payments ADD CONSTRAINT rent_payments_property_id_fkey FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;
ALTER TABLE rent_payments ADD CONSTRAINT rent_payments_property_unit_id_fkey FOREIGN KEY (property_unit_id) REFERENCES units(id) ON DELETE SET NULL;
ALTER TABLE rent_payments ADD CONSTRAINT rent_payments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE rent_receipts ADD CONSTRAINT rent_receipts_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE SET NULL;
ALTER TABLE rent_receipts ADD CONSTRAINT rent_receipts_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE rent_receipts ADD CONSTRAINT rent_receipts_rent_payment_id_fkey FOREIGN KEY (rent_payment_id) REFERENCES rent_payments(id) ON DELETE SET NULL;
ALTER TABLE rent_receipts ADD CONSTRAINT rent_receipts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE rental_agreements ADD CONSTRAINT rental_agreements_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE SET NULL;
ALTER TABLE rental_agreements ADD CONSTRAINT rental_agreements_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE rental_agreements ADD CONSTRAINT rental_agreements_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE rental_agreements ADD CONSTRAINT rental_agreements_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE SET NULL;
ALTER TABLE reviews ADD CONSTRAINT reviews_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE SET NULL;
ALTER TABLE reviews ADD CONSTRAINT reviews_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE reviews ADD CONSTRAINT reviews_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE saved_listings ADD CONSTRAINT saved_listings_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE;
ALTER TABLE saved_listings ADD CONSTRAINT saved_listings_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE soft_block_states ADD CONSTRAINT soft_block_states_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE subscription_features ADD CONSTRAINT subscription_features_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE units ADD CONSTRAINT units_property_id_fkey FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;
ALTER TABLE units ADD CONSTRAINT units_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE upi_mandates ADD CONSTRAINT upi_mandates_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE upi_mandates ADD CONSTRAINT upi_mandates_property_id_fkey FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE;
ALTER TABLE upi_mandates ADD CONSTRAINT upi_mandates_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE user_push_tokens ADD CONSTRAINT user_push_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE vacation_bookings ADD CONSTRAINT vacation_bookings_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE;
ALTER TABLE vacation_bookings ADD CONSTRAINT vacation_bookings_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE vacation_bookings ADD CONSTRAINT vacation_bookings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES users(id) ON DELETE CASCADE;


-- ---- Functions ----

CREATE OR REPLACE FUNCTION public.admin_get_user(target_id uuid)
 RETURNS TABLE(id uuid, name text, email text, phone text, role text, verified_email boolean, verified_phone boolean, verified_aadhaar boolean, suspended boolean, suspended_reason text, suspended_at timestamp with time zone, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT u.id, u.name, u.email, u.phone, u.role,
         u.verified_email, u.verified_phone, u.verified_aadhaar,
         u.suspended, u.suspended_reason, u.suspended_at, u.created_at
  FROM users u
  WHERE u.id = target_id AND is_admin();
$function$
;

CREATE OR REPLACE FUNCTION public.admin_list_users(search_query text DEFAULT NULL::text, result_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, name text, email text, phone text, role text, verified_email boolean, verified_phone boolean, verified_aadhaar boolean, suspended boolean, suspended_reason text, suspended_at timestamp with time zone, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT u.id, u.name, u.email, u.phone, u.role,
         u.verified_email, u.verified_phone, u.verified_aadhaar,
         u.suspended, u.suspended_reason, u.suspended_at, u.created_at
  FROM users u
  WHERE is_admin()
    AND (
      search_query IS NULL OR search_query = ''
      OR u.name ILIKE '%' || search_query || '%'
      OR u.email ILIKE '%' || search_query || '%'
      OR u.phone ILIKE '%' || search_query || '%'
    )
  ORDER BY u.created_at DESC
  LIMIT result_limit;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_user_stats()
 RETURNS TABLE(total_users bigint, total_tenants bigint, total_owners bigint, total_admins bigint, suspended_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    count(*) FILTER (WHERE is_admin()),
    count(*) FILTER (WHERE is_admin() AND role = 'tenant'),
    count(*) FILTER (WHERE is_admin() AND role = 'owner'),
    count(*) FILTER (WHERE is_admin() AND role = 'admin'),
    count(*) FILTER (WHERE is_admin() AND suspended)
  FROM users;
$function$
;

CREATE OR REPLACE FUNCTION public.cascade_property_verification_to_listings()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.verified IS DISTINCT FROM OLD.verified THEN
    UPDATE listings SET verified = NEW.verified WHERE property_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_and_record_rate_limit(p_actor uuid, p_device_fingerprint text, p_action text, p_max_daily integer, p_max_weekly integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    daily_count INT;
    weekly_count INT;
BEGIN
    IF p_actor IS NULL AND p_device_fingerprint IS NULL THEN
        RETURN;
    END IF;

    SELECT COUNT(*) INTO daily_count FROM rate_limit_events
    WHERE action = p_action AND created_at > now() - interval '1 day'
      AND ((p_actor IS NOT NULL AND actor = p_actor) OR (p_actor IS NULL AND device_fingerprint = p_device_fingerprint));

    IF daily_count >= p_max_daily THEN
        RAISE EXCEPTION 'You have reached the daily limit for this action. Please try again tomorrow.' USING ERRCODE = 'P0001';
    END IF;

    SELECT COUNT(*) INTO weekly_count FROM rate_limit_events
    WHERE action = p_action AND created_at > now() - interval '7 days'
      AND ((p_actor IS NOT NULL AND actor = p_actor) OR (p_actor IS NULL AND device_fingerprint = p_device_fingerprint));

    IF weekly_count >= p_max_weekly THEN
        RAISE EXCEPTION 'You have reached the weekly limit for this action. Please try again next week.' USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO rate_limit_events (actor, device_fingerprint, action) VALUES (p_actor, p_device_fingerprint, p_action);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.check_error_rate_and_alert()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  settings error_alert_settings;
  recent_count integer;
  window_start_ts timestamptz;
  existing_alert error_rate_alerts;
  alert_id uuid;
  request_id bigint;
BEGIN
  SELECT * INTO settings FROM error_alert_settings WHERE id = true;
  IF settings IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO existing_alert
  FROM error_rate_alerts
  WHERE acknowledged_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  -- Still fresh: the admin has an up-to-date banner already.
  IF existing_alert.id IS NOT NULL AND existing_alert.window_end > now() - interval '24 hours' THEN
    RETURN NULL;
  END IF;

  window_start_ts := now() - (settings.window_minutes || ' minutes')::interval;

  SELECT count(*) INTO recent_count
  FROM client_error_logs
  WHERE created_at >= window_start_ts;

  IF recent_count < settings.threshold_count THEN
    RETURN NULL;
  END IF;

  IF existing_alert.id IS NOT NULL THEN
    UPDATE error_rate_alerts
    SET window_start = window_start_ts,
        window_end = now(),
        error_count = recent_count,
        threshold_count = settings.threshold_count,
        webhook_notified = false,
        webhook_error = NULL
    WHERE id = existing_alert.id;
    alert_id := existing_alert.id;
  ELSE
    INSERT INTO error_rate_alerts (window_start, window_end, error_count, threshold_count)
    VALUES (window_start_ts, now(), recent_count, settings.threshold_count)
    RETURNING id INTO alert_id;
  END IF;

  IF settings.webhook_url IS NOT NULL THEN
    BEGIN
      SELECT net.http_post(
        url := settings.webhook_url,
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := jsonb_build_object(
          'text', format('Bhavan: %s client errors in the last %s minutes (threshold %s)', recent_count, settings.window_minutes, settings.threshold_count)
        )
      ) INTO request_id;
      UPDATE error_rate_alerts SET webhook_notified = true WHERE id = alert_id;
    EXCEPTION WHEN OTHERS THEN
      -- A bad/unreachable webhook URL must never stop the alert itself
      -- from being recorded -- the admin UI is the alert of record.
      UPDATE error_rate_alerts SET webhook_error = SQLERRM WHERE id = alert_id;
    END;
  END IF;

  RETURN alert_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_community_post_no_self_unhide()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF NOT is_admin() AND OLD.hidden = true AND NEW.hidden = false THEN
        RAISE EXCEPTION 'Only an admin can unhide a moderated post.';
    END IF;
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_community_post_rate_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF NOT is_admin() THEN
        PERFORM check_and_record_rate_limit(NEW.author_id, NULL, 'community_post', 5, 15);
    END IF;
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_connection_request_immutable_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF NOT is_admin() THEN
        IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
            OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
            OR NEW.listing_id IS DISTINCT FROM OLD.listing_id
            OR NEW.message IS DISTINCT FROM OLD.message
            OR NEW.move_in_date IS DISTINCT FROM OLD.move_in_date
            OR NEW.occupation IS DISTINCT FROM OLD.occupation
            OR NEW.scanned_via_qr IS DISTINCT FROM OLD.scanned_via_qr
            OR NEW.listing_title IS DISTINCT FROM OLD.listing_title
            OR NEW.listing_location IS DISTINCT FROM OLD.listing_location
            OR NEW.listing_price IS DISTINCT FROM OLD.listing_price
            OR NEW.created_at IS DISTINCT FROM OLD.created_at
        THEN
            RAISE EXCEPTION 'Only status and responded_at may be changed on a connection request.';
        END IF;
    END IF;
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_contact_inquiry_rate_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF auth.uid() IS NULL AND NEW.device_fingerprint IS NULL THEN
        PERFORM check_and_record_rate_limit(NULL, 'no-fingerprint', 'contact_inquiry', 5, 15);
    ELSE
        PERFORM check_and_record_rate_limit(auth.uid(), NEW.device_fingerprint, 'contact_inquiry', 5, 15);
    END IF;
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_inquiry_response_rate_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF NEW.status IS DISTINCT FROM OLD.status AND OLD.status = 'pending' AND NEW.status IN ('approved', 'declined') AND NOT is_admin() THEN
        PERFORM check_and_record_rate_limit(NEW.owner_id, NULL, 'inquiry_response', 50, 200);
    END IF;
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_maintenance_request_immutable_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF NOT is_admin() THEN
        IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
            OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
            OR NEW.property_id IS DISTINCT FROM OLD.property_id
            OR NEW.agreement_id IS DISTINCT FROM OLD.agreement_id
            OR NEW.category IS DISTINCT FROM OLD.category
            OR NEW.description IS DISTINCT FROM OLD.description
            OR NEW.title IS DISTINCT FROM OLD.title
            OR NEW.unit IS DISTINCT FROM OLD.unit
            OR NEW.preferred_time IS DISTINCT FROM OLD.preferred_time
            OR NEW.images IS DISTINCT FROM OLD.images
            OR NEW.priority IS DISTINCT FROM OLD.priority
            OR NEW.created_at IS DISTINCT FROM OLD.created_at
        THEN
            RAISE EXCEPTION 'Only status, landlord_notes, updated_at, and resolved_at may be changed on a maintenance request.';
        END IF;
    END IF;
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_rent_receipt_immutable_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF NOT is_admin() THEN
        IF NEW.owner_id IS DISTINCT FROM OLD.owner_id
            OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
            OR NEW.rent_payment_id IS DISTINCT FROM OLD.rent_payment_id
            OR NEW.listing_id IS DISTINCT FROM OLD.listing_id
            OR NEW.receipt_number IS DISTINCT FROM OLD.receipt_number
            OR NEW.landlord_name IS DISTINCT FROM OLD.landlord_name
            OR NEW.landlord_pan IS DISTINCT FROM OLD.landlord_pan
            OR NEW.landlord_address IS DISTINCT FROM OLD.landlord_address
            OR NEW.tenant_name IS DISTINCT FROM OLD.tenant_name
            OR NEW.tenant_pan IS DISTINCT FROM OLD.tenant_pan
            OR NEW.property_address IS DISTINCT FROM OLD.property_address
            OR NEW.period_from IS DISTINCT FROM OLD.period_from
            OR NEW.period_to IS DISTINCT FROM OLD.period_to
            OR NEW.rent_amount IS DISTINCT FROM OLD.rent_amount
            OR NEW.payment_mode IS DISTINCT FROM OLD.payment_mode
            OR NEW.transaction_ref IS DISTINCT FROM OLD.transaction_ref
            OR NEW.payment_date IS DISTINCT FROM OLD.payment_date
            OR NEW.includes_maintenance IS DISTINCT FROM OLD.includes_maintenance
            OR NEW.maintenance_amount IS DISTINCT FROM OLD.maintenance_amount
            OR NEW.notes IS DISTINCT FROM OLD.notes
            OR NEW.created_at IS DISTINCT FROM OLD.created_at
        THEN
            RAISE EXCEPTION 'Only sent_to_tenant and sent_at may be changed on a rent receipt.';
        END IF;
    END IF;
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.expire_lapsed_subscriptions()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  expired_count integer;
BEGIN
  UPDATE owner_subscriptions
  SET status = 'expired', updated_at = now()
  WHERE status = 'active'
    AND current_period_end IS NOT NULL
    AND current_period_end < now();

  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_profile()
 RETURNS SETOF users
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT * FROM users WHERE id = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION public.handle_auth_user_email_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF NEW.email IS DISTINCT FROM OLD.email THEN
        PERFORM set_config('bhavan.trusted_verification_write', 'true', true);
        UPDATE public.users SET email = NEW.email, verified_email = (NEW.email_confirmed_at IS NOT NULL) WHERE id = NEW.id;
    END IF;
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_auth_user_email_confirmed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF NEW.email_confirmed_at IS NOT NULL AND OLD.email_confirmed_at IS NULL THEN
        PERFORM set_config('bhavan.trusted_verification_write', 'true', true);
        UPDATE public.users SET verified_email = true WHERE id = NEW.id;
    END IF;
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_auth_user_phone_confirmed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF NEW.phone_confirmed_at IS NOT NULL
       AND (OLD.phone_confirmed_at IS NULL OR NEW.phone IS DISTINCT FROM OLD.phone) THEN
        PERFORM set_config('bhavan.trusted_verification_write', 'true', true);
        UPDATE public.users SET phone = NEW.phone, verified_phone = true WHERE id = NEW.id;
    END IF;
    RETURN NEW;
END;
$function$
;

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
        COALESCE(NEW.raw_user_meta_data->>'role', 'tenant'),
        NEW.phone,
        NEW.phone_confirmed_at IS NOT NULL,
        NEW.email_confirmed_at IS NOT NULL
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.increment_listing_counter(p_listing_id uuid, p_counter text, p_delta integer DEFAULT 1)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF p_counter = 'views_count' THEN
        UPDATE listings SET views_count = GREATEST(0, COALESCE(views_count, 0) + p_delta) WHERE id = p_listing_id;
    ELSIF p_counter = 'saves_count' THEN
        UPDATE listings SET saves_count = GREATEST(0, COALESCE(saves_count, 0) + p_delta) WHERE id = p_listing_id;
    ELSIF p_counter = 'inquiries_count' THEN
        UPDATE listings SET inquiries_count = GREATEST(0, COALESCE(inquiries_count, 0) + p_delta) WHERE id = p_listing_id;
    END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.increment_qr_counter(p_listing_id uuid, p_field text, p_delta integer DEFAULT 1)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_field NOT IN ('scans_count', 'messages_sent') THEN
    RAISE EXCEPTION 'invalid field: %', p_field;
  END IF;

  INSERT INTO qr_analytics (listing_id, scan_date, scans_count, messages_sent)
  VALUES (
    p_listing_id,
    CURRENT_DATE,
    CASE WHEN p_field = 'scans_count' THEN GREATEST(p_delta, 0) ELSE 0 END,
    CASE WHEN p_field = 'messages_sent' THEN GREATEST(p_delta, 0) ELSE 0 END
  )
  ON CONFLICT (listing_id, scan_date) DO UPDATE SET
    scans_count = GREATEST(0, qr_analytics.scans_count + CASE WHEN p_field = 'scans_count' THEN p_delta ELSE 0 END),
    messages_sent = GREATEST(0, qr_analytics.messages_sent + CASE WHEN p_field = 'messages_sent' THEN p_delta ELSE 0 END);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin(uid uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM users WHERE id = uid AND role = 'admin');
$function$
;

CREATE OR REPLACE FUNCTION public.mark_aadhaar_verified(p_last4 text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  PERFORM set_config('bhavan.trusted_verification_write', 'true', true);
  UPDATE users
  SET verified_aadhaar = true,
      aadhaar_last4 = p_last4,
      aadhaar_verification_status = 'verified',
      aadhaar_verified_at = now()
  WHERE id = auth.uid();
END;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_agreement_shared(p_agreement_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id UUID;
  v_agreement_number TEXT;
BEGIN
  SELECT tenant_id, agreement_number INTO v_tenant_id, v_agreement_number
  FROM rental_agreements
  WHERE id = p_agreement_id AND owner_id = auth.uid();

  IF v_tenant_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO notifications (user_id, type, title, message, action_url)
  VALUES (
    v_tenant_id,
    'lease',
    'Rental agreement shared',
    'Your landlord shared a rental agreement (' || v_agreement_number || ') with you.',
    '/tenant-profile?tab=rentManagement&sub=documents'
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_connection_request_approved(p_request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id UUID;
  v_listing_title TEXT;
BEGIN
  SELECT tenant_id, listing_title INTO v_tenant_id, v_listing_title
  FROM connection_requests
  WHERE id = p_request_id AND owner_id = auth.uid() AND status = 'approved';

  IF v_tenant_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO notifications (user_id, type, title, message, action_url)
  VALUES (
    v_tenant_id,
    'inquiry',
    'Request approved',
    'Your request for "' || v_listing_title || '" was approved.',
    '/tenant-profile?tab=inquiries'
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_connection_request_created(p_request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.notify_maintenance_request_created(p_request_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_owner_id UUID;
  v_category TEXT;
  v_title TEXT;
BEGIN
  SELECT owner_id, category, title INTO v_owner_id, v_category, v_title
  FROM maintenance_requests
  WHERE id = p_request_id AND tenant_id = auth.uid();

  IF v_owner_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO notifications (user_id, type, title, message, action_url)
  VALUES (
    v_owner_id,
    'maintenance',
    'New maintenance request',
    'A tenant reported a ' || v_category || ' issue' || CASE WHEN v_title IS NOT NULL AND v_title <> '' THEN ': ' || v_title ELSE '' END || '.',
    '/owner-profile?tab=requests'
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_receipt_shared(p_receipt_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id UUID;
  v_receipt_number TEXT;
BEGIN
  SELECT tenant_id, receipt_number INTO v_tenant_id, v_receipt_number
  FROM rent_receipts
  WHERE id = p_receipt_id AND owner_id = auth.uid();

  IF v_tenant_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO notifications (user_id, type, title, message, action_url)
  VALUES (
    v_tenant_id,
    'payment',
    'Rent receipt shared',
    'Your landlord shared a rent receipt (' || v_receipt_number || ') with you.',
    '/tenant-profile?tab=rentManagement&sub=documents'
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.notify_visit_requested(p_visit_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_owner_id UUID;
  v_listing_title TEXT;
  v_visit_date DATE;
  v_visit_time TEXT;
BEGIN
  SELECT pv.owner_id, l.title, pv.visit_date, pv.visit_time
  INTO v_owner_id, v_listing_title, v_visit_date, v_visit_time
  FROM property_visits pv
  JOIN listings l ON l.id = pv.listing_id
  WHERE pv.id = p_visit_id AND pv.tenant_id = auth.uid();

  IF v_owner_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO notifications (user_id, type, title, message, action_url)
  VALUES (
    v_owner_id,
    'lease',
    'New visit request',
    'A tenant requested to visit "' || v_listing_title || '" on ' || to_char(v_visit_date, 'DD Mon YYYY') || ' at ' || v_visit_time || '.',
    '/owner-profile?tab=inquiries'
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.protect_privileged_user_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF is_admin() OR current_setting('bhavan.trusted_verification_write', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role AND (NEW.role = 'admin' OR OLD.role = 'admin') THEN
    NEW.role := OLD.role;
  END IF;
  NEW.verified_email := OLD.verified_email;
  NEW.verified_aadhaar := OLD.verified_aadhaar;
  NEW.aadhaar_last4 := OLD.aadhaar_last4;
  NEW.aadhaar_verified_at := OLD.aadhaar_verified_at;
  NEW.aadhaar_verification_status := OLD.aadhaar_verification_status;

  -- verified_phone isn't just pinned: a phone number that just changed
  -- (via the free-text Overview field) hasn't been proven to belong to
  -- this user, so it must drop back to unverified rather than keep
  -- whatever the previous number's verified state was.
  IF NEW.phone IS DISTINCT FROM OLD.phone THEN
    NEW.verified_phone := false;
  ELSE
    NEW.verified_phone := OLD.verified_phone;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.protect_soft_block_resolution_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() != NEW.tenant_id AND NOT is_admin() THEN
    IF TG_OP = 'UPDATE' THEN
      NEW.aadhaar_re_verified := OLD.aadhaar_re_verified;
      NEW.additional_details_provided := OLD.additional_details_provided;
      NEW.details := OLD.details;
    ELSE
      NEW.aadhaar_re_verified := false;
      NEW.additional_details_provided := false;
      NEW.details := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.purge_unconfirmed_accounts()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  purged_ids uuid[];
BEGIN
  WITH candidates AS (
    SELECT id, email, phone, name, role, created_at
    FROM users
    WHERE verified_email = false
      AND verified_phone = false
      AND created_at < now() - interval '30 days'
  ),
  inserted AS (
    INSERT INTO purged_unconfirmed_accounts (original_user_id, email, phone, name, role, account_created_at)
    SELECT id, email, phone, name, role, created_at FROM candidates
    RETURNING original_user_id
  )
  SELECT array_agg(original_user_id) INTO purged_ids FROM inserted;

  IF purged_ids IS NULL THEN
    RETURN 0;
  END IF;

  DELETE FROM users WHERE id = ANY(purged_ids);
  DELETE FROM auth.users WHERE id = ANY(purged_ids);

  RETURN array_length(purged_ids, 1);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.recalc_property_stats()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    UPDATE properties
    SET
        total_units = (SELECT COUNT(*) FROM units WHERE property_id = COALESCE(NEW.property_id, OLD.property_id)),
        occupied_units = (SELECT COUNT(*) FROM units WHERE property_id = COALESCE(NEW.property_id, OLD.property_id) AND status = 'occupied')
    WHERE id = COALESCE(NEW.property_id, OLD.property_id);
    RETURN COALESCE(NEW, OLD);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_aadhaar_verification_status(p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  PERFORM set_config('bhavan.trusted_verification_write', 'true', true);
  UPDATE users SET aadhaar_verification_status = p_status WHERE id = auth.uid();
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_maintenance_request_owner()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_owner_id UUID;
  v_agreement_tenant_id UUID;
BEGIN
  IF NEW.agreement_id IS NULL THEN
    RAISE EXCEPTION 'agreement_id is required';
  END IF;

  SELECT owner_id, tenant_id INTO v_owner_id, v_agreement_tenant_id
  FROM rental_agreements
  WHERE id = NEW.agreement_id;

  IF v_owner_id IS NULL OR v_agreement_tenant_id IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'agreement_id does not belong to this tenant';
  END IF;

  NEW.owner_id := v_owner_id;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.set_property_visit_owner()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_owner_id UUID;
BEGIN
  SELECT owner_id INTO v_owner_id
  FROM connection_requests
  WHERE tenant_id = NEW.tenant_id AND listing_id = NEW.listing_id AND status = 'approved'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'No approved connection request for this listing';
  END IF;

  NEW.owner_id := v_owner_id;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;


-- ---- Views ----

CREATE OR REPLACE VIEW users_public WITH (security_invoker=false) AS
 SELECT id,
    name,
    avatar_url,
    role,
    verified_aadhaar,
    created_at
   FROM users;

CREATE OR REPLACE VIEW vacation_bookings_public WITH (security_invoker=false) AS
 SELECT listing_id,
    check_in,
    check_out
   FROM vacation_bookings
  WHERE status = 'confirmed'::text;


-- ---- Indexes ----

CREATE INDEX idx_aadhaar_attempts_reference ON public.aadhaar_verification_attempts USING btree (provider_reference);
CREATE INDEX idx_aadhaar_attempts_user ON public.aadhaar_verification_attempts USING btree (user_id);
CREATE INDEX idx_audit_logs_action ON public.audit_logs USING btree (action);
CREATE INDEX idx_audit_logs_created ON public.audit_logs USING btree (created_at);
CREATE INDEX idx_audit_logs_table ON public.audit_logs USING btree (table_name);
CREATE INDEX idx_audit_logs_user ON public.audit_logs USING btree (user_id);
CREATE INDEX idx_billing_history_created ON public.billing_history USING btree (created_at);
CREATE INDEX idx_billing_history_owner ON public.billing_history USING btree (owner_id);
CREATE INDEX idx_billing_history_subscription ON public.billing_history USING btree (subscription_id);
CREATE INDEX idx_broker_reports_listing ON public.broker_reports USING btree (listing_id);
CREATE INDEX idx_broker_reports_owner ON public.broker_reports USING btree (owner_id);
CREATE INDEX idx_broker_reports_tenant ON public.broker_reports USING btree (tenant_id);
CREATE INDEX idx_chat_messages_created ON public.chat_messages USING btree (created_at);
CREATE INDEX idx_chat_messages_request ON public.chat_messages USING btree (request_id);
CREATE INDEX idx_client_error_logs_created_at ON public.client_error_logs USING btree (created_at DESC);
CREATE INDEX idx_client_error_logs_user ON public.client_error_logs USING btree (user_id);
CREATE INDEX idx_community_comments_author ON public.community_comments USING btree (author_id);
CREATE INDEX idx_community_comments_post ON public.community_comments USING btree (post_id);
CREATE INDEX idx_community_post_reports_post ON public.community_post_reports USING btree (post_id);
CREATE INDEX idx_community_post_reports_reporter ON public.community_post_reports USING btree (reporter_id);
CREATE INDEX idx_community_posts_author ON public.community_posts USING btree (author_id);
CREATE INDEX idx_community_posts_category ON public.community_posts USING btree (category);
CREATE INDEX idx_community_posts_created ON public.community_posts USING btree (created_at);
CREATE INDEX idx_connection_requests_listing ON public.connection_requests USING btree (listing_id);
CREATE UNIQUE INDEX idx_connection_requests_one_active_per_tenant_listing ON public.connection_requests USING btree (tenant_id, listing_id) WHERE (status = ANY (ARRAY['pending'::text, 'approved'::text]));
CREATE INDEX idx_connection_requests_owner ON public.connection_requests USING btree (owner_id);
CREATE INDEX idx_connection_requests_status ON public.connection_requests USING btree (status);
CREATE INDEX idx_connection_requests_tenant ON public.connection_requests USING btree (tenant_id);
CREATE INDEX idx_contact_attempts_created ON public.contact_attempts USING btree (created_at);
CREATE INDEX idx_contact_attempts_device ON public.contact_attempts USING btree (device_fingerprint);
CREATE INDEX idx_contact_attempts_ip ON public.contact_attempts USING btree (ip_address);
CREATE INDEX idx_contact_attempts_listing ON public.contact_attempts USING btree (listing_id);
CREATE INDEX idx_contact_attempts_user ON public.contact_attempts USING btree (user_id);
CREATE INDEX idx_documents_user ON public.documents USING btree (user_id);
CREATE INDEX idx_error_rate_alerts_unacknowledged ON public.error_rate_alerts USING btree (created_at DESC) WHERE (acknowledged_at IS NULL);
CREATE INDEX idx_listing_reports_listing_id ON public.listing_reports USING btree (listing_id);
CREATE INDEX idx_listing_reports_status ON public.listing_reports USING btree (status);
CREATE INDEX idx_listings_city ON public.listings USING btree (city);
CREATE INDEX idx_listings_coordinates ON public.listings USING btree (latitude, longitude) WHERE ((latitude IS NOT NULL) AND (longitude IS NOT NULL));
CREATE INDEX idx_listings_owner ON public.listings USING btree (owner_id);
CREATE INDEX idx_listings_property ON public.listings USING btree (property_id);
CREATE INDEX idx_listings_state ON public.listings USING btree (state);
CREATE INDEX idx_listings_status ON public.listings USING btree (status);
CREATE INDEX idx_maintenance_priority ON public.maintenance_requests USING btree (priority);
CREATE INDEX idx_maintenance_property ON public.maintenance_requests USING btree (property_id);
CREATE INDEX idx_maintenance_requests_agreement_id ON public.maintenance_requests USING btree (agreement_id);
CREATE INDEX idx_maintenance_requests_owner_id ON public.maintenance_requests USING btree (owner_id);
CREATE INDEX idx_maintenance_status ON public.maintenance_requests USING btree (status);
CREATE INDEX idx_maintenance_tenant ON public.maintenance_requests USING btree (tenant_id);
CREATE INDEX idx_notification_prefs_user ON public.notification_preferences USING btree (user_id);
CREATE INDEX idx_notifications_created ON public.notifications USING btree (created_at);
CREATE INDEX idx_notifications_read ON public.notifications USING btree (user_id, read);
CREATE INDEX idx_notifications_user ON public.notifications USING btree (user_id);
CREATE INDEX idx_owner_subscriptions_owner ON public.owner_subscriptions USING btree (owner_id);
CREATE INDEX idx_owner_subscriptions_status ON public.owner_subscriptions USING btree (status);
CREATE INDEX idx_properties_city ON public.properties USING btree (city);
CREATE INDEX idx_properties_owner ON public.properties USING btree (owner_id);
CREATE INDEX idx_property_visits_listing_id ON public.property_visits USING btree (listing_id);
CREATE UNIQUE INDEX idx_property_visits_one_active_per_tenant_listing ON public.property_visits USING btree (tenant_id, listing_id) WHERE (status = ANY (ARRAY['requested'::text, 'confirmed'::text]));
CREATE INDEX idx_property_visits_owner_id ON public.property_visits USING btree (owner_id);
CREATE INDEX idx_property_visits_tenant_id ON public.property_visits USING btree (tenant_id);
CREATE INDEX idx_push_tokens_fcm ON public.user_push_tokens USING btree (fcm_token);
CREATE INDEX idx_push_tokens_user ON public.user_push_tokens USING btree (user_id);
CREATE INDEX idx_qr_analytics_date ON public.qr_analytics USING btree (scan_date);
CREATE INDEX idx_qr_analytics_listing ON public.qr_analytics USING btree (listing_id);
CREATE INDEX idx_rate_limit_events_actor ON public.rate_limit_events USING btree (actor, action, created_at);
CREATE INDEX idx_rate_limit_events_fingerprint ON public.rate_limit_events USING btree (device_fingerprint, action, created_at);
CREATE INDEX idx_rent_payments_agreement_id ON public.rent_payments USING btree (agreement_id);
CREATE INDEX idx_rent_payments_month ON public.rent_payments USING btree (month);
CREATE INDEX idx_rent_payments_owner ON public.rent_payments USING btree (owner_id);
CREATE INDEX idx_rent_payments_property ON public.rent_payments USING btree (property_id);
CREATE INDEX idx_rent_payments_razorpay_order_id ON public.rent_payments USING btree (razorpay_order_id);
CREATE INDEX idx_rent_payments_status ON public.rent_payments USING btree (status);
CREATE INDEX idx_rent_payments_tenant ON public.rent_payments USING btree (tenant_id);
CREATE INDEX idx_rent_payments_unit ON public.rent_payments USING btree (property_unit_id);
CREATE INDEX idx_rent_receipts_listing ON public.rent_receipts USING btree (listing_id);
CREATE INDEX idx_rent_receipts_owner ON public.rent_receipts USING btree (owner_id);
CREATE INDEX idx_rent_receipts_payment ON public.rent_receipts USING btree (rent_payment_id);
CREATE INDEX idx_rent_receipts_tenant ON public.rent_receipts USING btree (tenant_id);
CREATE INDEX idx_rental_agreements_listing ON public.rental_agreements USING btree (listing_id);
CREATE INDEX idx_rental_agreements_owner ON public.rental_agreements USING btree (owner_id);
CREATE INDEX idx_rental_agreements_tenant ON public.rental_agreements USING btree (tenant_id);
CREATE INDEX idx_rental_agreements_unit ON public.rental_agreements USING btree (unit_id);
CREATE INDEX idx_reviews_listing ON public.reviews USING btree (listing_id);
CREATE INDEX idx_reviews_reviewer ON public.reviews USING btree (reviewer_id);
CREATE INDEX idx_reviews_subject ON public.reviews USING btree (subject_id);
CREATE INDEX idx_saved_listings_listing ON public.saved_listings USING btree (listing_id);
CREATE INDEX idx_saved_listings_user ON public.saved_listings USING btree (user_id);
CREATE INDEX idx_subscription_features_key ON public.subscription_features USING btree (feature_key);
CREATE INDEX idx_subscription_features_owner ON public.subscription_features USING btree (owner_id);
CREATE INDEX idx_units_property ON public.units USING btree (property_id);
CREATE INDEX idx_units_status ON public.units USING btree (status);
CREATE INDEX idx_units_tenant ON public.units USING btree (tenant_id);
CREATE INDEX idx_upi_mandates_owner ON public.upi_mandates USING btree (owner_id);
CREATE INDEX idx_upi_mandates_property ON public.upi_mandates USING btree (property_id);
CREATE INDEX idx_upi_mandates_status ON public.upi_mandates USING btree (status);
CREATE INDEX idx_upi_mandates_tenant ON public.upi_mandates USING btree (tenant_id);
CREATE INDEX idx_users_email ON public.users USING btree (email);
CREATE INDEX idx_users_role ON public.users USING btree (role);
CREATE INDEX idx_vacation_bookings_listing ON public.vacation_bookings USING btree (listing_id);
CREATE INDEX idx_vacation_bookings_owner ON public.vacation_bookings USING btree (owner_id);
CREATE INDEX idx_vacation_bookings_tenant ON public.vacation_bookings USING btree (tenant_id);


-- ---- Triggers (public tables) ----

CREATE TRIGGER update_broker_reports_updated_at BEFORE UPDATE ON public.broker_reports FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_community_posts_no_self_unhide BEFORE UPDATE ON public.community_posts FOR EACH ROW EXECUTE FUNCTION enforce_community_post_no_self_unhide();
CREATE TRIGGER trg_community_posts_rate_limit BEFORE INSERT ON public.community_posts FOR EACH ROW EXECUTE FUNCTION enforce_community_post_rate_limit();
CREATE TRIGGER update_community_posts_updated_at BEFORE UPDATE ON public.community_posts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_connection_requests_immutable_fields BEFORE UPDATE ON public.connection_requests FOR EACH ROW EXECUTE FUNCTION enforce_connection_request_immutable_fields();
CREATE TRIGGER trg_connection_requests_rate_limit BEFORE UPDATE ON public.connection_requests FOR EACH ROW EXECUTE FUNCTION enforce_inquiry_response_rate_limit();
CREATE TRIGGER trg_contact_inquiries_rate_limit BEFORE INSERT ON public.contact_inquiries FOR EACH ROW EXECUTE FUNCTION enforce_contact_inquiry_rate_limit();
CREATE TRIGGER update_listings_updated_at BEFORE UPDATE ON public.listings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_maintenance_requests_immutable_fields BEFORE UPDATE ON public.maintenance_requests FOR EACH ROW EXECUTE FUNCTION enforce_maintenance_request_immutable_fields();
CREATE TRIGGER trg_set_maintenance_request_owner BEFORE INSERT ON public.maintenance_requests FOR EACH ROW EXECUTE FUNCTION set_maintenance_request_owner();
CREATE TRIGGER update_maintenance_requests_updated_at BEFORE UPDATE ON public.maintenance_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_owner_subscriptions_updated_at BEFORE UPDATE ON public.owner_subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER cascade_property_verification_trigger AFTER UPDATE ON public.properties FOR EACH ROW EXECUTE FUNCTION cascade_property_verification_to_listings();
CREATE TRIGGER update_properties_updated_at BEFORE UPDATE ON public.properties FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_set_property_visit_owner BEFORE INSERT ON public.property_visits FOR EACH ROW EXECUTE FUNCTION set_property_visit_owner();
CREATE TRIGGER update_rent_payments_updated_at BEFORE UPDATE ON public.rent_payments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_rent_receipts_immutable_fields BEFORE UPDATE ON public.rent_receipts FOR EACH ROW EXECUTE FUNCTION enforce_rent_receipt_immutable_fields();
CREATE TRIGGER protect_soft_block_resolution_fields_trigger BEFORE INSERT OR UPDATE ON public.soft_block_states FOR EACH ROW EXECUTE FUNCTION protect_soft_block_resolution_fields();
CREATE TRIGGER update_soft_block_states_updated_at BEFORE UPDATE ON public.soft_block_states FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_property_unit_count AFTER INSERT OR DELETE OR UPDATE ON public.units FOR EACH ROW EXECUTE FUNCTION recalc_property_stats();
CREATE TRIGGER update_units_updated_at BEFORE UPDATE ON public.units FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_upi_mandates_updated_at BEFORE UPDATE ON public.upi_mandates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER protect_privileged_user_columns_trigger BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION protect_privileged_user_columns();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_vacation_bookings_updated_at BEFORE UPDATE ON public.vacation_bookings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ---- Triggers on auth.users (user provisioning & phone sync) ----

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();
CREATE TRIGGER on_auth_user_email_changed AFTER UPDATE OF email ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_auth_user_email_change();
CREATE TRIGGER on_auth_user_email_confirmed AFTER UPDATE OF email_confirmed_at ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_auth_user_email_confirmed();
CREATE TRIGGER on_auth_user_phone_confirmed AFTER UPDATE OF phone, phone_confirmed_at ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_auth_user_phone_confirmed();


-- ---- Row Level Security ----

ALTER TABLE aadhaar_verification_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE broker_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_error_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_post_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE connection_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_alert_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_rate_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE listing_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE purged_unconfirmed_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE rent_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE rent_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE rental_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE soft_block_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE units ENABLE ROW LEVEL SECURITY;
ALTER TABLE upi_mandates ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE vacation_bookings ENABLE ROW LEVEL SECURITY;


-- ---- Policies (public schema) ----

CREATE POLICY "Admins can read all aadhaar attempts" ON aadhaar_verification_attempts AS PERMISSIVE FOR SELECT TO public USING (is_admin());
CREATE POLICY "Users can insert own aadhaar attempts" ON aadhaar_verification_attempts AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "Users can update own aadhaar attempts" ON aadhaar_verification_attempts AS PERMISSIVE FOR UPDATE TO public USING ((user_id = auth.uid()));
CREATE POLICY "Users can view own aadhaar attempts" ON aadhaar_verification_attempts AS PERMISSIVE FOR SELECT TO public USING ((user_id = auth.uid()));
CREATE POLICY "Admins can read audit logs" ON audit_logs AS PERMISSIVE FOR SELECT TO public USING (is_admin());
CREATE POLICY "Admins can read all billing" ON billing_history AS PERMISSIVE FOR SELECT TO public USING (is_admin());
CREATE POLICY "Owners can read own billing" ON billing_history AS PERMISSIVE FOR SELECT TO public USING ((owner_id = auth.uid()));
CREATE POLICY "Admins can read all broker reports" ON broker_reports AS PERMISSIVE FOR SELECT TO public USING (is_admin());
CREATE POLICY "Admins can read all reports" ON broker_reports AS PERMISSIVE FOR SELECT TO public USING (is_admin());
CREATE POLICY "Admins can update broker reports" ON broker_reports AS PERMISSIVE FOR UPDATE TO public USING (is_admin());
CREATE POLICY "Owners can create reports" ON broker_reports AS PERMISSIVE FOR INSERT TO public WITH CHECK (((owner_id = auth.uid()) AND (status = 'pending'::text) AND (admin_note IS NULL)));
CREATE POLICY "Owners can read own submitted reports" ON broker_reports AS PERMISSIVE FOR SELECT TO public USING ((owner_id = auth.uid()));
CREATE POLICY "Reported tenant can read own reports" ON broker_reports AS PERMISSIVE FOR SELECT TO public USING ((tenant_id = auth.uid()));
CREATE POLICY "Chat parties can read messages" ON chat_messages AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM connection_requests cr
  WHERE ((cr.id = chat_messages.request_id) AND ((cr.tenant_id = auth.uid()) OR (cr.owner_id = auth.uid()))))));
CREATE POLICY "Chat parties can send messages" ON chat_messages AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM connection_requests cr
  WHERE ((cr.id = chat_messages.request_id) AND ((cr.tenant_id = auth.uid()) OR (cr.owner_id = auth.uid()))))));
CREATE POLICY "Admins can delete client error logs" ON client_error_logs AS PERMISSIVE FOR DELETE TO public USING (is_admin());
CREATE POLICY "Admins can read all client error logs" ON client_error_logs AS PERMISSIVE FOR SELECT TO public USING (is_admin());
CREATE POLICY "Anyone can report a client error" ON client_error_logs AS PERMISSIVE FOR INSERT TO public WITH CHECK (((user_id IS NULL) OR (user_id = auth.uid())));
CREATE POLICY "Authenticated can create comments" ON community_comments AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = author_id));
CREATE POLICY "Authors can delete own comments" ON community_comments AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = author_id));
CREATE POLICY "Public can read comments" ON community_comments AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "Admins can dismiss post reports" ON community_post_reports AS PERMISSIVE FOR DELETE TO public USING (is_admin());
CREATE POLICY "Admins can read post reports" ON community_post_reports AS PERMISSIVE FOR SELECT TO public USING (is_admin());
CREATE POLICY "Authenticated can report posts" ON community_post_reports AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((reporter_id = auth.uid()));
CREATE POLICY "Admins can update posts" ON community_posts AS PERMISSIVE FOR UPDATE TO public USING (is_admin());
CREATE POLICY "Authenticated can create posts" ON community_posts AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = author_id));
CREATE POLICY "Authors can delete own posts" ON community_posts AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = author_id));
CREATE POLICY "Authors can update own posts" ON community_posts AS PERMISSIVE FOR UPDATE TO public USING ((auth.uid() = author_id));
CREATE POLICY "Public can read visible posts" ON community_posts AS PERMISSIVE FOR SELECT TO public USING (((hidden = false) OR is_admin()));
CREATE POLICY "Owners can read and update their requests" ON connection_requests AS PERMISSIVE FOR ALL TO public USING ((owner_id = auth.uid()));
CREATE POLICY "Tenants can create requests" ON connection_requests AS PERMISSIVE FOR INSERT TO public WITH CHECK ((tenant_id = auth.uid()));
CREATE POLICY "Tenants can insert own connection requests" ON connection_requests AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((tenant_id = auth.uid()));
CREATE POLICY "Tenants can read own requests" ON connection_requests AS PERMISSIVE FOR SELECT TO public USING ((tenant_id = auth.uid()));
CREATE POLICY "Admins can read contact attempts" ON contact_attempts AS PERMISSIVE FOR SELECT TO public USING (is_admin());
CREATE POLICY "Anyone can record a contact attempt" ON contact_attempts AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Admins can read contact inquiries" ON contact_inquiries AS PERMISSIVE FOR SELECT TO public USING (is_admin());
CREATE POLICY "Admins can update contact inquiries" ON contact_inquiries AS PERMISSIVE FOR UPDATE TO public USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Anyone can submit a contact inquiry" ON contact_inquiries AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Users can insert own documents" ON documents AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "Users can manage own documents" ON documents AS PERMISSIVE FOR ALL TO public USING ((user_id = auth.uid()));
CREATE POLICY "Admins can read alert settings" ON error_alert_settings AS PERMISSIVE FOR SELECT TO public USING (is_admin());
CREATE POLICY "Admins can update alert settings" ON error_alert_settings AS PERMISSIVE FOR UPDATE TO public USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admins can acknowledge error rate alerts" ON error_rate_alerts AS PERMISSIVE FOR UPDATE TO public USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admins can read error rate alerts" ON error_rate_alerts AS PERMISSIVE FOR SELECT TO public USING (is_admin());
CREATE POLICY "Admins can read all listing reports" ON listing_reports AS PERMISSIVE FOR SELECT TO public USING (is_admin());
CREATE POLICY "Admins can update listing reports" ON listing_reports AS PERMISSIVE FOR UPDATE TO public USING (is_admin());
CREATE POLICY "Reporters can read own reports" ON listing_reports AS PERMISSIVE FOR SELECT TO public USING ((reporter_id = auth.uid()));
CREATE POLICY "Tenants can report a listing" ON listing_reports AS PERMISSIVE FOR INSERT TO public WITH CHECK ((reporter_id = auth.uid()));
CREATE POLICY "Admins can read all listings" ON listings AS PERMISSIVE FOR SELECT TO public USING (is_admin());
CREATE POLICY "Admins can update any listing" ON listings AS PERMISSIVE FOR UPDATE TO public USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Listing owners can delete own listings" ON listings AS PERMISSIVE FOR DELETE TO authenticated USING ((owner_id = auth.uid()));
CREATE POLICY "Listing owners can insert own listings" ON listings AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((owner_id = auth.uid()));
CREATE POLICY "Listing owners can update own listings" ON listings AS PERMISSIVE FOR UPDATE TO authenticated USING ((owner_id = auth.uid())) WITH CHECK ((owner_id = auth.uid()));
CREATE POLICY "Owners full access on own listings" ON listings AS PERMISSIVE FOR ALL TO public USING ((owner_id = auth.uid()));
CREATE POLICY "Public can read active listings" ON listings AS PERMISSIVE FOR SELECT TO public USING ((status = 'active'::text));
CREATE POLICY "Owners can read their tenants requests" ON maintenance_requests AS PERMISSIVE FOR SELECT TO public USING ((owner_id = auth.uid()));
CREATE POLICY "Owners can update their tenants requests" ON maintenance_requests AS PERMISSIVE FOR UPDATE TO public USING ((owner_id = auth.uid()));
CREATE POLICY "Tenants can create requests" ON maintenance_requests AS PERMISSIVE FOR INSERT TO public WITH CHECK ((tenant_id = auth.uid()));
CREATE POLICY "Tenants can insert own maintenance requests" ON maintenance_requests AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((tenant_id = auth.uid()));
CREATE POLICY "Tenants can read own requests" ON maintenance_requests AS PERMISSIVE FOR SELECT TO public USING ((tenant_id = auth.uid()));
CREATE POLICY "Users can insert own notification preferences" ON notification_preferences AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "Users can manage own preferences" ON notification_preferences AS PERMISSIVE FOR ALL TO public USING ((user_id = auth.uid()));
CREATE POLICY "Users can insert own notifications" ON notifications AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "Users can manage own notifications" ON notifications AS PERMISSIVE FOR ALL TO public USING ((user_id = auth.uid()));
CREATE POLICY "Admins can read all subscriptions" ON owner_subscriptions AS PERMISSIVE FOR SELECT TO public USING (is_admin());
CREATE POLICY "Owners can read own subscription" ON owner_subscriptions AS PERMISSIVE FOR SELECT TO public USING ((owner_id = auth.uid()));
CREATE POLICY "Admins can update any property" ON properties AS PERMISSIVE FOR UPDATE TO public USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Authenticated owners can select own properties" ON properties AS PERMISSIVE FOR SELECT TO authenticated USING ((owner_id = auth.uid()));
CREATE POLICY "Owners and admins can read properties" ON properties AS PERMISSIVE FOR SELECT TO public USING (((owner_id = auth.uid()) OR is_admin()));
CREATE POLICY "Owners full access on own properties" ON properties AS PERMISSIVE FOR ALL TO public USING ((owner_id = auth.uid()));
CREATE POLICY "Property owners can delete own properties" ON properties AS PERMISSIVE FOR DELETE TO authenticated USING ((owner_id = auth.uid()));
CREATE POLICY "Property owners can insert own properties" ON properties AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((owner_id = auth.uid()));
CREATE POLICY "Property owners can update own properties" ON properties AS PERMISSIVE FOR UPDATE TO authenticated USING ((owner_id = auth.uid())) WITH CHECK ((owner_id = auth.uid()));
CREATE POLICY "Owners can read their visits" ON property_visits AS PERMISSIVE FOR SELECT TO public USING ((owner_id = auth.uid()));
CREATE POLICY "Owners can update their visits" ON property_visits AS PERMISSIVE FOR UPDATE TO public USING ((owner_id = auth.uid()));
CREATE POLICY "Tenants can insert own visits" ON property_visits AS PERMISSIVE FOR INSERT TO public WITH CHECK ((tenant_id = auth.uid()));
CREATE POLICY "Tenants can read own visits" ON property_visits AS PERMISSIVE FOR SELECT TO public USING ((tenant_id = auth.uid()));
CREATE POLICY "Admins can read purge history" ON purged_unconfirmed_accounts AS PERMISSIVE FOR SELECT TO public USING (is_admin());
CREATE POLICY "Public can read qr analytics" ON qr_analytics AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "Admins can read rate limit events" ON rate_limit_events AS PERMISSIVE FOR SELECT TO public USING (is_admin());
CREATE POLICY "Owners can insert own received rent payments" ON rent_payments AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((owner_id = auth.uid()) AND (status = 'pending'::text)));
CREATE POLICY "Owners can read own received payments" ON rent_payments AS PERMISSIVE FOR SELECT TO public USING ((owner_id = auth.uid()));
CREATE POLICY "Owners can update own received payments" ON rent_payments AS PERMISSIVE FOR UPDATE TO public USING ((owner_id = auth.uid())) WITH CHECK (((owner_id = auth.uid()) AND (status = 'reconciled'::text)));
CREATE POLICY "Tenants can insert own rent payments" ON rent_payments AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((tenant_id = auth.uid()) AND (status = 'pending'::text)));
CREATE POLICY "Tenants can read own payments" ON rent_payments AS PERMISSIVE FOR SELECT TO public USING ((tenant_id = auth.uid()));
CREATE POLICY "Owners can insert own receipts" ON rent_receipts AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((owner_id = auth.uid()));
CREATE POLICY "Owners can manage own receipts" ON rent_receipts AS PERMISSIVE FOR ALL TO public USING ((owner_id = auth.uid()));
CREATE POLICY "Tenants can read receipts naming them" ON rent_receipts AS PERMISSIVE FOR SELECT TO public USING ((tenant_id = auth.uid()));
CREATE POLICY "Owners can insert own agreements" ON rental_agreements AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((owner_id = auth.uid()) AND (signed_by_tenant = false)));
CREATE POLICY "Owners can manage own agreements" ON rental_agreements AS PERMISSIVE FOR ALL TO public USING ((owner_id = auth.uid())) WITH CHECK (((owner_id = auth.uid()) AND (signed_by_tenant = false)));
CREATE POLICY "Tenants can read agreements naming them" ON rental_agreements AS PERMISSIVE FOR SELECT TO public USING ((tenant_id = auth.uid()));
CREATE POLICY "Authenticated can create own reviews" ON reviews AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((reviewer_id = auth.uid()) AND ((subject_id IS NULL) OR (EXISTS ( SELECT 1
   FROM connection_requests cr
  WHERE ((cr.status = 'approved'::text) AND (((cr.tenant_id = reviews.reviewer_id) AND (cr.owner_id = reviews.subject_id)) OR ((cr.owner_id = reviews.reviewer_id) AND (cr.tenant_id = reviews.subject_id)))))))));
CREATE POLICY "Public can read reviews" ON reviews AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "Reviewers can delete own reviews" ON reviews AS PERMISSIVE FOR DELETE TO authenticated USING ((reviewer_id = auth.uid()));
CREATE POLICY "Users can insert own saved listings" ON saved_listings AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "Users can manage own saves" ON saved_listings AS PERMISSIVE FOR ALL TO public USING ((user_id = auth.uid()));
CREATE POLICY "Admins can read all soft blocks" ON soft_block_states AS PERMISSIVE FOR SELECT TO public USING (is_admin());
CREATE POLICY "Admins can update soft blocks" ON soft_block_states AS PERMISSIVE FOR UPDATE TO public USING (is_admin());
CREATE POLICY "Reporting owner can read soft block" ON soft_block_states AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM broker_reports br
  WHERE ((br.tenant_id = soft_block_states.tenant_id) AND (br.owner_id = auth.uid())))));
CREATE POLICY "Reporting owner can update soft block" ON soft_block_states AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM broker_reports br
  WHERE ((br.tenant_id = soft_block_states.tenant_id) AND (br.owner_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM broker_reports br
  WHERE ((br.tenant_id = soft_block_states.tenant_id) AND (br.owner_id = auth.uid())))));
CREATE POLICY "Tenant can read own soft block" ON soft_block_states AS PERMISSIVE FOR SELECT TO public USING ((tenant_id = auth.uid()));
CREATE POLICY "Tenant can update own soft block" ON soft_block_states AS PERMISSIVE FOR UPDATE TO public USING ((tenant_id = auth.uid())) WITH CHECK ((tenant_id = auth.uid()));
CREATE POLICY "Tenant, reporting owner, or admin can insert soft block" ON soft_block_states AS PERMISSIVE FOR INSERT TO public WITH CHECK (((tenant_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM broker_reports br
  WHERE ((br.tenant_id = soft_block_states.tenant_id) AND (br.owner_id = auth.uid())))) OR is_admin()));
CREATE POLICY "Owners can read own features" ON subscription_features AS PERMISSIVE FOR SELECT TO public USING ((owner_id = auth.uid()));
CREATE POLICY "Owners full access on own units" ON units AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM properties p
  WHERE ((p.id = units.property_id) AND (p.owner_id = auth.uid())))));
CREATE POLICY "Property owners can delete own units" ON units AS PERMISSIVE FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM properties p
  WHERE ((p.id = units.property_id) AND (p.owner_id = auth.uid())))));
CREATE POLICY "Property owners can insert own units" ON units AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM properties
  WHERE ((properties.id = units.property_id) AND (properties.owner_id = auth.uid())))));
CREATE POLICY "Property owners can update own units" ON units AS PERMISSIVE FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM properties p
  WHERE ((p.id = units.property_id) AND (p.owner_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM properties p
  WHERE ((p.id = units.property_id) AND (p.owner_id = auth.uid())))));
CREATE POLICY "Tenants can read own unit" ON units AS PERMISSIVE FOR SELECT TO public USING ((tenant_id = auth.uid()));
CREATE POLICY "Owners can read tenant mandates" ON upi_mandates AS PERMISSIVE FOR SELECT TO public USING ((owner_id = auth.uid()));
CREATE POLICY "Tenants can insert own upi mandates" ON upi_mandates AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((tenant_id = auth.uid()));
CREATE POLICY "Tenants can manage own mandates" ON upi_mandates AS PERMISSIVE FOR ALL TO public USING ((tenant_id = auth.uid()));
CREATE POLICY "Users can insert own push tokens" ON user_push_tokens AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "Users can manage own push tokens" ON user_push_tokens AS PERMISSIVE FOR ALL TO public USING ((user_id = auth.uid()));
CREATE POLICY "Admins can read all users" ON users AS PERMISSIVE FOR SELECT TO public USING (is_admin());
CREATE POLICY "Admins can update any user" ON users AS PERMISSIVE FOR UPDATE TO public USING (is_admin());
CREATE POLICY "Users can insert own profile" ON users AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = id));
CREATE POLICY "Users can read own profile" ON users AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() = id));
CREATE POLICY "Users can update own profile" ON users AS PERMISSIVE FOR UPDATE TO authenticated USING ((auth.uid() = id));
CREATE POLICY "Admins can read all bookings" ON vacation_bookings AS PERMISSIVE FOR SELECT TO public USING (is_admin());
CREATE POLICY "Owner can read bookings on own listings" ON vacation_bookings AS PERMISSIVE FOR SELECT TO public USING ((owner_id = auth.uid()));
CREATE POLICY "Owner can update status on own listings" ON vacation_bookings AS PERMISSIVE FOR UPDATE TO public USING ((owner_id = auth.uid())) WITH CHECK ((owner_id = auth.uid()));
CREATE POLICY "Tenant can cancel own booking" ON vacation_bookings AS PERMISSIVE FOR UPDATE TO public USING ((tenant_id = auth.uid())) WITH CHECK ((tenant_id = auth.uid()));
CREATE POLICY "Tenant can create own booking request" ON vacation_bookings AS PERMISSIVE FOR INSERT TO public WITH CHECK ((tenant_id = auth.uid()));
CREATE POLICY "Tenant can read own bookings" ON vacation_bookings AS PERMISSIVE FOR SELECT TO public USING ((tenant_id = auth.uid()));


-- ---- Storage buckets & policies ----

INSERT INTO storage.buckets (id, name, public) VALUES ('listing-images', 'listing-images', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('ownership-documents', 'ownership-documents', false) ON CONFLICT (id) DO NOTHING;


CREATE POLICY "Admins can view all ownership documents" ON storage.objects AS PERMISSIVE FOR SELECT TO public USING (((bucket_id = 'ownership-documents'::text) AND is_admin()));
CREATE POLICY "Owner can delete their own ownership documents" ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING (((bucket_id = 'ownership-documents'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY "Owner can upload their own ownership documents" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'ownership-documents'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY "Owner can view their own ownership documents" ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated USING (((bucket_id = 'ownership-documents'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY "Owners can delete their own listing images" ON storage.objects AS PERMISSIVE FOR DELETE TO authenticated USING (((bucket_id = 'listing-images'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY "Owners can update their own listing images" ON storage.objects AS PERMISSIVE FOR UPDATE TO authenticated USING (((bucket_id = 'listing-images'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY "Owners can upload their own listing images" ON storage.objects AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'listing-images'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY "Public can view listing images" ON storage.objects AS PERMISSIVE FOR SELECT TO public USING ((bucket_id = 'listing-images'::text));


-- ---- Realtime publication ----

ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;


-- ---- Scheduled jobs (pg_cron) ----

SELECT cron.schedule('purge-unconfirmed-accounts', '0 3 * * *', 'SELECT purge_unconfirmed_accounts();');
SELECT cron.schedule('check-error-rate', '*/5 * * * *', 'SELECT check_error_rate_and_alert();');
SELECT cron.schedule('expire-lapsed-subscriptions', '30 3 * * *', 'SELECT expire_lapsed_subscriptions();');


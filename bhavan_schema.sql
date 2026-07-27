-- ============================================================
-- Bhavan Platform -- Full PostgreSQL Schema
-- Generated from project_plan.md + requirements.md
-- Last synced: 2026-05-07
-- 31 tables total (24 core + 7 product/order platform tables)
-- NOTE: All tables with ALL-type RLS policies now have explicit
-- INSERT policies alongside, to prevent "violates row-level
-- security policy" errors during INSERT operations.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- HELPER: is_admin()
-- Every "admin can read/update everything" RLS policy needs to check
-- the caller's role against the users table. Doing that inline as
-- is_admin()
-- directly inside a policy ON users itself causes Postgres to re-apply
-- users' RLS to that inner SELECT, which re-evaluates the same policy,
-- which re-queries users again -- infinite recursion ("infinite
-- recursion detected in policy for relation users"). SECURITY DEFINER
-- makes this function run with the privileges of its owner, bypassing
-- RLS on its internal SELECT and breaking the cycle. Used by every
-- admin-scoped policy below and in later migrations.
-- ============================================================
CREATE OR REPLACE FUNCTION is_admin(uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM users WHERE id = uid AND role = 'admin');
$$;

-- ============================================================
-- 1. USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    role TEXT CHECK (role IN ('tenant', 'owner', 'admin')) DEFAULT 'tenant',
    phone TEXT,
    verified_email BOOLEAN DEFAULT FALSE,
    verified_phone BOOLEAN DEFAULT FALSE,
    verified_aadhaar BOOLEAN DEFAULT FALSE,
    avatar_url TEXT,
    date_of_birth DATE,
    occupation TEXT,
    emergency_contact TEXT,
    move_in_date DATE,
    current_flat TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- ============================================================
-- AUTO-PROVISION public.users ON SIGNUP
-- supabase.auth.signUp() only creates a row in the internal auth.users
-- table. Nothing else creates the matching public.users profile row --
-- without this trigger, every FK that points at users(id) (properties,
-- listings, connection_requests, ...) would fail for a freshly signed-up
-- account since public.users never gets a row for them. SECURITY DEFINER
-- so it runs regardless of RLS/session state (important because if email
-- confirmation is enabled, there is no active session yet at signup time).
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.users (id, email, name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        COALESCE(NEW.raw_user_meta_data->>'role', 'tenant')
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();

-- ============================================================
-- 2. PROPERTIES
-- ============================================================
CREATE TABLE IF NOT EXISTS properties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    address TEXT NOT NULL,
    city TEXT,
    total_units INTEGER DEFAULT 0,
    occupied_units INTEGER DEFAULT 0,
    monthly_income INTEGER DEFAULT 0,
    verification_doc_url TEXT,
    verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_properties_owner ON properties(owner_id);
CREATE INDEX idx_properties_city ON properties(city);

-- ============================================================
-- 3. UNITS
-- ============================================================
CREATE TABLE IF NOT EXISTS units (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    unit_number TEXT NOT NULL,
    rent_amount INTEGER DEFAULT 0,
    maintenance_charge INTEGER DEFAULT 0,
    status TEXT CHECK (status IN ('vacant', 'occupied', 'under_maintenance')) DEFAULT 'vacant',
    tenant_id UUID REFERENCES users(id) ON DELETE SET NULL,
    tenant_name TEXT,
    lease_start DATE,
    lease_end DATE,
    agreement_generated BOOLEAN DEFAULT FALSE,
    last_payment_status TEXT CHECK (last_payment_status IN ('paid', 'pending', 'failed', 'overdue')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_units_property ON units(property_id);
CREATE INDEX idx_units_tenant ON units(tenant_id);
CREATE INDEX idx_units_status ON units(status);

-- ============================================================
-- 4. LISTINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS listings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    price INTEGER NOT NULL,
    deposit INTEGER DEFAULT 0,
    maintenance_charge INTEGER DEFAULT 0,
    location TEXT,
    city TEXT,
    bedrooms INTEGER,
    bathrooms INTEGER,
    area_sqft INTEGER,
    furnished BOOLEAN DEFAULT FALSE,
    parking TEXT CHECK (parking IN ('none', '2-wheeler', '4-wheeler', 'both')) DEFAULT 'none',
    property_type TEXT CHECK (property_type IN ('apartment', 'house', 'room', 'villa', 'cottage', 'houseboat', 'treehouse', 'farmhouse', 'beach-house')),
    images TEXT[] DEFAULT '{}',
    amenities TEXT[] DEFAULT '{}',
    status TEXT CHECK (status IN ('active', 'inactive', 'draft')) DEFAULT 'draft',
    verified BOOLEAN DEFAULT FALSE,
    views_count INTEGER DEFAULT 0,
    inquiries_count INTEGER DEFAULT 0,
    saves_count INTEGER DEFAULT 0,
    category TEXT DEFAULT 'residential',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_listings_owner ON listings(owner_id);
CREATE INDEX idx_listings_city ON listings(city);
CREATE INDEX idx_listings_status ON listings(status);
CREATE INDEX idx_listings_property ON listings(property_id);

-- ============================================================
-- 5. CONNECTION REQUESTS
-- ============================================================
CREATE TABLE IF NOT EXISTS connection_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message TEXT,
    status TEXT CHECK (status IN ('pending', 'approved', 'declined')) DEFAULT 'pending',
    move_in_date TEXT,
    occupation TEXT,
    scanned_via_qr BOOLEAN DEFAULT FALSE,
    listing_title TEXT,
    listing_location TEXT,
    listing_price INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    responded_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_connection_requests_tenant ON connection_requests(tenant_id);
CREATE INDEX idx_connection_requests_owner ON connection_requests(owner_id);
CREATE INDEX idx_connection_requests_listing ON connection_requests(listing_id);
CREATE INDEX idx_connection_requests_status ON connection_requests(status);

-- ============================================================
-- 6. CHAT MESSAGES
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id UUID NOT NULL REFERENCES connection_requests(id) ON DELETE CASCADE,
    sender TEXT CHECK (sender IN ('tenant', 'landlord')) NOT NULL,
    text TEXT NOT NULL,
    read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_chat_messages_request ON chat_messages(request_id);
CREATE INDEX idx_chat_messages_created ON chat_messages(created_at);

-- ============================================================
-- 7. BROKER REPORTS
-- ============================================================
CREATE TABLE IF NOT EXISTS broker_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    listing_id UUID REFERENCES listings(id) ON DELETE SET NULL,
    reason TEXT CHECK (reason IN ('broker', 'commission', 'competing_listings', 'refused_identity', 'other')) NOT NULL,
    reason_text TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_broker_reports_tenant ON broker_reports(tenant_id);
CREATE INDEX idx_broker_reports_owner ON broker_reports(owner_id);

-- ============================================================
-- 8. SOFT BLOCK STATES
-- ============================================================
CREATE TABLE IF NOT EXISTS soft_block_states (
    tenant_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    active BOOLEAN DEFAULT FALSE,
    triggered_at TIMESTAMP WITH TIME ZONE,
    aadhaar_re_verified BOOLEAN DEFAULT FALSE,
    additional_details_provided BOOLEAN DEFAULT FALSE,
    details JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- 9. COMMUNITY POSTS
-- ============================================================
CREATE TABLE IF NOT EXISTS community_posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT CHECK (category IN ('discussion', 'advice', 'review', 'event', 'general')) DEFAULT 'general',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_community_posts_author ON community_posts(author_id);
CREATE INDEX idx_community_posts_category ON community_posts(category);
CREATE INDEX idx_community_posts_created ON community_posts(created_at);

-- ============================================================
-- 10. COMMUNITY COMMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS community_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_community_comments_post ON community_comments(post_id);

-- ============================================================
-- 11. SAVED LISTINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS saved_listings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, listing_id)
);

CREATE INDEX idx_saved_listings_user ON saved_listings(user_id);

-- ============================================================
-- 12. DOCUMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT CHECK (type IN ('agreement', 'aadhaar', 'receipt', 'checklist', 'utility_bill', 'other')) NOT NULL,
    title TEXT NOT NULL,
    file_url TEXT,
    status TEXT CHECK (status IN ('active', 'verified', 'pending', 'expired')) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_documents_user ON documents(user_id);

-- ============================================================
-- 13. QR ANALYTICS
-- ============================================================
CREATE TABLE IF NOT EXISTS qr_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    scan_date DATE NOT NULL,
    scans_count INTEGER DEFAULT 0,
    messages_sent INTEGER DEFAULT 0,
    UNIQUE(listing_id, scan_date)
);

CREATE INDEX idx_qr_analytics_listing ON qr_analytics(listing_id);
CREATE INDEX idx_qr_analytics_date ON qr_analytics(scan_date);

-- ============================================================
-- 14. NOTIFICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT CHECK (type IN ('maintenance', 'inquiry', 'lease', 'payment', 'platform')) NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    read BOOLEAN DEFAULT FALSE,
    push_delivered BOOLEAN DEFAULT FALSE,
    sms_delivered BOOLEAN DEFAULT FALSE,
    email_delivered BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP WITH TIME ZONE,
    action_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(user_id, read);
CREATE INDEX idx_notifications_created ON notifications(created_at);

-- ============================================================
-- 15. NOTIFICATION PREFERENCES
-- ============================================================
CREATE TABLE IF NOT EXISTS notification_preferences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category TEXT CHECK (category IN ('maintenance', 'inquiries', 'payments', 'lease', 'community', 'platform')) NOT NULL,
    push_enabled BOOLEAN DEFAULT TRUE,
    sms_enabled BOOLEAN DEFAULT FALSE,
    email_enabled BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, category)
);

CREATE INDEX idx_notification_prefs_user ON notification_preferences(user_id);

-- ============================================================
-- 16. OWNER SUBSCRIPTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS owner_subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan TEXT CHECK (plan IN ('free', 'pro_monthly', 'pro_annual')) DEFAULT 'free',
    status TEXT CHECK (status IN ('trial', 'active', 'past_due', 'cancelled', 'expired')) DEFAULT 'trial',
    razorpay_subscription_id TEXT,
    razorpay_customer_id TEXT,
    current_period_start TIMESTAMP WITH TIME ZONE,
    current_period_end TIMESTAMP WITH TIME ZONE,
    trial_ends_at TIMESTAMP WITH TIME ZONE,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_owner_subscriptions_owner ON owner_subscriptions(owner_id);
CREATE INDEX idx_owner_subscriptions_status ON owner_subscriptions(status);

-- ============================================================
-- 17. BILLING HISTORY
-- ============================================================
CREATE TABLE IF NOT EXISTS billing_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES owner_subscriptions(id) ON DELETE SET NULL,
    invoice_number TEXT UNIQUE NOT NULL,
    plan TEXT CHECK (plan IN ('free', 'pro_monthly', 'pro_annual')) NOT NULL,
    amount INTEGER NOT NULL,
    gst_amount INTEGER DEFAULT 0,
    total_amount INTEGER NOT NULL,
    currency TEXT DEFAULT 'INR',
    status TEXT CHECK (status IN ('paid', 'failed', 'refunded', 'pending')) DEFAULT 'pending',
    razorpay_payment_id TEXT,
    razorpay_invoice_id TEXT,
    billing_period_start DATE,
    billing_period_end DATE,
    paid_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_billing_history_owner ON billing_history(owner_id);
CREATE INDEX idx_billing_history_subscription ON billing_history(subscription_id);
CREATE INDEX idx_billing_history_created ON billing_history(created_at);

-- ============================================================
-- 18. SUBSCRIPTION FEATURES
-- ============================================================
CREATE TABLE IF NOT EXISTS subscription_features (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    feature_key TEXT NOT NULL,
    enabled BOOLEAN DEFAULT FALSE,
    source TEXT CHECK (source IN ('plan', 'addon', 'trial')) DEFAULT 'plan',
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_subscription_features_owner ON subscription_features(owner_id);
CREATE INDEX idx_subscription_features_key ON subscription_features(feature_key);

-- ============================================================
-- 19. RENT PAYMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS rent_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    property_unit_id UUID REFERENCES units(id) ON DELETE SET NULL,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    month TEXT NOT NULL,
    payment_mode TEXT CHECK (payment_mode IN ('upi_autopay', 'upi_qr', 'bank_transfer', 'cash', 'cheque', 'razorpay_recurring')) NOT NULL,
    transaction_ref TEXT,
    status TEXT CHECK (status IN ('paid', 'pending', 'failed', 'refunded', 'reconciled')) DEFAULT 'pending',
    razorpay_payment_id TEXT,
    failure_reason TEXT,
    receipt_url TEXT,
    reconciled_at TIMESTAMP WITH TIME ZONE,
    reconciliation_note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_rent_payments_tenant ON rent_payments(tenant_id);
CREATE INDEX idx_rent_payments_owner ON rent_payments(owner_id);
CREATE INDEX idx_rent_payments_property ON rent_payments(property_id);
CREATE INDEX idx_rent_payments_unit ON rent_payments(property_unit_id);
CREATE INDEX idx_rent_payments_status ON rent_payments(status);
CREATE INDEX idx_rent_payments_month ON rent_payments(month);

-- ============================================================
-- 20. UPI MANDATES
-- ============================================================
CREATE TABLE IF NOT EXISTS upi_mandates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    upi_id TEXT NOT NULL,
    bank_account TEXT,
    mandate_amount INTEGER NOT NULL,
    frequency TEXT DEFAULT 'monthly',
    start_date DATE,
    end_date DATE,
    status TEXT CHECK (status IN ('active', 'paused', 'cancelled', 'expired')) DEFAULT 'active',
    razorpay_token TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_upi_mandates_tenant ON upi_mandates(tenant_id);
CREATE INDEX idx_upi_mandates_owner ON upi_mandates(owner_id);
CREATE INDEX idx_upi_mandates_status ON upi_mandates(status);

-- ============================================================
-- 21. CONTACT ATTEMPTS
-- ============================================================
CREATE TABLE IF NOT EXISTS contact_attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    device_fingerprint TEXT NOT NULL,
    ip_address TEXT,
    listing_id UUID REFERENCES listings(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_contact_attempts_user ON contact_attempts(user_id);
CREATE INDEX idx_contact_attempts_device ON contact_attempts(device_fingerprint);
CREATE INDEX idx_contact_attempts_ip ON contact_attempts(ip_address);
CREATE INDEX idx_contact_attempts_created ON contact_attempts(created_at);

-- ============================================================
-- 22. USER PUSH TOKENS
-- ============================================================
CREATE TABLE IF NOT EXISTS user_push_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    fcm_token TEXT NOT NULL,
    device_name TEXT,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_push_tokens_user ON user_push_tokens(user_id);
CREATE INDEX idx_push_tokens_fcm ON user_push_tokens(fcm_token);

-- ============================================================
-- 23. AUDIT LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action TEXT CHECK (action IN ('create', 'update', 'delete', 'login', 'logout', 'report', 'block', 'verify', 'payment')) NOT NULL,
    table_name TEXT,
    record_id UUID,
    before JSONB,
    after JSONB,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_table ON audit_logs(table_name);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);

-- ============================================================
-- 24. MAINTENANCE REQUESTS
-- ============================================================
CREATE TABLE IF NOT EXISTS maintenance_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    category TEXT CHECK (category IN ('plumbing', 'electrical', 'appliance', 'structural', 'cleaning', 'other')) NOT NULL,
    description TEXT NOT NULL,
    priority TEXT CHECK (priority IN ('low', 'medium', 'high', 'urgent')) DEFAULT 'medium',
    status TEXT CHECK (status IN ('pending', 'in_progress', 'completed', 'rejected')) DEFAULT 'pending',
    images TEXT[] DEFAULT '{}',
    landlord_notes TEXT,
    title TEXT,
    unit TEXT,
    preferred_time TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resolved_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_maintenance_tenant ON maintenance_requests(tenant_id);
CREATE INDEX idx_maintenance_property ON maintenance_requests(property_id);
CREATE INDEX idx_maintenance_status ON maintenance_requests(status);
CREATE INDEX idx_maintenance_priority ON maintenance_requests(priority);

-- ============================================================
-- 25-31. PRODUCT / ORDER TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS product_categories (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_items (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    category_id BIGINT REFERENCES product_categories(id),
    status TEXT DEFAULT 'draft' CHECK (status IN ('active', 'inactive', 'draft')),
    description TEXT,
    pricing_mode INT DEFAULT 0,
    currency TEXT DEFAULT 'USD',
    price NUMERIC(12,2) DEFAULT 0,
    stock INT DEFAULT 0,
    discount_enabled BOOLEAN DEFAULT FALSE,
    discount_price NUMERIC(12,2),
    media JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_variants (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL REFERENCES product_items(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    options JSONB DEFAULT '[]',
    sort_order INT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_skus (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL REFERENCES product_items(id) ON DELETE CASCADE,
    label TEXT,
    options JSONB DEFAULT '[]',
    price NUMERIC(12,2) DEFAULT 0,
    stock INT DEFAULT 0,
    discount_enabled BOOLEAN DEFAULT FALSE,
    discount_price NUMERIC(12,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_custom_fields (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    field_type TEXT DEFAULT 'text' CHECK (field_type IN ('text', 'date', 'datetime', 'dropdown', 'number')),
    options JSONB DEFAULT '[]',
    required BOOLEAN DEFAULT FALSE,
    sort_order INT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_custom_values (
    id BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL REFERENCES product_items(id) ON DELETE CASCADE,
    field_id BIGINT NOT NULL REFERENCES product_custom_fields(id) ON DELETE CASCADE,
    value TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(product_id, field_id)
);

CREATE TABLE IF NOT EXISTS order_headers (
    id BIGSERIAL PRIMARY KEY,
    customer_id TEXT,
    status TEXT DEFAULT 'pending_payment' CHECK (status IN ('pending_payment', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded')),
    customer_notes TEXT,
    admin_notes TEXT,
    tracking_number TEXT,
    currency TEXT NOT NULL DEFAULT 'USD',
    shipping_total NUMERIC(12,2) DEFAULT 0,
    tax_total NUMERIC(12,2) DEFAULT 0,
    subtotal_items NUMERIC(12,2) DEFAULT 0,
    discount_price NUMERIC(12,2) DEFAULT 0,
    payment_provider TEXT,
    checkout_session_id TEXT,
    payment_id TEXT,
    recipient JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES order_headers(id),
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    sku_id TEXT,
    sku_label TEXT,
    quantity INT NOT NULL DEFAULT 1,
    unit_price NUMERIC(12,2) NOT NULL,
    final_price NUMERIC(12,2) DEFAULT 0,
    subtotal NUMERIC(12,2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS) -- ENABLE ON ALL TABLES
-- ============================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE units ENABLE ROW LEVEL SECURITY;
ALTER TABLE listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE connection_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE broker_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE soft_block_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE owner_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE rent_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE upi_mandates ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_skus ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_custom_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_custom_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_headers ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES -- USERS
-- ============================================================
-- NOTE: no TO clause = applies to both anon and authenticated (PostgREST role).
-- A TO-anon-only policy here would make owner/author profile joins (e.g. on
-- listings, community_posts) silently return null for logged-in users while
-- working for logged-out visitors -- kept public for both so display fields
-- (name, avatar, verification badges) resolve consistently regardless of
-- auth state. Full row is exposed at the RLS layer; queries in the app only
-- ever select display-safe columns (name, avatar_url, verified_aadhaar) via
-- explicit column lists, never `select('*')`, on this cross-user join path.
CREATE POLICY "Public read users" ON users FOR SELECT USING (true);
CREATE POLICY "Users can insert own profile" ON users FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can read own profile" ON users FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON users FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Admins can read all users" ON users FOR SELECT USING (
    is_admin()
);

-- ============================================================
-- RLS POLICIES -- PROPERTIES
-- NOTE: ALL policies without WITH CHECK don't work for INSERT.
-- Explicit INSERT/UPDATE/DELETE policies for authenticated added alongside.
-- ============================================================
CREATE POLICY "Owners full access on own properties" ON properties FOR ALL USING (owner_id = auth.uid());
CREATE POLICY "Tenants can read properties" ON properties FOR SELECT USING (true);

CREATE POLICY "Property owners can insert own properties" ON properties FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Property owners can update own properties" ON properties FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Property owners can delete own properties" ON properties FOR DELETE TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Authenticated owners can select own properties" ON properties FOR SELECT TO authenticated USING (owner_id = auth.uid());

-- ============================================================
-- RLS POLICIES -- UNITS
-- NOTE: ALL policies without WITH CHECK don't work for INSERT.
-- Explicit INSERT/UPDATE/DELETE policies for authenticated added alongside.
-- ============================================================
CREATE POLICY "Owners full access on own units" ON units FOR ALL USING (
    EXISTS (SELECT 1 FROM properties p WHERE p.id = units.property_id AND p.owner_id = auth.uid())
);
CREATE POLICY "Tenants can read own unit" ON units FOR SELECT USING (tenant_id = auth.uid());

CREATE POLICY "Property owners can insert own units" ON units FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM properties WHERE properties.id = units.property_id AND properties.owner_id = auth.uid())
);
CREATE POLICY "Property owners can update own units" ON units FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM properties p WHERE p.id = units.property_id AND p.owner_id = auth.uid())
) WITH CHECK (
    EXISTS (SELECT 1 FROM properties p WHERE p.id = units.property_id AND p.owner_id = auth.uid())
);
CREATE POLICY "Property owners can delete own units" ON units FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM properties p WHERE p.id = units.property_id AND p.owner_id = auth.uid())
);

-- ============================================================
-- RLS POLICIES -- LISTINGS
-- NOTE: ALL policies without WITH CHECK don't work for INSERT.
-- Explicit INSERT/UPDATE/DELETE policies for authenticated added alongside.
-- ============================================================
CREATE POLICY "Public can read active listings" ON listings FOR SELECT USING (status = 'active');
CREATE POLICY "Owners full access on own listings" ON listings FOR ALL USING (owner_id = auth.uid());

CREATE POLICY "Listing owners can insert own listings" ON listings FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Listing owners can update own listings" ON listings FOR UPDATE TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Listing owners can delete own listings" ON listings FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- ============================================================
-- RLS POLICIES -- CONNECTION REQUESTS
-- NOTE: ALL policies without WITH CHECK don't work for INSERT.
-- Explicit INSERT policies for authenticated tenants added alongside.
-- ============================================================
CREATE POLICY "Tenants can read own requests" ON connection_requests FOR SELECT USING (tenant_id = auth.uid());
CREATE POLICY "Tenants can create requests" ON connection_requests FOR INSERT WITH CHECK (tenant_id = auth.uid());
CREATE POLICY "Tenants can insert own connection requests" ON connection_requests FOR INSERT TO authenticated WITH CHECK (tenant_id = auth.uid());
CREATE POLICY "Owners can read and update their requests" ON connection_requests FOR ALL USING (owner_id = auth.uid());

-- ============================================================
-- RLS POLICIES -- CHAT MESSAGES
-- ============================================================
CREATE POLICY "Chat parties can read messages" ON chat_messages FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM connection_requests cr
        WHERE cr.id = chat_messages.request_id
        AND (cr.tenant_id = auth.uid() OR cr.owner_id = auth.uid())
    )
);
CREATE POLICY "Chat parties can send messages" ON chat_messages FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM connection_requests cr
        WHERE cr.id = chat_messages.request_id
        AND (cr.tenant_id = auth.uid() OR cr.owner_id = auth.uid())
    )
);

-- ============================================================
-- RLS POLICIES -- BROKER REPORTS
-- ============================================================
CREATE POLICY "Owners can create reports" ON broker_reports FOR INSERT WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Admins can read all reports" ON broker_reports FOR SELECT USING (
    is_admin()
);
CREATE POLICY "Reported tenant can read own reports" ON broker_reports FOR SELECT USING (tenant_id = auth.uid());

-- ============================================================
-- RLS POLICIES -- SOFT BLOCK STATES
-- ============================================================
CREATE POLICY "Tenant can read own soft block" ON soft_block_states FOR SELECT USING (tenant_id = auth.uid());
CREATE POLICY "Admins can read all soft blocks" ON soft_block_states FOR SELECT USING (
    is_admin()
);

-- ============================================================
-- RLS POLICIES -- COMMUNITY
-- ============================================================
CREATE POLICY "Public can read posts" ON community_posts FOR SELECT USING (true);
CREATE POLICY "Authenticated can create posts" ON community_posts FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Authors can update own posts" ON community_posts FOR UPDATE USING (auth.uid() = author_id);
CREATE POLICY "Authors can delete own posts" ON community_posts FOR DELETE USING (auth.uid() = author_id);

CREATE POLICY "Public can read comments" ON community_comments FOR SELECT USING (true);
CREATE POLICY "Authenticated can create comments" ON community_comments FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Authors can delete own comments" ON community_comments FOR DELETE USING (auth.uid() = author_id);

-- ============================================================
-- RLS POLICIES -- SAVED LISTINGS
-- NOTE: ALL policies without WITH CHECK don't work for INSERT.
-- Explicit INSERT policy for authenticated users added alongside.
-- ============================================================
CREATE POLICY "Users can manage own saves" ON saved_listings FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users can insert own saved listings" ON saved_listings FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- ============================================================
-- RLS POLICIES -- DOCUMENTS
-- NOTE: ALL policies without WITH CHECK don't work for INSERT.
-- Explicit INSERT policy for authenticated users added alongside.
-- ============================================================
CREATE POLICY "Users can manage own documents" ON documents FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users can insert own documents" ON documents FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- ============================================================
-- RLS POLICIES -- QR ANALYTICS
-- ============================================================
CREATE POLICY "Public can read qr analytics" ON qr_analytics FOR SELECT USING (true);

-- ============================================================
-- RLS POLICIES -- NOTIFICATIONS
-- NOTE: ALL policies without WITH CHECK don't work for INSERT.
-- Explicit INSERT policy for authenticated users added alongside.
-- ============================================================
CREATE POLICY "Users can manage own notifications" ON notifications FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users can insert own notifications" ON notifications FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- ============================================================
-- RLS POLICIES -- NOTIFICATION PREFERENCES
-- NOTE: ALL policies without WITH CHECK don't work for INSERT.
-- Explicit INSERT policy for authenticated users added alongside.
-- ============================================================
CREATE POLICY "Users can manage own preferences" ON notification_preferences FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users can insert own notification preferences" ON notification_preferences FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- ============================================================
-- RLS POLICIES -- OWNER SUBSCRIPTIONS
-- ============================================================
CREATE POLICY "Owners can read own subscription" ON owner_subscriptions FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY "Admins can read all subscriptions" ON owner_subscriptions FOR SELECT USING (
    is_admin()
);

-- ============================================================
-- RLS POLICIES -- BILLING HISTORY
-- ============================================================
CREATE POLICY "Owners can read own billing" ON billing_history FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY "Admins can read all billing" ON billing_history FOR SELECT USING (
    is_admin()
);

-- ============================================================
-- RLS POLICIES -- SUBSCRIPTION FEATURES
-- ============================================================
CREATE POLICY "Owners can read own features" ON subscription_features FOR SELECT USING (owner_id = auth.uid());

-- ============================================================
-- RLS POLICIES -- RENT PAYMENTS
-- NOTE: UPDATE policies existed but INSERT was missing.
-- Explicit INSERT policies for authenticated added alongside.
-- ============================================================
CREATE POLICY "Tenants can read own payments" ON rent_payments FOR SELECT USING (tenant_id = auth.uid());
CREATE POLICY "Tenants can insert own rent payments" ON rent_payments FOR INSERT TO authenticated WITH CHECK (tenant_id = auth.uid());
CREATE POLICY "Owners can read own received payments" ON rent_payments FOR SELECT USING (owner_id = auth.uid());
CREATE POLICY "Owners can insert own received rent payments" ON rent_payments FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owners can update own received payments" ON rent_payments FOR UPDATE USING (owner_id = auth.uid());

-- ============================================================
-- RLS POLICIES -- UPI MANDATES
-- NOTE: ALL policies without WITH CHECK don't work for INSERT.
-- Explicit INSERT policy for authenticated tenants added alongside.
-- ============================================================
CREATE POLICY "Tenants can manage own mandates" ON upi_mandates FOR ALL USING (tenant_id = auth.uid());
CREATE POLICY "Tenants can insert own upi mandates" ON upi_mandates FOR INSERT TO authenticated WITH CHECK (tenant_id = auth.uid());
CREATE POLICY "Owners can read tenant mandates" ON upi_mandates FOR SELECT USING (owner_id = auth.uid());

-- ============================================================
-- RLS POLICIES -- CONTACT ATTEMPTS
-- ============================================================
CREATE POLICY "Admins can read contact attempts" ON contact_attempts FOR SELECT USING (
    is_admin()
);

-- ============================================================
-- RLS POLICIES -- PUSH TOKENS
-- NOTE: ALL policies without WITH CHECK don't work for INSERT.
-- Explicit INSERT policy for authenticated users added alongside.
-- ============================================================
CREATE POLICY "Users can manage own push tokens" ON user_push_tokens FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users can insert own push tokens" ON user_push_tokens FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- ============================================================
-- RLS POLICIES -- AUDIT LOGS
-- ============================================================
CREATE POLICY "Admins can read audit logs" ON audit_logs FOR SELECT USING (
    is_admin()
);

-- ============================================================
-- RLS POLICIES -- MAINTENANCE REQUESTS
-- NOTE: ALL policies without WITH CHECK don't work for INSERT.
-- Explicit INSERT policy for authenticated tenants added alongside.
-- ============================================================
CREATE POLICY "Tenants can read own requests" ON maintenance_requests FOR SELECT USING (tenant_id = auth.uid());
CREATE POLICY "Tenants can create requests" ON maintenance_requests FOR INSERT WITH CHECK (tenant_id = auth.uid());
CREATE POLICY "Tenants can insert own maintenance requests" ON maintenance_requests FOR INSERT TO authenticated WITH CHECK (tenant_id = auth.uid());
CREATE POLICY "Owners can read property requests" ON maintenance_requests FOR SELECT USING (
    EXISTS (SELECT 1 FROM properties p WHERE p.id = maintenance_requests.property_id AND p.owner_id = auth.uid())
);
CREATE POLICY "Owners can update property requests" ON maintenance_requests FOR UPDATE USING (
    EXISTS (SELECT 1 FROM properties p WHERE p.id = maintenance_requests.property_id AND p.owner_id = auth.uid())
);

-- ============================================================
-- RLS POLICIES -- PRODUCT TABLES
-- ============================================================
CREATE POLICY "product_categories_select" ON product_categories FOR SELECT USING (true);
CREATE POLICY "product_items_select" ON product_items FOR SELECT USING (true);
CREATE POLICY "product_variants_select" ON product_variants FOR SELECT USING (true);
CREATE POLICY "product_skus_select" ON product_skus FOR SELECT USING (true);
CREATE POLICY "product_custom_fields_select" ON product_custom_fields FOR SELECT USING (true);
CREATE POLICY "product_custom_values_select" ON product_custom_values FOR SELECT USING (true);

-- ============================================================
-- RLS POLICIES -- ORDER TABLES
-- ============================================================
CREATE POLICY "order_headers_customer_select" ON order_headers FOR SELECT USING (true);
CREATE POLICY "order_headers_customer_insert" ON order_headers FOR INSERT WITH CHECK (true);
CREATE POLICY "order_headers_customer_update" ON order_headers FOR UPDATE USING (true);
CREATE POLICY "order_items_customer_select" ON order_items FOR SELECT USING (true);
CREATE POLICY "order_items_customer_insert" ON order_items FOR INSERT WITH CHECK (true);

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_properties_updated_at BEFORE UPDATE ON properties
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_units_updated_at BEFORE UPDATE ON units
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_listings_updated_at BEFORE UPDATE ON listings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_community_posts_updated_at BEFORE UPDATE ON community_posts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_owner_subscriptions_updated_at BEFORE UPDATE ON owner_subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_rent_payments_updated_at BEFORE UPDATE ON rent_payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_upi_mandates_updated_at BEFORE UPDATE ON upi_mandates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_maintenance_requests_updated_at BEFORE UPDATE ON maintenance_requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_soft_block_states_updated_at BEFORE UPDATE ON soft_block_states
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION recalc_property_stats()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE properties
    SET
        total_units = (SELECT COUNT(*) FROM units WHERE property_id = COALESCE(NEW.property_id, OLD.property_id)),
        occupied_units = (SELECT COUNT(*) FROM units WHERE property_id = COALESCE(NEW.property_id, OLD.property_id) AND status = 'occupied')
    WHERE id = COALESCE(NEW.property_id, OLD.property_id);
    RETURN COALESCE(NEW, OLD);
END;
$$ language 'plpgsql';

CREATE TRIGGER update_property_unit_count AFTER INSERT OR UPDATE OR DELETE ON units
    FOR EACH ROW EXECUTE FUNCTION recalc_property_stats();

-- ============================================================
-- END OF SCHEMA
-- ============================================================
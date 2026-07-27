# Bhavan - Renter Platform

## 1. Project Description
Bhavan is a platform that connects renters with landlords and fellow tenants across India. It offers verified property listings, rent management tools, and a supportive community for Indian renters. Target users include renters searching for homes in major Indian cities, landlords listing properties, and tenants seeking community support.

## 2. Page Structure
- `/` - Home (hero, features, featured listings, community preview, CTA)
- `/listings` - Property Listings (browse, search, filter properties)
- `/listings/:id` - Listing Detail (full property page with gallery, landlord card, request-to-connect)
- `/community` - Community (forum, discussions, tenant support)
- `/about` - About Us (company story, mission, team)
- `/contact` - Contact (contact form, info, FAQ)
- `/login` - Login page
- `/signup` - Signup page
- `/tenant-profile` - **Tenant Home** — consolidated dashboard with 5 tabs: Overview, Saved Listings, My Inquiries, Documents (generators + files), Settings
- `/owner-profile` - **Owner Home** — consolidated dashboard with 10 tabs: Overview, Properties, Listings, Tenants, Inquiries, Messages, Requests, Documents, **Billing**, Settings
- `/list-property` - Property listing form
- `/aadhaar-verify` - Aadhaar identity verification
- `/feedback` - Reviews and feedback
- `/tax-forms` - Tax & legal forms hub (split owner/tenant views)
- `/rent-receipts` - Rent Receipt Generator (create, preview, history, share with tenant)
- `/rental-agreements` - Rental Agreement Generator (create, preview, history, share with tenant)
- `/scan/:id` - QR code scan landing page with rate limit enforcement
- `/how-it-works` - How the platform works
- `/notifications` - Notification center
- `/track-requests` - Tenant maintenance request tracking
- `/landlord-dashboard` - Landlord analytics dashboard
- `/rent-management` - Rent & lease management tools (reminders, rent storage, document verification, messaging)
- `/subscription` - **Subscription Plans** — Free vs Pro pricing, upgrade flow, plan comparison (landlords only)
- `/admin` - **Admin Dashboard** — overview cards with pending counts, recent activity feed, quick links to moderation queues
- `/admin/broker-reports` - **Broker Report Moderation** — review, investigate and resolve landlord-reported broker activity
- `/admin/verification` - **Aadhaar Verification Queue** — review and approve/reject submitted Aadhaar identity requests
- `/admin/community` - **Community Moderation** — review flagged posts, hide/restore posts, dismiss reports
- `/403` - **Forbidden** — access denied page for unauthorized navigation attempts
- `/404` - **Not Found** — catch-all 404 page for unmatched routes
- `/500` - **Server Error** — generic error page with refresh CTA and error ID
- `/soft-block` - **Account Restriction** — standalone soft block resolution page for tenants

## 3. Core Features
- [x] User authentication (login/signup) — mock auth context ready, Supabase-ready
- [x] Role-based profiles (Tenant Home + Owner Home consolidated dashboards)
- [x] Maintenance request system (submit, track, inline owner management)
- [x] Aadhaar verification flow
- [x] Property listings with search and filter
- [x] Rent management informational tools + generators (Receipt + Agreement)
- [x] Community forum and discussions
- [x] Contact form
- [x] Responsive design
- [x] Rental Agreement Generator with print/share
- [x] Rent Receipt Generator with print/share
- [x] **Tenant Contact Rate Limiting** — 3-layer anti-bypass system (Layer 1: client-side localStorage + device fingerprinting; Layer 2: device fingerprinting with Canvas/WebGL/screen/timezone keyed storage that survives incognito; Layer 3: Supabase Edge Functions with IP throttling + `contact_attempts` table). Limits: 5 daily / 20 weekly per user; 3 daily / 10 weekly per device; 15 daily / 60 weekly per IP. Server-enforced limits take precedence when Supabase is connected. UI shows "Server-enforced" badge on counter displays.
- [x] **Broker Reporting System** — owners can report tenants as brokers; 2 reports in 48h triggers soft block
- [x] **Soft Block Resolution** — re-verify Aadhaar + provide additional details
- [x] **Split-pane Messaging (ChatTab)** — owner Messages tab with conversation list + threaded chat, pre-select from Inquiries, plus Report Tenant button in header
- [x] **Inquiry Management (InquiriesTab)** — approve/decline/report broker, filter by status, "Open Chat" button
- [x] **Tax Forms Split View** — owner Schedule HP calculator + ITR-2 guide; tenant HRA calculator + ITR-1 guide
- [x] **QR Analytics** — scan tracking per listing with 7-day mini charts
- [x] **Notification Center** — read/unread states with category filters
- [x] **Subscription & Billing** — Free vs Pro tiers, Razorpay integration, billing history, auto-renewal, grace period
- [x] **Rent Payment Integration** — UPI AutoPay, UPI QR, bank transfer, offline payment logging, payment failure handling, reconciliation panel
- [x] **Unit-Level Management** — Units table with per-unit rent, tenant, maintenance, agreement, and payment status. Integrated into owner profile Properties tab with unit breakdown table
- [x] **Push Notifications** — Browser push via Firebase Cloud Messaging with SMS and email fallback for critical events. Delivery status tracking per notification. Channel preferences in owner/tenant settings.
- [x] **Owner Rate Limits** — Inquiry responses (50/day, 200/week), chat messages (100/day, 500/week), community posts (5/day, 15/week). All with UI banners, progress bars, and toast feedback.
- [x] **Scan Landing Rate Limit Counter** — daily/weekly contact counter visible before clicking "Request to Connect"
- [x] **Report Tenant in Messages** — broker reporting available from chat header, same flow as Inquiries tab
- [ ] Real Supabase auth integration (Phase 2)
- [ ] Real database for listings, maintenance, profiles (Phase 3)

## 4. Owner Subscription Model (Free vs Pro)

### 4.1 Overview
Bhavan runs a **Freemium subscription model exclusively for Property Owners / Landlords**. Tenants never pay. Owners start on a generous Free tier and upgrade to Pro for advanced tools.

### 4.2 Free Tier
**Cost:** ₹0 (forever free)

**Included:**
- Unlimited active properties
- Unlimited active listings
- Unlimited tenant inquiries per month
- Basic landlord dashboard with simple metrics
- Standard property listing with photos and description
- QR code generation for listings
- Basic maintenance request tracking
- Standard chat with approved tenants
- Community access
- Email notifications for new inquiries

**Limitations:**
- No advanced analytics (revenue trends, conversion rates, tenant retention)
- No automated rent reminders or recurring rent collection
- No priority support
- No bulk rent receipt generation
- No advanced tax form auto-filling
- No custom branded listing URLs
- Listings show "Free" badge to tenants

### 4.3 Pro Tier
**Cost:** ₹199/month or ₹999/year (~58% savings with annual)

**Everything in Free, plus:**
- Advanced Analytics Dashboard (revenue trends, conversion funnel, listing rankings, maintenance resolution metrics)
- Automated Rent Management (auto-reminders, lease expiry alerts, bulk receipt generation)
- Priority listing placement in search results
- "Verified Pro Landlord" badge on listings and profile
- Custom branded listing URLs (`bungalow.app/l/[slug]`)
- Auto-filled Schedule HP + one-click ITR-2 generation
- Priority email support (4-hour response)
- Dedicated account manager for 5+ properties
- No ads on landlord dashboard
- Export data to CSV/Excel

### 4.4 Razorpay Subscription Integration
- **Gateway:** Razorpay (UPI, cards, net banking, wallets)
- **Token Field:** `razorpay_subscription_id` stored in `owner_subscriptions` table
- **Flow:** Owner selects plan → Razorpay checkout modal → payment → webhook updates status to `active` → immediate Pro access

**Subscription Status States:**
- `trial` — 7-day free trial for new landlords
- `active` — Paid Pro subscription is current
- `past_due` — Payment failed, 7-day grace period
- `cancelled` — Owner cancelled, reverts to Free at period end
- `expired` — Grace period lapsed, reverts to Free immediately

### 4.5 Billing History
- Stored in `billing_history` table, linked to `owner_subscriptions`
- Invoice number format: `BGL-YYYY-0001`
- Amount stored in paise (₹19900 for ₹199)
- GST at 18% (IGST) tracked separately
- Status: `paid`, `failed`, `refunded`, `pending`
- Downloadable PDF per invoice
- Billing tab in owner profile shows full history with filters

### 4.6 Auto-Renewal Logic
- **Default:** All Pro subscriptions auto-renew by default
- **Notification:** Email sent 3 days before renewal
- **Failure Handling:**
  - 1st failure → retry after 24 hours
  - 2nd failure → email with "Update Payment Method" link
  - 3rd failure → status becomes `past_due`
  - After 7 days in `past_due` → status becomes `expired`, reverts to Free
- **Owner Control:** Toggle auto-renewal on/off in Billing tab settings

### 4.7 Grace Period
- **Duration:** 7 days after failed renewal payment
- **Behavior:** Owner retains full Pro access during grace period
- **UI:** Banner at top of dashboard — "Payment failed — update your payment method within 7 days to keep Pro access"
- **After Grace Period:**
  - Status becomes `expired`, reverts to Free immediately
  - All properties and listings remain fully accessible
  - No content is hidden or deactivated upon downgrade

## 5. Data Model Design

### Table: users
| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| email | text | User email |
| name | text | User full name |
| role | text | renter, landlord, or admin |
| phone | text | Phone number |
| verified_email | boolean | Email verification status |
| verified_phone | boolean | Phone verification status |
| verified_aadhaar | boolean | Aadhaar verification status |
| avatar_url | text | Profile image URL |
| created_at | timestamp | Account creation date |
| updated_at | timestamp | Last update |

### Table: properties
| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| owner_id | uuid | FK to users |
| name | text | Property name |
| address | text | Full address |
| city | text | City name |
| total_units | integer | **Derived** — count of units linked to this property (auto-calculated from Units table) |
| occupied_units | integer | **Derived** — count of units where status = 'occupied' (auto-calculated from Units table) |
| monthly_income | integer | Total monthly rent |
| verification_doc_url | text | Ownership proof |
| verified | boolean | Ownership verified |
| created_at | timestamp | Created date |

### Table: units
| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| property_id | uuid | FK to properties |
| unit_number | text | Flat/unit identifier |
| rent_amount | integer | Monthly rent for this unit |
| maintenance_charge | integer | Monthly maintenance for this unit |
| status | text | vacant, occupied, under_maintenance |
| tenant_id | uuid | FK to users (nullable) |
| tenant_name | text | Cached tenant display name |
| lease_start | date | Lease start date |
| lease_end | date | Lease end date |
| agreement_generated | boolean | Agreement exists |
| last_payment_status | text | paid, pending, failed, overdue, null |
| created_at | timestamp | Record creation |
| updated_at | timestamp | Last update |

### Table: listings
| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| property_id | uuid | FK to properties |
| owner_id | uuid | FK to users |
| title | text | Property title |
| description | text | Property description |
| price | integer | Monthly rent |
| deposit | integer | Security deposit |
| maintenance_charge | integer | Monthly maintenance |
| location | text | Address / area |
| city | text | City |
| bedrooms | integer | Number of BHK |
| bathrooms | integer | Number of baths |
| area_sqft | integer | Property area |
| furnished | boolean | Furnished status |
| property_type | text | apartment, house, room, villa |
| images | text[] | Image URLs |
| amenities | text[] | Amenity strings |
| status | text | active, inactive, draft |
| verified | boolean | Listing verified |
| views_count | integer | Total views |
| inquiries_count | integer | Total inquiries |
| saves_count | integer | Total bookmarks |
| created_at | timestamp | Listing date |
| updated_at | timestamp | Last update |

### Table: connection_requests (inquiries)
| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| tenant_id | uuid | FK to users (tenant) |
| listing_id | uuid | FK to listings |
| owner_id | uuid | FK to users (landlord) |
| message | text | Tenant's message |
| status | text | pending, approved, declined |
| created_at | timestamp | Request date |
| responded_at | timestamp | Response date |

### Table: contact_attempts
| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | FK to users (nullable — for non-authenticated attempts) |
| device_fingerprint | text | Browser device fingerprint (Canvas/WebGL/screen/timezone) |
| ip_address | text | Client IP address from request headers |
| listing_id | uuid | FK to listings (nullable) |
| created_at | timestamp | Attempt timestamp |

### Table: chat_messages
| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| request_id | uuid | FK to connection_requests |
| sender | text | tenant, landlord |
| text | text | Message content |
| read | boolean | Read status |
| created_at | timestamp | Sent date |

### Table: broker_reports
| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| tenant_id | uuid | FK to users (reported tenant) |
| owner_id | uuid | FK to users (reporting owner) |
| listing_id | uuid | FK to listings (optional) |
| reason | text | broker, commission, competing_listings, refused_identity, other |
| reason_text | text | Additional details |
| created_at | timestamp | Report date |

### Table: soft_block_states
| Field | Type | Description |
|-------|------|-------------|
| tenant_id | uuid | Primary key (FK to users) |
| active | boolean | Whether soft block is currently active |
| triggered_at | timestamp | When the soft block was triggered |
| aadhaar_re_verified | boolean | Step 1 completed |
| additional_details_provided | boolean | Step 2 completed |
| details | jsonb | Employer, company, reference, purpose |

### Table: community_posts
| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| title | text | Post title |
| content | text | Post content |
| author_id | uuid | FK to users |
| category | text | discussion, advice, review, event, general |
| created_at | timestamp | Post date |
| updated_at | timestamp | Last edit |

### Table: community_comments
| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| post_id | uuid | FK to community_posts |
| author_id | uuid | FK to users |
| content | text | Comment text |
| created_at | timestamp | Comment date |

### Table: saved_listings
| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | FK to users |
| listing_id | uuid | FK to listings |
| created_at | timestamp | Saved date |

### Table: documents
| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | FK to users |
| type | text | agreement, aadhaar, receipt, checklist, utility_bill, other |
| title | text | Document name |
| file_url | text | Document URL |
| status | text | active, verified, pending, expired |
| created_at | timestamp | Upload date |

### Table: qr_analytics
| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| listing_id | uuid | FK to listings |
| scan_date | date | Date of scan |
| scans_count | integer | Number of scans that day |
| messages_sent | integer | Inquiries generated from scans |

### Table: notifications
| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | FK to users |
| type | text | maintenance, inquiry, lease, payment, platform |
| title | text | Notification headline |
| message | text | Details |
| read | boolean | Read status |
| push_delivered | boolean | FCM receipt confirmed |
| sms_delivered | boolean | SMS provider webhook confirmed |
| email_delivered | boolean | Email provider webhook confirmed |
| read_at | timestamp | When user opened in-app notification |
| action_url | text | Link to relevant page |
| created_at | timestamp | Notification date |

### Table: owner_subscriptions
| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| owner_id | uuid | FK to users (landlord only) |
| plan | text | free, pro_monthly, pro_annual |
| status | text | trial, active, past_due, cancelled, expired |
| razorpay_subscription_id | text | Razorpay subscription ID |
| razorpay_customer_id | text | Razorpay customer ID |
| current_period_start | timestamp | Start of current billing period |
| current_period_end | timestamp | End of current billing period |
| trial_ends_at | timestamp | Trial expiry (null if not in trial) |
| cancel_at_period_end | boolean | Whether to cancel at period end |
| created_at | timestamp | Subscription creation date |
| updated_at | timestamp | Last update |

### Table: billing_history
| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| owner_id | uuid | FK to users |
| subscription_id | uuid | FK to owner_subscriptions |
| invoice_number | text | Unique invoice number (e.g., BGL-2026-0001) |
| plan | text | free, pro_monthly, pro_annual |
| amount | integer | Amount in paise (₹19900 for ₹199) |
| gst_amount | integer | GST in paise (18% of amount) |
| total_amount | integer | Total including GST |
| currency | text | INR |
| status | text | paid, failed, refunded, pending |
| razorpay_payment_id | text | Razorpay payment ID |
| razorpay_invoice_id | text | Razorpay invoice ID (optional) |
| billing_period_start | date | Period start |
| billing_period_end | date | Period end |
| paid_at | timestamp | Payment completion time |
| created_at | timestamp | Invoice creation date |

### Table: subscription_features (Feature Flags)
| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| owner_id | uuid | FK to users |
| feature_key | text | e.g., "analytics", "auto_reminders", "bulk_receipts" |
| enabled | boolean | Whether the feature is active for this owner |
| source | text | plan, addon, trial |
| expires_at | timestamp | When the feature access expires (null = never) |
| created_at | timestamp | Feature grant date |

### Table: rent_payments
| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| tenant_id | uuid | FK to users (tenant) |
| property_id | uuid | FK to properties |
| property_unit_id | uuid | FK to units (specific flat/unit) |
| owner_id | uuid | FK to users (landlord) |
| amount | integer | Paid amount in paise |
| month | text | Payment month (e.g., "May 2026") |
| payment_mode | text | upi_autopay, upi_qr, bank_transfer, cash, cheque, razorpay_recurring |
| transaction_ref | text | UPI ref / NEFT ID / cheque no |
| status | text | paid, pending, failed, refunded, reconciled |
| razorpay_payment_id | text | Razorpay payment ID |
| failure_reason | text | Why payment failed |
| receipt_url | text | Generated receipt PDF URL |
| reconciled_at | timestamp | When landlord matched bank statement |
| reconciliation_note | text | Landlord note during reconciliation |
| created_at | timestamp | Payment record date |
| updated_at | timestamp | Last update |

### Table: upi_mandates
| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| tenant_id | uuid | FK to users |
| owner_id | uuid | FK to users (landlord) |
| property_id | uuid | FK to properties |
| upi_id | text | Tenant's UPI ID |
| bank_account | text | Linked bank account (masked) |
| mandate_amount | integer | Auto-debit amount in paise |
| frequency | text | monthly |
| start_date | date | Activation date |
| end_date | date | Expiry date |
| status | text | active, paused, cancelled, expired |
| razorpay_token | text | Razorpay token reference |
| created_at | timestamp | Creation date |
| updated_at | timestamp | Last update |

### Table: contact_attempts
| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | FK to users (nullable — for non-authenticated attempts) |
| device_fingerprint | text | Browser device fingerprint (Canvas/WebGL/screen/timezone) |
| ip_address | text | Client IP address from request headers |
| listing_id | uuid | FK to listings (nullable) |
| created_at | timestamp | Attempt timestamp |

### Table: user_push_tokens
| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | FK to users |
| fcm_token | text | Firebase Cloud Messaging token |
| device_name | text | Browser / OS label |
| active | boolean | Whether token is currently valid |
| created_at | timestamp | Token creation |
| updated_at | timestamp | Last update |

### Table: audit_logs
| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | FK to users (who performed the action) |
| action | text | create, update, delete, login, logout, report, block, verify, payment |
| table_name | text | Target table affected |
| record_id | uuid | Primary key of affected record |
| before | jsonb | Snapshot before change (null for create) |
| after | jsonb | Snapshot after change (null for delete) |
| ip_address | text | Client IP at time of action |
| user_agent | text | Browser user agent |
| created_at | timestamp | Action timestamp |

## 5. Backend / Third-party Integration Plan
- Supabase: User authentication, database for users, listings, community posts, chat messages, broker reports, rent payments, UPI mandates, saved listings, documents, notifications, QR analytics
- Shopify: Not needed
- Stripe: Not needed
- **Razorpay:** Subscription billing for landlord Pro tier + rent payment processing (UPI AutoPay, recurring payments, payment links/QR), webhook-driven status updates

## 6. Development Phase Plan

### Phase 1: Core Website UI + Trust & Safety + Subscriptions + Rent Payments (COMPLETED)
**Goal:** Build all page UIs with mock data, shared navigation and footer, plus trust & safety, subscription, and rent payment features.
**Deliverables:**
- Home, Listings, Listing Detail, About, Contact, Community, How It Works, Feedback, Scan Landing pages
- Tenant Home (5 tabs: Overview, Saved Listings, My Inquiries, Documents, Settings)
- Owner Home (10 tabs: Overview, Properties, Listings, Tenants, Inquiries, Messages, Requests, Documents, **Billing**, Settings)
- Landlord Dashboard, Lease Management, Track Requests, Notifications, Tax Forms (split owner/tenant)
- Aadhaar Verification flow with OCR extraction, name matching (80% fuzzy threshold), IDfy/Signzy provider (Karza/Digilocker fallback), masking rules (last 4 digits only, masked hash for duplicate detection), retry logic (3 attempts per 24h), and 6 failure states (Blurry Image, Name Mismatch, Invalid Aadhaar, Already Used, Provider Error, Expired Session)
- List Property form, Login/Signup
- Rate limiting hook (`useContactRateLimit`) — 3-layer anti-bypass system: client-side localStorage per user + device fingerprinting (Canvas/WebGL/screen/timezone keyed storage that survives incognito mode), plus Supabase Edge Functions (`check-contact-limit` + `record-contact`) with IP throttling and `contact_attempts` table. Limits: 5 daily / 20 weekly per user; 3 daily / 10 weekly per device; 15 daily / 60 weekly per IP. Server-enforced limits take precedence when Supabase is connected.
- Broker reporting hook (`useBrokerReport`) — soft block on 2 reports in 48h
- SoftBlockModal — Aadhaar re-verification + additional details form
- ReportBrokerModal — broker report reason selection (used in Inquiries and Messages tabs)
- ChatTab — split-pane messaging with pre-select from Inquiries, plus Report Tenant button in header
- **Owner Rate Limits** — inquiry responses (50/day, 200/week), chat messages (100/day, 500/week), community posts (5/day, 15/week) with UI banners, progress bars, and toast feedback
- **Push Notifications** — browser push via Firebase Cloud Messaging with SMS and email fallback, delivery status tracking per notification, channel preferences in owner/tenant settings
- **Subscription system:**
  - `/subscription` pricing page with plan comparison and checkout flow
  - Billing tab in owner profile with invoice history, download, and settings
  - Pro badge on owner profile, listing cards, and landlord info panels
  - Grace period banner on dashboard when payment fails
  - `useSubscription` hook for tier checking and feature access
  - Mock subscription data with fallback when Supabase is not connected
  - Owner Subscription Model (Free vs Pro): Free (unlimited properties, listings, and inquiries) vs Pro (₹199/mo or ₹999/year, advanced analytics + auto-reminders + priority placement + Pro badge + custom URLs + auto-filled tax forms + priority support + data export)
  - Razorpay subscription integration with token field, status states (trial, active, past_due, cancelled, expired), auto-renewal logic, and 7-day grace period
- **Rent Payment Integration:**
  - `/rent-payment` page with UPI AutoPay, UPI QR, bank transfer, and offline payment methods
  - Payment history table with status badges and receipt download
  - Payment failure banner with retry CTA and failure reason
  - Reconciliation panel for landlords to match bank entries
  - `useRentPayment` hook for payment CRUD and mandate management
  - Mock rent payment and UPI mandate data with Supabase fallback
  - `rent_payments` table includes `property_unit_id` FK → units for unit-level payment tracking
- **Unit-Level Management** — Units table with per-unit rent, tenant, maintenance, agreement, and payment status. `total_units` and `occupied_units` on Properties table are **derived fields** auto-calculated from the Units table
- Mock data for all features, responsive design across all pages

### Phase 2: Supabase Authentication
**Goal:** Connect real user authentication with role-based access.
**Deliverables:**
- Supabase project setup, email/password auth integration
- User sessions, protected routes, profile data from `users` table
- Logout and password reset flows

### Phase 3: Dynamic Data & Database
**Goal:** Replace mock data with real Supabase database.
**Deliverables:**
- Properties, Listings, Tenants tables with RLS policies
- Maintenance request CRUD with real persistence
- Connection requests (inquiries) system with real approve/decline
- Saved listings functionality
- Document upload and management (Supabase Storage)
- Notification system with deep-linking
- Community posts and comments persistence
- Chat messages table with real-time subscriptions
- Broker reports table with admin review queue
- Subscription system tables (`owner_subscriptions`, `billing_history`, `subscription_features`) with RLS
- Rent payment tables (`rent_payments`, `upi_mandates`) with RLS
- Rate limiting tables (`contact_attempts`) + Edge Functions (`check-contact-limit` + `record-contact`)
- Push notification tables (`user_push_tokens`) for FCM device registration
- Audit logging table (`audit_logs`) with before/after JSON snapshots for moderation and fraud detection
- Razorpay webhook endpoint (Edge Function) for payment + subscription status sync

### Phase 4: Advanced Features
**Goal:** Add real-time messaging, QR codes, analytics, and polish.
**Deliverables:**
- Real-time chat via Supabase realtime (tenant ↔ landlord)
- QR code generation with server-side rendering
- Rent receipt PDF generation (Edge Function)
- Tax form PDF generation with actual calculations
- Search indexing for listings (Postgres full-text search)
- Admin moderation dashboard for broker reports, Aadhaar verifications, and community content

### Phase 5: Testing & Launch Prep
**Goal:** Quality assurance and production readiness.
**Deliverables:**
- Cross-browser testing, mobile responsiveness verification
- Performance optimization, SEO audit
- Security audit (RLS policies review, input sanitization)
- Production deployment

## Data Layer — Connected to Readdy Supabase ✅

**Status:** Connected to Readdy Supabase
**Environment Variables:** `.env` configured with `VITE_PUBLIC_SUPABASE_URL` and `VITE_PUBLIC_SUPABASE_ANON_KEY`

### Tables Created (31 total)
All 24 core Bhavan tables exist in the database:
1. `users` — User profiles with roles
2. `properties` — Landlord properties
3. `units` — Individual property units
4. `listings` — Public rental listings
5. `connection_requests` — Tenant-to-landlord inquiries
6. `chat_messages` — Messaging between parties
7. `broker_reports` — Fraud/broker reports
8. `soft_block_states` — Trust & safety blocks
9. `community_posts` — Community discussions
10. `community_comments` — Post comments
11. `saved_listings` — Tenant bookmarks
12. `documents` — Uploaded documents
13. `qr_analytics` — QR scan tracking
14. `notifications` — User notifications
15. `notification_preferences` — Delivery channel prefs
16. `owner_subscriptions` — Premium plans
17. `billing_history` — Invoice records
18. `subscription_features` — Feature flags
19. `rent_payments` — Rent transaction records
20. `upi_mandates` — Auto-pay setups
21. `contact_attempts` — Rate limit tracking
22. `user_push_tokens` — Push notification tokens
23. `audit_logs` — Security audit trail
24. `maintenance_requests` — Maintenance tickets
25-31. Product/order tables (auto-created by platform):
    - `product_categories`, `product_items`, `product_variants`, `product_skus`, `product_custom_fields`, `product_custom_values`, `order_headers`, `order_items`

### Row Level Security (RLS)
All 31 tables have RLS enabled with 70+ policies covering:
- Users: self-read/self-update, public read (for anon), admin-read-all
- Properties: owner-full-access, tenant-read-all
- Listings: public-read-active, owner-full-access
- Connection Requests: tenant-own, owner-own
- Chat: both parties in conversation
- Community: public-read, auth-create, author-edit/delete
- Billing & Subscriptions: owner-own, admin-read-all
- Contact Attempts: admin-only
- Notifications/Prefs/Tokens: user-own
- Maintenance: tenant-own-create, owner-property-access
- Saved Listings: user-own
- Documents: user-own
- QR Analytics: public-read
- Soft Blocks: tenant-own, admin-read-all
- Product tables: public select
- Order tables: public select/insert/update (no delete)

### Functions & Triggers
- `update_updated_at_column()` — Auto-updates `updated_at` on: users, properties, units, listings, community_posts, owner_subscriptions, rent_payments, upi_mandates, maintenance_requests
- `recalc_property_stats()` — Auto-calculates `total_units` and `occupied_units` on property changes

### Edge Functions Deployed
- `check-contact-limit` — Validates daily/weekly contact limits per user or device
- `record-contact` — Records a contact attempt for rate limiting

### Next Steps
1. Create remaining edge functions as features are built:
   - `send-notification` — Push/SMS/email dispatch
   - `generate-rent-receipt` — PDF receipt generation
   - `process-rent-payment` — Payment processing
   - `verify-aadhaar` — ID verification
   - `scan-qr-analytics` — QR code tracking
2. Add demo seed data for testing (use Supabase `execute_sql`)
3. Wire remaining hooks to real Supabase queries (some pages still in progress)
4. Implement real-time chat subscriptions via Supabase realtime

### Phase Status Update
- **Phase 1** (Core UI): ✅ Complete — All page UIs built with real Supabase data
- **Phase 2** (Supabase Auth): ✅ Complete — Supabase auth connected, `.env` configured, protected routes working
- **Phase 3** (Dynamic Data): 🔄 In Progress — Most tables wired to real queries. Remaining: chat real-time, document upload, notification deep-linking, community search indexing
- **Phase 4** (Advanced Features): ⏳ Not started
- **Phase 5** (Testing & Launch): ⏳ Not started

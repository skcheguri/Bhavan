# Bhavan - Renter Platform

## 1. Project Description
Bhavan is a platform that connects renters with landlords and fellow tenants across India. It offers verified property listings, rent management tools, and a supportive community for Indian renters. Target users include renters searching for homes in major Indian cities, landlords listing properties, and tenants seeking community support.

## 2. Page Structure
Full, verified-current route table lives in README.md ("Route Map") — kept there instead of duplicated here to avoid the two drifting apart again. Summary:
- Public: Home, Listings, Listing Detail, Community, About, Contact, How It Works, Feedback, legal pages (Terms/Privacy/Cookies/Accessibility), QR scan landing
- Auth: Login, Signup, OAuth callback, password reset
- Tenant Home (`/tenant-profile`) — consolidated dashboard: Overview, Saved Listings, My Inquiries, Documents, Settings
- Owner Home (`/owner-profile`) — consolidated dashboard: Overview, Properties, Listings, Tenants, Inquiries, Messages, Requests, Documents, Billing, Settings
- Document generators (`/rent-receipts`, `/rental-agreements`), `/tax-forms`, `/rent-payment`, `/subscription`, `/notifications`, `/list-property`, `/aadhaar-verify`
- Admin (`/admin/*`) — dashboard, broker-reports, verification, property-verification, community, users, listings, support, errors, login
- Error pages: `/403`, catch-all Not Found, `/500`

> `/landlord-dashboard`, `/rent-management`, `/track-requests`, and `/soft-block` from earlier planning were never built as standalone routes — that functionality lives inside the dashboard tabs and modals instead (e.g. soft-block resolution is a modal on `/tenant-profile` and `/listings/:id`, not its own page).

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
- [x] Real Supabase auth integration (Phase 2) — email/password, OTP phone verification, OAuth callback, password reset
- [x] Real database for listings, maintenance, profiles (Phase 3) — all 34 tables live, `src/mocks/` fully removed
- [x] **Legal pages** — Terms, Privacy, Cookies, Accessibility (`/terms`, `/privacy`, `/cookies`, `/accessibility`)
- [x] **Client error logging** — uncaught errors + error-boundary catches logged to `client_error_logs`, viewable at `/admin/errors`
- [x] **CI pipeline** — GitHub Actions runs typecheck/lint/test/build on every push
- [x] **Route-based code splitting** — cut the single ~1.3MB bundle into per-route chunks
- [x] **Server-side rate limiting** — replaced client-only localStorage limits with Postgres triggers (`rate_limit_events` table) for community posts, inquiry responses, and the Contact form; the "Request to Connect" flow was already edge-function-enforced
- [x] **RLS hardening pass** — audited every owner/author-scoped table; found and fixed real write-tampering holes on `rent_payments`, `rental_agreements`, `connection_requests`, `maintenance_requests`, `community_posts`, `rent_receipts`, and `broker_reports` (migrations 047–053). Each has a checked-in regression script in `supabase/tests/`.
- [x] **Unit test coverage** — Razorpay signature verification, legal document generation (found and fixed a real timezone bug), device fingerprinting, form validation
- [ ] Aadhaar KYC provider keys (IDfy/Signzy) — integration code is built and edge function exists; live provider credentials are the user's responsibility to obtain
- [ ] E2E test coverage beyond auth + public pages (2 spec files exist; not run in CI, needs dedicated test accounts)

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
| role | text | `tenant`, `owner`, or `admin` (DB CHECK constraint — "renter"/"landlord" were the original naming, the actual column values are tenant/owner) |
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

## Data Layer — Live on Supabase ✅

**Status:** Connected to the linked Supabase project, evolved through 53 sequential migrations (`supabase/migrations/001` through `053`).
**Environment Variables:** `.env` configured with `VITE_PUBLIC_SUPABASE_URL` and `VITE_PUBLIC_SUPABASE_ANON_KEY`

> This section is a point-in-time summary. For the actual current schema, trust `supabase/migrations/` and the live database over this file — see the note in README.md's Data Model Summary.

### Tables (34 total, live schema)
The original 24-core + 7-product-table scaffold no longer reflects reality: the product/order tables were dropped entirely (migration `017_drop_dead_ecommerce_tables.sql`, they were never used — Bhavan doesn't sell physical products), and 11 tables were added since: `reviews`, `property_visits`, `vacation_bookings`, `rental_agreements`, `rent_receipts`, `aadhaar_verification_attempts`, `community_post_reports`, `contact_inquiries`, `client_error_logs`, `rate_limit_events`. See README.md's Data Model Summary for the full current list with notes on what each table's RLS now enforces.

### Row Level Security (RLS)
All 34 tables have RLS enabled. Beyond the original ownership-scoped policies (owner-full-access, tenant-own, admin-read-all, etc.), a dedicated hardening pass (migrations 047–053) found and closed real gaps where an owner/author-scoped policy allowed writes to *any* column on a row they owned, when the real UI only ever writes a specific subset:
- `rent_payments` — a tenant could self-insert a row already marked `'paid'`, bypassing Razorpay entirely
- `rental_agreements` — an owner could fake `signed_by_tenant = true`
- `connection_requests` — an owner could rewrite the tenant's message, listing snapshot, or reassign `tenant_id`
- `maintenance_requests` — an owner could rewrite the tenant's description/category/images or silently reprioritize
- `community_posts` — an author could unhide their own admin-moderated post
- `rent_receipts` — an owner could rewrite `rent_amount`/`tenant_name` after issuing a receipt
- `broker_reports` — an owner could submit a report pre-marked `'resolved'` with a fabricated `admin_note`

Each fix has a rollback-safe regression script checked into `supabase/tests/` (`rls_<table>.sql`) — run manually via `npx supabase db query --linked --file supabase/tests/rls_<table>.sql` after touching that table's policies.

### Functions & Triggers
- `update_updated_at_column()` — Auto-updates `updated_at` on most tables
- `recalc_property_stats()` — Auto-calculates `total_units` and `occupied_units` on property changes
- `is_admin()` — SECURITY DEFINER helper used by every admin-scoped policy (avoids RLS self-recursion on `users`)
- `check_and_record_rate_limit()` — Shared server-side rate-limit function backing `rate_limit_events`, used by triggers on `community_posts`, `connection_requests`, and `contact_inquiries`
- `enforce_*_immutable_fields()` / `enforce_*_no_self_unhide()` — The migration-047–053 hardening triggers listed above

### Edge Functions Deployed
- `check-contact-limit` / `record-contact` — Rate limiting for the public "Request to Connect" flow
- `create-rent-payment-order` / `verify-rent-payment` — Razorpay order creation + server-side HMAC signature verification (the signature logic itself is extracted to `src/lib/payments/razorpaySignature.ts` and unit-tested)
- `admin-suspend-user` — Admin-only account suspension via Auth Admin API
- `aadhaar-verify` — Aadhaar KYC submission handler (needs live IDfy/Signzy provider keys to be functional — code path exists, credentials don't)
- `send-sms-hook` — SMS delivery hook

### Next Steps
1. Obtain live Aadhaar KYC provider keys (IDfy or Signzy) — this is the one remaining hard blocker on the trust & safety story
2. Expand e2e coverage beyond auth + public pages (dedicated test accounts recommended, per `e2e/README.md`)
3. Legal page content (Terms/Privacy/Cookies/Accessibility) needs real registered-entity details and a lawyer review before launch — the pages exist but the copy is a placeholder
4. Consider restructuring the `properties`/`units` duplication flagged during the RLS/DB review (deferred, not urgent)

### Phase Status Update
- **Phase 1** (Core UI): ✅ Complete
- **Phase 2** (Supabase Auth): ✅ Complete
- **Phase 3** (Dynamic Data): ✅ Complete — all tables wired to real queries, `src/mocks/` removed entirely
- **Phase 4** (Advanced Features): 🔄 Mostly done — real-time chat, QR codes, and PDF-equivalent document generation all shipped; search indexing not built
- **Phase 5** (Testing & Launch): 🔄 In progress — CI pipeline, unit tests, and an RLS security hardening pass are done; e2e coverage is thin, Aadhaar KYC keys and legal review remain

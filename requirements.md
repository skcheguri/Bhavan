# Bhavan — Platform Requirements Document

> **Document status:** this spec was written during the original scaffold phase (mock data, "Readdy form service" submissions, Phase 1/2/3 planning) and describes intended behavior more than current implementation. Most of it is still an accurate description of *what the product should do*. It is **not** accurate on a few specific, now-corrected points, flagged inline below: the `src/mocks/` directory referenced throughout has been fully removed (all data is live Supabase), the Contact form and other forms are Supabase-backed rather than routed through a Readdy form service, and the data model is missing ~10 tables added since this was written. For the authoritative current table list, RLS behavior, and route map, see `README.md`'s Data Model Summary and Route Map — those are kept in sync with the live database and `supabase/migrations/`, which this document is not. Also since this was written: sign-in is now **universal** (no tenant/owner login picker; a new Google user picks a role on `/auth/callback`), the planned `/community` forum was removed for MVP and replaced by **Societies** (`/society`), and the schema now runs to migration 148 (adding vacation bookings, host payouts, the agreement signing/optional-stamp-duty flow, and "confirm as tenant"). See `HANDOVER.md` and `WORKFLOWS.md` for current state and as-built flows.

## 1. Product Overview

**Product Name:** Bhavan

**Tagline:** Verified rentals, seamless management, and a community for Indian renters and landlords.

**Target Users:**
- Renters / Tenants looking for verified properties in major Indian cities
- Property Owners / Landlords wanting to list and manage rentals
- The platform also serves as a community hub for tenant support and networking

**Core Value Proposition:**
- Verified property listings to reduce rental fraud
- Integrated rent management tools (receipts, reminders, tax forms)
- Maintenance request tracking for both tenants and landlords
- Aadhaar-based identity verification for trust and safety
- Community features for peer support and discussions
- Rate-limited tenant-to-landlord contact system with broker reporting

---

## 2. User Roles & Permissions

### 2.1 Tenant (Renter)
- Browse and search property listings
- Save / bookmark listings
- Submit maintenance requests
- Track request status
- View rent payment history and download receipts
- Manage personal profile and documents
- Participate in community discussions
- Send connection requests to landlords for listings (rate-limited: 5/day, 20/week)
- View HRA calculator and tenant-specific tax forms
- Receive notifications for maintenance updates, inquiry responses, lease reminders

### 2.2 Property Owner / Landlord
- List new properties with detailed specifications and images
- Manage existing property listings (edit, activate/deactivate, delete)
- View and respond to tenant inquiries and connection requests (approve/decline)
- Manage tenant records per property
- Track maintenance requests across all properties
- Access landlord dashboard for overview analytics
- Generate QR codes for listings to share with prospects
- Download tax forms and rent receipts
- Report tenants as brokers/agents
- Chat with approved tenants via Messages tab

### 2.3 Admin (Future)
- Verify Aadhaar submissions
- Moderate community content
- Review flagged listings and broker reports

---

## 3. Page Structure & Feature Requirements

### 3.1 Public Pages (No Authentication Required)

#### Home (`/`)
- Hero section with background image, headline, and primary CTA
- Featured properties section (3–4 highlighted listings)
- Feature highlights (verified listings, rent management, community)
- How it works section (3-step flow)
- Community preview (recent discussions)
- Call-to-action banner for landlords to list properties
- Footer with links, social icons, newsletter signup

#### Property Listings (`/listings`)
- Search bar with location autocomplete
- Filter panel: price range, bedrooms, bathrooms, property type, furnished status
- Sort options: price (low/high), newest, most viewed
- Grid/list toggle for results
- Property cards showing: image, price, location, specs, verified badge, landlord avatar
- Pagination or infinite scroll
- Empty state when no results

#### Listing Detail (`/listings/:id`)
- Image gallery / carousel for property photos
- Property title, price, location, full specs
- Furnished / unfurnished badge
- Landlord info card with avatar, name, verification status
- "Request to Connect" CTA with rate limit enforcement
- Property description, amenities list
- Location map (Google Maps embed)
- Similar listings section
- Share and save/bookmark actions
- Rate limit warning when tenant exceeds daily/weekly contact limits

#### About Us (`/about`)
- Company story and mission
- Team section (if applicable)
- Platform statistics (listings, users, cities)
- Partner/press logos (optional)

#### Contact (`/contact`)
- Contact form: name, email, phone, subject, message
- Office/location info
- FAQ accordion
- Social media links

#### How It Works (`/how-it-works`)
- Step-by-step guide for tenants
- Step-by-step guide for landlords
- Visual illustrations per step

#### Feedback & Reviews (`/feedback`)
- Display user reviews and ratings
- Submit review form (star rating + text)
- Filter by category (tenant experience, landlord experience, property quality)

#### Aadhaar Verification (`/aadhaar-verify`)
- Informational page about why Aadhaar verification matters
- Step-by-step verification flow
- FAQ accordion about privacy and data handling

#### Scan Landing (`/scan/:id`)
- Public-facing page loaded by scanning a property QR code
- Shows property summary, images, price, location
- "Request to Connect" CTA with rate limit enforcement
- Tracks scan analytics
- Rate limit warning banner when tenant exceeds limits

---

### 3.2 Authentication Pages

#### Login (`/login`)
- Email + password form
- "Remember me" option
- "Forgot password" link
- Link to signup page
- Social login (Google) — optional future enhancement

#### Signup (`/signup`)
- Role selection: Tenant or Property Owner
- Name, email, phone, password
- Terms & conditions checkbox
- Link to login page
- Aadhaar verification prompt after signup

---

### 3.3 Tenant Dashboard Pages (Authenticated)

#### Tenant Profile (`/tenant-profile`)
- **Header:** Cover image, avatar with initials, verified badge, name, role, member since, notification bell, edit profile toggle
- **Quick Stats Bar (clickable):** Current Flat, Lease Ends, Saved Listings → jumps to Saved tab, Documents → jumps to Documents tab
- **Tabs:**
  - **Overview:**
    - Personal Information card (editable inline) — view mode shows 10 fields: Full Name, Email, Phone, Date of Birth, Occupation, Emergency Contact, Current Flat, Move-In Date, Aadhaar (masked), Member Since
    - Edit mode: all 8 fields in a 2-column grid (Name, Email, Phone, DOB, Occupation, Emergency Contact, Move-In Date, Current Flat) with Save / Cancel
    - Right Sidebar: Verification Status (Email, Phone, Aadhaar, Rental Agreement), Quick Actions (Track Maintenance, Rent Tools, Write Review, Community), Lease Renewal card with countdown
  - **Saved Listings:** Bookmarked property cards with image, bookmark icon, verified badge, title, price, location, specs, landlord avatar, "View" button
  - **My Inquiries:** Connection requests sent to landlords with status tracking (pending/approved/declined)
  - **Documents:** Rental Agreement, Aadhaar Verification, Rent Receipts, Move-in Checklist cards with status badges and download option; Upload new document drop zone
  - **Settings:** Notification preference toggles (Maintenance, Rent Reminders, Lease, Community, Promos), Security (Change Password, 2FA), Danger Zone (Delete Account)
- **Lease Renewal Modal:** Days left countdown, lease details (start, end, rent, deposit, landlord), "Open Rent Tools" button, "Set Renewal Reminder" button

#### Track Maintenance Requests (`/track-requests`)
- List of submitted maintenance requests
- Status badges: Pending, In Progress, Completed, Rejected
- Request details: category, description, submitted date, priority
- Add new request button
- Timeline / history view

#### Notifications (`/notifications`)
- Notification list with read/unread states
- Categories: maintenance updates, inquiry responses, lease reminders, platform updates
- Mark all as read
- Click to navigate to relevant page

---

### 3.4 Owner Dashboard Pages (Authenticated)

#### Owner Profile (`/owner-profile`)
- **Header:** Cover image with gradient overlay, avatar, verified badge, "Property Owner" role, notification bell, "List Property" CTA, edit profile toggle
- **Quick Stats Bar:** Total Properties (live count), Active Listings, Monthly Income, Urgent Requests (red alert when > 0)
- **Urgent Alert Banner:** Auto-appears for high-priority maintenance requests, links to Requests tab
- **Tabs:**
  - **Overview:**
    - Personal Information card (editable inline) — view mode shows 10 fields: Full Name, Email, Phone, Date of Birth, Occupation, Emergency Contact, Current Flat, Move-In Date, Aadhaar (masked), Member Since
    - Edit mode: all 8 fields in a 2-column grid (Name, Email, Phone, DOB, Occupation, Emergency Contact, Move-In Date, Current Flat) with Save / Cancel
    - Right Sidebar: Verification Status (Email, Phone, Aadhaar, Property Documents), Quick Actions (List Property, Rent Tools, Tax Forms, Reviews, Community), Action Required banner for pending maintenance
  - **Properties:**
    - "Add Property" button → routes to `/list-property`
    - Property cards with building image, name, address, occupancy badge
    - Per-property stats: Total Units, Occupied, Monthly Income
    - **Unit Breakdown Table:** Inside each property card, a per-unit table shows: Unit Number, Status (vacant/occupied), Tenant Name, Rent Amount, Maintenance Charge, Agreement Generated (Yes/Pending), Last Payment Status (Paid/Failed/Overdue). Vacant units show "—" for tenant and payment status.
    - Edit property inline (name, address)
    - View Listings button → jumps to Listings tab filtered by that property
    - Delete property with confirmation modal
  - **My Listings:**
    - "Add Listing" button → `/list-property`
    - Property filter pills: "All" + one chip per property
    - Listing cards: image with hover zoom, Active/Inactive badge, title, price, location, specs, furnished tag, mini stats (Views, Inquiries, Saves)
    - Actions per listing: Edit, View, QR Code, Activate/Deactivate, Delete
    - Empty state when no listings
  - **Tenants:**
    - Data table with sortable columns: Tenant (avatar + name + verified badge), Flat, Property, Rent, Lease End, Status, Payment Status
    - View rental agreement per tenant
    - Click on tenant row to see payment history and next due date
  - **Inquiries:**
    - Connection requests from tenants with full card layout
    - Status management: Pending, Approved, Declined
    - Filter by status (All, Pending, Approved, Declined)
    - Approve/Decline with confirmation modal
    - "Open Chat" button on approved requests → navigates to Messages tab
    - "Report as Broker" button on every inquiry card
    - Broker report modal with reason selection
    - Duplicate report prevention per owner
  - **Messages:**
    - Split-pane messaging interface (conversation list + chat thread)
    - Shows only approved tenant connections
    - Last message preview, unread count, time ago
    - Owner message bubbles (amber), tenant bubbles (gray)
    - Read receipts (single/double check)
    - Message input with send button, Enter-to-send
    - Pre-selects conversation when navigated from Inquiries tab
    - **Report Tenant button in chat header** — same broker reporting flow as Inquiries tab
  - **Requests:**
    - Maintenance requests management table
    - Status filters: All, Pending, In Progress, Completed
    - Priority badges (Low, Medium, High, Urgent)
    - Update status, add landlord notes
    - Request detail modal
  - **Settings:**
    - Notification toggles (Maintenance, Rent, Lease, Inquiries, Platform Updates)
    - Security: Change Password, Two-Factor Authentication
    - Danger Zone: Delete Account
- **Modals:** QR Code Modal, Edit Listing Modal, Delete Listing Confirmation, Delete Property Confirmation, Rental Agreement View Modal, Report Broker Modal, Confirm Approve/Decline Modal

#### List Property (`/list-property`)
- Multi-step property listing form:
  - Step 1: Basic info (title, property type, address, city)
  - Step 2: Details (bedrooms, bathrooms, area, furnished, amenities)
  - Step 3: Photos upload
  - Step 4: Pricing (monthly rent, deposit, maintenance charges)
  - Step 5: Verification (utility bill upload for property ownership proof)
- Progress indicator
- Save as draft option
- Preview before publish

#### Landlord Dashboard (`/landlord-dashboard`)
- Overview metrics: Total Properties, Active Listings, Total Tenants, Monthly Revenue, Pending Maintenance Requests
- Maintenance request management table
- Status filters: All, Pending, In Progress, Completed
- Request details modal
- Assign maintenance staff / vendor (optional)
- Revenue chart (monthly trend)
- Quick action buttons: List Property, View Tenants, Generate Reports

#### Lease Management (`/rent-management`)
- **Automated Reminders Panel:** Set up rent due reminders, lease expiry alerts, configurable notification channels
- **Digital Rent Storage Panel:** Upload and store rent receipts, categorize by month/property, download any time
- **Document Verification Panel:** Track verification status for rental agreements, Aadhaar, utility bills
- **Direct Messaging Panel:** Communication hub with tenants
- **Maintenance Request Modal:** Submit and track maintenance issues
- **Mark as Paid Modal:** Record rent payments, generate receipts
- **Document Preview Modal:** View PDF agreements inline

#### Rent Payment (`/rent-payment`)
- **Overview Header:** Current month's rent due, total outstanding across all properties, on-time payment rate
- **Payment Methods Panel:**
  - **UPI AutoPay:** Set up automatic monthly UPI mandate with bank account / UPI ID selection
  - **UPI QR:** Generate a unique UPI QR code per property with tenant's name and amount embedded; tenant scans to pay
  - **Bank Transfer:** Display landlord's bank details (masked) for NEFT/RTGS transfers
  - **Cash/Cheque:** Offline payment logging with receipt number entry
- **Payment History Table:**
  - Columns: Month, Amount, Payment Mode, Transaction Ref, Date, Status (Paid/Pending/Failed), Receipt
  - Filter by month, status, or property
  - Download receipt per payment
- **Payment Failure Banner:**
  - Auto-appears when a recent payment failed (UPI timeout, bank rejection, insufficient funds)
  - Shows failure reason, retry CTA, and alternative payment method suggestions
  - "Contact Landlord" link for offline resolution
- **Reconciliation Panel (Landlord View):**
  - Match bank statement entries to rent payment records
  - Mark payments as reconciled, add reconciliation notes
  - Flag unmatched bank entries for manual review
- **Upcoming Payments:**
  - Calendar view of next 3 months of rent due dates
  - Pre-payment option: pay next month's rent in advance
  - Rent escalation reminders (annual increase notifications)

---

### 3.5 Tax & Legal Forms (`/tax-forms`)

#### Owner View (when role = landlord)
- Breadcrumb: Owner Profile → Tax Forms
- **Schedule HP Tab:** Property income calculator (annual rent, municipal taxes, standard deduction, interest on loan, net taxable income)
- **Tax Summary:** Slab-wise computation with total tax payable
- **ITR-2 Filing Guide for Landlords:** Step-by-step guide with document checklist

#### Tenant View (when role = tenant)
- Breadcrumb: My Dashboard → Tax & Legal Forms
- **HRA Calculator:** Enter basic salary, HRA received, rent paid, city type → auto-calculates exempt vs taxable HRA
- **Rent Summary:** Pulls saved rent receipts into yearly table with totals + landlord PAN
- **Tax Forms:** Shows tenant-specific docs (HRA declaration, Form 12BB, Section 80GG, Rent Payment Summary) with status badges
- **Filing Guide:** Step-by-step ITR guide for tenants (ITR-1, HRA docs, Form 10BA, e-verify)

---

### 3.6 Rent Receipts (`/rent-receipts`)
- Generate and download rent receipts per tenant
- Customizable receipt template (landlord name, tenant name, amount, date, property)
- Bulk download option
- Receipt history table

---

### 3.7 Rental Agreements (`/rental-agreements`)
- Create legally formatted rental agreements
- Template with landlord/tenant details, property info, lease terms, rent, deposit
- Preview before generating
- History of generated agreements
- Share with tenant button
- Download as PDF

---

### 3.8 Community Page (`/community`)

- Public community forum
- Discussion categories: Advice, Reviews, Events, General
- Post cards with author avatar, title, preview, comment count, timestamp
- Create new post (authenticated users)
- Comment threads
- Search posts
- Filter by category
- Popular / Recent tabs

---

### 3.9 Error Pages

#### Not Found (`/404` or catch-all `*`)
- Clean minimal layout with large "404" background text
- Friendly message: "This page has not been generated" or "Page not found"
- Display attempted path in mono font
- CTA to return home or contact support

#### Forbidden (`/403`)
- Shield icon with red accent
- Message: "Access Denied — you do not have permission to view this page"
- Links: Back to Home, Contact Support
- No auto-redirect; user must explicitly navigate away

#### Server Error (`/500`)
- Subdued gray/amber tones (not alarming red)
- Message: "Something went wrong — we are experiencing a temporary issue"
- "Refresh Page" button (re-runs current route)
- Auto-generated error ID for support tickets (e.g., BGL-500-XXXX)
- Link to contact support

#### Soft Block (`/soft-block`)
- Dedicated page for tenants with active soft block restrictions
- Shows restriction reason (multiple broker reports)
- Step-by-step resolution checklist:
  1. Re-verify Aadhaar (link to `/aadhaar-verify`)
  2. Provide additional details (employer, reference, purpose)
- Shows completion status of each step
- Review timeline note: "You will be notified within 24 hours"
- Contact support link at bottom

### 3.10 Subscription & Billing (Owners Only)

#### Subscription Plans (`/subscription`)
- **Plan Comparison:** Side-by-side Free vs Pro matrix with feature checks
- **Plan Toggle:** Monthly (₹199/mo) vs Annual (₹999/year) billing cycle selector
- **Feature Callouts:** Savings badge, money-back guarantee, trusted badge
- **FAQ Accordion:** Billing, cancellation, and feature access questions
- **Checkout Flow:** Razorpay checkout modal triggered from "Upgrade to Pro" CTA

#### Billing Tab (`/owner-profile` → Billing)
- **Invoice History Table:** Date, plan, amount, status (Paid / Failed / Refunded), download PDF
- **Summary Card:** Total spent, next billing date, current plan badge
- **Filter by:** Date range and status
- **Invoice Detail:** Invoice number, billing period, GST breakdown (18% IGST), Razorpay transaction ID
- **Auto-Renewal Toggle:** Enable/disable auto-renew in settings
- **Payment Method:** Display current method with "Update" link

#### Grace Period Banner
- Auto-appears on owner dashboard when subscription enters `past_due`
- Message: "Payment failed — update your payment method within 7 days to keep Pro access"
- CTA: "Update Payment" button linking to Billing tab
- Dismissible but re-appears on next login until resolved

---

## 4. Trust & Safety Features

### 4.1 Tenant Contact Rate Limiting (3-Layer Anti-Bypass System)
- **Goal:** Prevent brokers from mass-contacting owners by limiting how many landlords a tenant can reach.
- **Layer 1 — Client-Side (localStorage):**
  - Authenticated users: per-user timestamps in localStorage, rolling 24h and 7-day windows
  - Non-authenticated users: per-device timestamps in localStorage
  - Limits: 5 daily / 20 weekly for users; 3 daily / 10 weekly for devices
- **Layer 2 — Device Fingerprinting:**
  - Canvas + WebGL + screen + timezone + language + platform fingerprinting
  - Stores timestamps keyed by device fingerprint, surviving incognito mode (same device)
  - Raises the barrier for casual abuse (clearing storage / incognito no longer resets limits)
- **Layer 3 — Server-Side (Supabase Edge Functions + IP Throttling):**
  - Edge Function `check-contact-limit`: checks counts by user_id, device_fingerprint, and IP address
  - Edge Function `record-contact`: inserts a row into `contact_attempts` table with user_id, device_fingerprint, ip_address, listing_id, and timestamp
  - Server limits: 5 daily / 20 weekly per user; 3 daily / 10 weekly per device; 15 daily / 60 weekly per IP
  - Server result takes precedence over client-side when Supabase is connected
- **Enforcement Points:** Listing detail page "Request to Connect" button, Scan landing page "Request to Connect" button, sticky sidebar CTA
- **UI Behavior:** Button becomes disabled gray state showing "Limit Reached" or "Daily Limit Reached"
- **Warning Toast:** Red toast explains whether daily or weekly cap was hit
- **Counter Display:** Shows "X/5 daily · Y/20 weekly" usage in forms and inquiry tabs. Server-enforced limits show a "Server-enforced" badge.
- **Anti-Bypass:**
  - Clearing browser storage → Layer 2 still matches the same device fingerprint
  - Incognito mode → Layer 2 still matches the same device fingerprint
  - Another device → Layer 3 (IP throttling) catches it
  - VPN/proxy → Layer 1 (user account) still limits authenticated users

### 4.2 Broker Reporting System
- **Owner Action:** "Report as Broker" flag icon button on every inquiry card (pending and approved)
- **Report Reasons:** Broker/agent, Asked for commission, Shared competing listings, Refused identity, Other
- **Duplicate Prevention:** Same owner cannot report the same tenant twice
- **Soft Block Trigger:** 2 reports within 48 hours from any owners
- **Soft Block Effects:**
  - Tenant cannot send new contact requests (all "Request to Connect" buttons disabled)
  - Red "Account Restricted" banner on tenant profile
  - "Account Restricted" text on disabled buttons
- **Soft Block Resolution (2 required steps):**
  1. **Re-verify Aadhaar** — one-click simulate verification
  2. **Provide Additional Details** — employer name, company address, reference contact, purpose of renting
- **Storage:** Supabase `broker_reports` table with per-tenant history; `soft_block_states` table tracks resolution progress. When Supabase is not connected, in-memory mock arrays are used as a safe fallback (no localStorage).

### 4.3 Owner Rate Limits

Owners are rate-limited on high-frequency actions to prevent spam and system abuse. These are now server-enforced via Postgres triggers (`rate_limit_events` table, see migration 045) — the `localStorage` prefixes below back a client-side usage counter for UI feedback only, not the actual enforcement.

| Action | Daily Limit | Weekly Limit | Storage Key Prefix |
|--------|-------------|--------------|-------------------|
| Inquiry responses (approve/decline) | 50 | 200 | `bhavan_owner_inquiry_responses_` |
| Community posts created | 5 | 15 | `bhavan_owner_community_` |

> Chat message rate limiting was removed entirely (not renamed) — the chat rate-limit counter was found to be broken (a stale `useMemo` that never updated after sending a message) and the user chose to remove the limit rather than fix the display.

**UI Behavior:**
- **Banner Warning:** When owner approaches 80% of any daily limit, a yellow banner appears at the top of the relevant tab: "You are close to your daily message limit (X/100)."
- **Hard Block:** At 100%, the action button is disabled with tooltip: "Daily limit reached — try again tomorrow."
- **Progress Bar:** Inline progress indicator on owner profile tabs showing daily usage percentage.
- **Toast Feedback:** Success toast on every action; error toast when limit is hit with the reason.

**Reset Schedule:** Daily limits reset at midnight IST. Weekly limits reset every Sunday at midnight IST.

---

### 4.4 Push Notifications

#### 4.4.1 Delivery Stack
- **Primary:** Browser push via Firebase Cloud Messaging (FCM)
- **Fallback 1:** SMS for critical events (payment failure, account restriction, lease expiry)
- **Fallback 2:** Email for non-urgent events (new inquiry, maintenance update, community reply)
- **Final Fallback:** In-app notification center (always available)

#### 4.4.2 Notification Types & Channels
| Type | Push | SMS | Email | In-App |
|------|------|-----|-------|--------|
| New inquiry | Yes | No | Yes | Yes |
| Inquiry approved/declined | Yes | No | Yes | Yes |
| Rent payment due (3 days) | Yes | Yes | Yes | Yes |
| Rent payment failed | Yes | Yes | Yes | Yes |
| Maintenance status change | Yes | No | Yes | Yes |
| Lease expiry (30/15/7 days) | Yes | No | Yes | Yes |
| Soft block triggered | No | Yes | Yes | Yes |
| Subscription renewal (3 days) | Yes | No | Yes | Yes |
| Community reply | Yes | No | Yes | Yes |

#### 4.4.3 Delivery Status Tracking
Every notification stores a delivery record:
- `sent_at` — when the notification was generated
- `push_delivered` — boolean, confirmed via FCM receipt
- `sms_delivered` — boolean, confirmed via SMS provider webhook
- `email_delivered` — boolean, confirmed via email provider webhook
- `read_at` — timestamp when user opened the in-app notification

#### 4.4.4 Channel Preferences
Users can toggle each channel per notification type in Settings:
- Push: on/off globally (requires browser permission grant)
- SMS: on/off for critical events only
- Email: on/off per category (maintenance, inquiries, payments, lease, community, platform)

#### 4.4.5 FCM Registration Flow
1. User clicks "Enable Push Notifications" in Settings
2. Browser requests Notification permission
3. If granted, service worker registers and receives FCM token
4. Token stored in `user_push_tokens` table (one row per device)
5. On logout, token is deactivated; on re-login, token is re-activated

#### 4.4.6 Data Model Additions
**Table: user_push_tokens**
| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | FK → users |
| fcm_token | text | Firebase token |
| device_name | text | Browser / OS label |
| active | boolean | Whether token is valid |
| created_at | timestamp | Token creation |
| updated_at | timestamp | Last update |

---

### 4.5 Offline Mode Behavior

> **Not verified as currently built.** This section describes the originally-specified offline behavior, written when the app still had `src/mocks/` to fall back to. That mock data is gone, so anywhere below that says data is "served from `src/mocks/...`" is now false — there is no mock fallback. Whether the queuing/sync/draft-autosave UX described below was ever actually implemented (versus just specified) hasn't been confirmed; verify against the actual code in `src/hooks/` and `src/lib/supabase.ts` (`isSupabaseConnected()`) before relying on this section.

When the user's device loses internet connectivity or Supabase is not configured, the app operates in **Offline Mode** using local mock data and cached state.

#### 4.5.1 What Works Offline
- **Browse listings:** All listing data is served from `src/mocks/listings.ts`
- **View listing detail:** Property info, landlord card, gallery, amenities
- **Community forum:** Read posts and comments from mock data
- **Owner dashboard:** View properties, listings, tenants, inquiries (read-only)
- **Tenant dashboard:** View saved listings, inquiries, documents (read-only)
- **Tax calculators:** All form inputs and calculations (pure client-side)
- **Rent receipt / agreement generators:** Generate and preview PDFs locally
- **Notification history:** Read cached notifications
- **Aadhaar verification UI:** Upload flow (verification step queued for retry)

#### 4.5.2 What Is Disabled Offline
- **Contact / Request to Connect:** "Request to Connect" buttons are disabled with tooltip: "Connect to the internet to contact landlords."
- **Send chat message:** Message input disabled with placeholder: "Messages will send when you're back online."
- **Create new post / comment:** "Publish" button disabled with offline warning
- **Submit maintenance request:** Form submission blocked; "Save as Draft" option offered
- **Rent payment:** All payment tabs disabled; offline payment logging allowed with "Queue for sync" label
- **Broker report:** Report button disabled
- **Aadhaar verification submit:** Submit button disabled; images cached locally for later upload

#### 4.5.3 Graceful Degradation
- **Online indicator:** Small dot in navbar — green when online, gray when offline
- **Toast on disconnect:** "You are offline. Some features are unavailable." (auto-dismisses on reconnect)
- **Queued actions:** Actions attempted while offline are queued in `localStorage` and auto-retry on reconnect
- **Sync banner:** When reconnecting, a banner shows: "Back online — syncing X pending changes..."
- **Form drafts:** All multi-step forms auto-save to `localStorage` every 10 seconds; restored on return

---

## 5. Data Model Requirements

> **See README.md's Data Model Summary for the current, verified 34-table list.** The tables below (originally 24) are still accurate as *behavioral* descriptions of what each table stores, but the list is missing tables added later (`reviews`, `property_visits`, `vacation_bookings`, `rental_agreements`, `rent_receipts`, `aadhaar_verification_attempts`, `community_post_reports`, `contact_inquiries`, `client_error_logs`, `rate_limit_events`), and the `role` field values below are stale (see note).

### 5.1 Users Table
| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| email | text | Unique, required |
| name | text | Full name |
| phone | text | Phone number |
| role | text | `tenant`, `owner`, or `admin` (DB CHECK constraint — the actual column values are tenant/owner, not renter/landlord) |
| avatar_url | text | Profile image URL |
| verified_email | boolean | Email verification status |
| verified_phone | boolean | Phone verification status |
| verified_aadhaar | boolean | Aadhaar verification status |
| created_at | timestamp | Account creation |
| updated_at | timestamp | Last update |

### 5.2 Properties Table
| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| owner_id | uuid | FK → users |
| name | text | Property name |
| address | text | Full address |
| city | text | City name |
| total_units | integer | **Derived** — count of units linked to this property (auto-calculated from Units table) |
| occupied_units | integer | **Derived** — count of units where status = 'occupied' (auto-calculated from Units table) |
| monthly_income | integer | Total monthly rent collected |
| verification_doc_url | text | Utility bill / ownership proof |
| verified | boolean | Ownership verified |
| created_at | timestamp | Created date |

### 5.2a Units Table
| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| property_id | uuid | FK → properties |
| unit_number | text | Flat/unit identifier (e.g., A-101) |
| rent_amount | integer | Monthly rent for this unit |
| maintenance_charge | integer | Monthly maintenance for this unit |
| status | enum | vacant, occupied, under_maintenance |
| tenant_id | uuid | FK → users (nullable) |
| tenant_name | text | Cached tenant display name |
| lease_start | date | Lease start date |
| lease_end | date | Lease end date |
| agreement_generated | boolean | Whether rental agreement exists |
| last_payment_status | enum | paid, pending, failed, overdue, null |
| created_at | timestamp | Record creation |
| updated_at | timestamp | Last update |

### 5.3 Listings Table
| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| property_id | uuid | FK → properties |
| owner_id | uuid | FK → users |
| title | text | Listing headline |
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
| images | text[] | Array of image URLs |
| amenities | text[] | Array of amenity strings |
| status | text | active, inactive, draft |
| verified | boolean | Listing verified |
| views_count | integer | Total views |
| inquiries_count | integer | Total inquiries |
| saves_count | integer | Total bookmarks |
| category | text | Listing category, defaults to 'residential' |
| created_at | timestamp | Listing date |
| updated_at | timestamp | Last update |

> **Note:** The standalone `tenants` table has been removed. Tenant-occupancy data is stored entirely in the `units` table (`tenant_id`, `lease_start`, `lease_end`, `rent_amount`, `status`). This eliminates redundancy and makes the property → unit → tenant relationship the single source of truth.

### 5.4 Audit Logs Table
| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | FK → users (who performed the action) |
| action | text | Action name: create, update, delete, login, logout, report, block, verify, payment |
| table_name | text | Target table affected by the action |
| record_id | uuid | Primary key of the affected record |
| before | jsonb | Snapshot of the record before the change (null for create actions) |
| after | jsonb | Snapshot of the record after the change (null for delete actions) |
| ip_address | text | Client IP address at the time of action |
| user_agent | text | Browser user agent string |
| created_at | timestamp | Action timestamp |

### 5.5 Maintenance Requests Table
| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| tenant_id | uuid | FK → users |
| property_id | uuid | FK → properties |
| category | text | plumbing, electrical, appliance, structural, cleaning, other |
| title | text | Short title/summary of the issue |
| description | text | Issue details |
| priority | text | low, medium, high, urgent |
| status | text | pending, in_progress, completed, rejected |
| images | text[] | Issue photos |
| unit | text | Unit/flat number |
| preferred_time | text | Tenant's preferred service time |
| landlord_notes | text | Landlord/admin comments |
| created_at | timestamp | Submitted date |
| updated_at | timestamp | Last status update |
| resolved_at | timestamp | Completion date |

### 5.6 Connection Requests (Inquiries) Table
| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| tenant_id | uuid | FK → users (tenant) |
| listing_id | uuid | FK → listings |
| owner_id | uuid | FK → users (landlord) |
| message | text | Tenant's message |
| status | text | pending, approved, declined |
| move_in_date | text | Preferred move-in date |
| occupation | text | Tenant occupation |
| scanned_via_qr | boolean | Whether inquiry came from QR scan |
| listing_title | text | Cached listing title at request time |
| listing_location | text | Cached listing location at request time |
| listing_price | integer | Cached listing price at request time |
| created_at | timestamp | Request date |
| responded_at | timestamp | Response date |

### 5.7 Saved Listings Table
| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | FK → users |
| listing_id | uuid | FK → listings |
| created_at | timestamp | Saved date |

### 5.8 Chat Messages Table
| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| request_id | uuid | FK → connection_requests (context) |
| sender | enum | tenant, landlord |
| text | text | Message content |
| read | boolean | Read status |
| created_at | timestamp | Sent date |

### 5.9 Broker Reports Table
| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| tenant_id | uuid | FK → users (reported tenant) |
| owner_id | uuid | FK → users (reporting owner) |
| listing_id | uuid | FK → listings (optional context) |
| reason | enum | broker, commission, competing_listings, refused_identity, other |
| reason_text | text | Free-text additional details |
| created_at | timestamp | Report date |

### 5.9a Soft Block States Table
| Field | Type | Description |
|-------|------|-------------|
| tenant_id | uuid | Primary key (FK → users) |
| active | boolean | Whether soft block is currently active |
| triggered_at | timestamp | When the soft block was triggered |
| aadhaar_re_verified | boolean | Step 1 completed |
| additional_details_provided | boolean | Step 2 completed |
| details | jsonb | Employer, company, reference, purpose |

### 5.10 Community Posts Table
| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| author_id | uuid | FK → users |
| title | text | Post title |
| content | text | Post body |
| category | enum | advice, review, event, general |
| created_at | timestamp | Post date |
| updated_at | timestamp | Last edit |

### 5.11 Community Comments Table
| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| post_id | uuid | FK → community_posts |
| author_id | uuid | FK → users |
| content | text | Comment text |
| created_at | timestamp | Comment date |

### 5.12 Notifications Table
| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | FK → users |
| type | enum | maintenance, inquiry, lease, payment, platform |
| title | text | Notification headline |
| message | text | Details |
| read | boolean | Read status |
| push_delivered | boolean | FCM receipt confirmed |
| sms_delivered | boolean | SMS provider webhook confirmed |
| email_delivered | boolean | Email provider webhook confirmed |
| read_at | timestamp | When user opened in-app notification |
| action_url | text | Link to relevant page |
| created_at | timestamp | Notification date |

### 5.12a Notification Preferences Table
| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | FK → users |
| category | enum | maintenance, inquiries, payments, lease, community, platform |
| push_enabled | boolean | Push toggle for this category |
| sms_enabled | boolean | SMS toggle for critical events |
| email_enabled | boolean | Email toggle for this category |
| updated_at | timestamp | Last preference update |

### 5.13 Rent Payments Table
| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| tenant_id | uuid | FK → users |
| property_id | uuid | FK → properties |
| property_unit_id | uuid | FK → units (specific flat/unit) |
| owner_id | uuid | FK → users (landlord who receives payment) |
| amount | integer | Paid amount in paise |
| month | text | Payment month (e.g., "May 2026") |
| payment_mode | enum | upi_autopay, upi_qr, bank_transfer, cash, cheque, razorpay_recurring |
| transaction_ref | text | UPI ref / NEFT ID / cheque no |
| status | enum | paid, pending, failed, refunded, reconciled |
| razorpay_payment_id | text | Razorpay payment ID (if applicable) |
| failure_reason | text | Why payment failed (if status = failed) |
| receipt_url | text | Generated receipt PDF URL |
| reconciled_at | timestamp | When landlord matched bank statement |
| reconciliation_note | text | Landlord note during reconciliation |
| created_at | timestamp | Payment record date |
| updated_at | timestamp | Last update |

### 5.13a UPI AutoPay Mandates Table
| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| tenant_id | uuid | FK → users |
| owner_id | uuid | FK → users (landlord) |
| property_id | uuid | FK → properties |
| upi_id | text | Tenant's UPI ID (e.g., tenant@okicici) |
| bank_account | text | Linked bank account number (masked) |
| mandate_amount | integer | Auto-debit amount in paise |
| frequency | text | monthly |
| start_date | date | Mandate activation date |
| end_date | date | Mandate expiry date |
| status | enum | active, paused, cancelled, expired |
| razorpay_token | text | Razorpay token reference |
| created_at | timestamp | Mandate creation |
| updated_at | timestamp | Last update |

### 5.14 QR Analytics Table
| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| listing_id | uuid | FK → listings |
| scan_date | date | Date of scan |
| scans_count | integer | Number of scans that day |
| messages_sent | integer | Inquiries generated from scans |

### 5.15 Documents Table
| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | FK → users |
| type | enum | agreement, aadhaar, receipt, checklist, utility_bill, other |
| title | text | Document name |
| file_url | text | Document URL |
| status | enum | active, verified, pending, expired |
| created_at | timestamp | Upload date |

### 5.16 Owner Subscriptions Table
> See also Section 12.9 for full subscription data model details.

| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| owner_id | uuid | FK → users (landlord only) |
| plan | enum | free, pro_monthly, pro_annual |
| status | enum | trial, active, past_due, cancelled, expired |
| razorpay_subscription_id | text | Razorpay subscription ID |
| razorpay_customer_id | text | Razorpay customer ID |
| current_period_start | timestamp | Start of current billing period |
| current_period_end | timestamp | End of current billing period |
| trial_ends_at | timestamp | Trial expiry (null if not in trial) |
| cancel_at_period_end | boolean | Whether to cancel at period end |
| created_at | timestamp | Subscription creation date |
| updated_at | timestamp | Last update |

### 5.17 Billing History Table
> See also Section 12.9 for full billing history details.

| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| owner_id | uuid | FK → users |
| subscription_id | uuid | FK → owner_subscriptions |
| invoice_number | text | Unique invoice number (e.g., BGL-2026-0001) |
| plan | enum | free, pro_monthly, pro_annual |
| amount | integer | Amount in paise (₹19900 for ₹199) |
| gst_amount | integer | GST in paise (18% of amount) |
| total_amount | integer | Total including GST |
| currency | text | INR |
| status | enum | paid, failed, refunded, pending |
| razorpay_payment_id | text | Razorpay payment ID |
| razorpay_invoice_id | text | Razorpay invoice ID (optional) |
| billing_period_start | date | Period start |
| billing_period_end | date | Period end |
| paid_at | timestamp | Payment completion time |
| created_at | timestamp | Invoice creation date |

### 5.18 Subscription Features Table (Feature Flags)
> See also Section 12.9 for full feature flags details.

| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| owner_id | uuid | FK → users |
| feature_key | text | e.g., "analytics", "auto_reminders", "bulk_receipts" |
| enabled | boolean | Whether the feature is active for this owner |
| source | enum | plan, addon, trial |
| expires_at | timestamp | When the feature access expires (null = never) |
| created_at | timestamp | Feature grant date |

### 5.19 Contact Attempts Table
> Referenced in Section 4.1 (Tenant Contact Rate Limiting).

| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | FK → users (nullable — for non-authenticated attempts) |
| device_fingerprint | text | Browser device fingerprint (Canvas/WebGL/screen/timezone) |
| ip_address | text | Client IP address from request headers |
| listing_id | uuid | FK → listings (nullable) |
| created_at | timestamp | Attempt timestamp |

### 5.20 User Push Tokens Table
> Referenced in Section 4.4 (Push Notifications).

| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | FK → users |
| fcm_token | text | Firebase Cloud Messaging token |
| device_name | text | Browser / OS label |
| active | boolean | Whether token is currently valid |
| created_at | timestamp | Token creation |
| updated_at | timestamp | Last update |

---

## 6. Feature Specifications

### 6.1 Authentication & Authorization
- **Registration:** Users select role (tenant/landlord) during signup. Email verification required.
- **Login:** Email + password. Session management with secure tokens.
- **Password Reset:** Email-based reset flow.
- **Role-Based Access Control (RBAC):**
  - Tenant pages accessible only to users with `role = tenant`
  - Owner pages accessible only to users with `role = landlord`
  - Admin pages accessible only to users with `role = admin`
- **Protected Routes:** Unauthenticated users redirected to login. Wrong-role users redirected to their appropriate dashboard.

### 6.2 Property Listings
- **CRUD Operations:** Landlords can create, read, update, delete listings
- **Image Upload:** Multiple images per listing, max 10 images
- **Status Management:** Active (visible to public), Inactive (hidden), Draft (incomplete)
- **Verification Badge:** Listings marked verified after landlord ownership is confirmed
- **Analytics Tracking:** Views, inquiries, saves per listing
- **QR Code Generation:** Unique QR code per active listing linking to `/scan/:id`

### 6.3 Search & Filter
- **Location Search:** Text-based search across city, locality, address
- **Filters:** Price min/max, bedrooms, bathrooms, property type, furnished status
- **Sort By:** Price ascending/descending, newest first, most viewed
- **Pagination:** 12 listings per page

### 6.4 Maintenance Request System
- **Tenant Flow:** Submit request → select category → describe issue → upload photos → track status
- **Landlord Flow:** View all requests → filter by status/priority → update status → add notes
- **Priority Levels:** Low, Medium, High, Urgent
- **Status Lifecycle:** Pending → In Progress → Completed (or Rejected)
- **Notifications:** Both parties receive status change notifications

### 6.5 Aadhaar Verification

#### 6.5.1 Purpose
Identity verification for trust and safety. Verified badge shown on profile once approved.

#### 6.5.2 Flow
1. User uploads Aadhaar front + back images (JPG/PNG, max 5MB each)
2. **OCR Extraction** — system extracts name, Aadhaar number, DOB, gender, address, and photo from both sides using OCR
3. **Name Matching** — extracted name is compared against the user's profile name (fuzzy match, 80% threshold)
4. **Provider Verification** — extracted data is sent to third-party KYC provider for real-time validation against UIDAI records
5. If all checks pass → status becomes **Verified**
6. If any check fails → status becomes **Rejected** with specific failure reason

#### 6.5.3 Verification Provider
Recommended provider: **IDfy** or **Signzy** (India-authorized KYC APIs with direct UIDAI connectivity). Fallback: **Karza** or **Digilocker** integration if primary provider is unavailable.

#### 6.5.4 Masking Rules
- **Storage:** Full Aadhaar number is NEVER stored in plain text. Store only:
  - Last 4 digits (e.g., `**** **** 1234`)
  - A masked hash for duplicate detection
  - OCR-extracted metadata (name, DOB, gender, address) without the number
- **Display:** Show only last 4 digits everywhere in the UI. Tooltip says "Aadhaar verified for trust & safety. Full number never stored."
- **API:** Edge Functions handle provider calls; API keys stored in Supabase secrets only

#### 6.5.5 Retry Logic
- **Max Attempts:** 3 upload attempts per 24-hour window
- **Retry Flow:**
  - 1st failure → show specific error + allow immediate re-upload
  - 2nd failure → same, with stronger guidance (e.g., "Ensure all 4 corners of the card are visible")
  - 3rd failure → lock Aadhaar upload for 24 hours; show "Too many attempts — try again tomorrow"
- **Re-verification:** If user updates their profile name, Aadhaar must be re-verified (name mismatch guard)

#### 6.5.6 Failure Reasons (System → User)
| Failure Code | User-Facing Message |
|-------------|-------------------|
| `BLURRY_IMAGE` | "Image is blurry or unreadable. Please upload a clearer photo with good lighting." |
| `NAME_MISMATCH` | "Name on Aadhaar does not match your profile name. Update your profile name or contact support." |
| `INVALID_AADHAAR` | "Invalid Aadhaar number detected. Please upload a valid Aadhaar card." |
| `ALREADY_USED` | "This Aadhaar is already linked to another account. Each user can verify only once." |
| `PROVIDER_ERROR` | "Verification service is temporarily unavailable. Please try again in a few minutes." |
| `EXPIRED_SESSION` | "Verification session expired. Please restart the upload process." |

#### 6.5.7 Aadhaar Verification Failure States
1. **Blurry image** — OCR cannot read text; extraction confidence score below 70%
2. **Mismatch with profile name** — fuzzy name match falls below 80% threshold
3. **Invalid Aadhaar** — number fails UIDAI checksum validation or provider returns invalid
4. **Already used by another account** — masked hash matches an existing verified Aadhaar in the database

#### 6.5.8 Privacy & Status States
- **Status States:** Not Submitted → Pending Verification → Verified → Rejected
- **Data Retention:** If rejected, uploaded images are auto-deleted after 30 days. If verified, images are deleted immediately after extraction; only metadata is retained.
- **Consent:** User must check a consent box before upload: "I consent to Bhavan verifying my Aadhaar for trust & safety purposes. My Aadhaar number will be masked and never shared publicly."

### 6.6 Connection Requests (Inquiries)
- **Tenant Action:** Send inquiry to landlord for a specific listing with a message
- **Landlord Action:** Approve or decline with optional response message
- **Status:** Pending → Approved / Declined
- **Approved Connection:** Enables chat between tenant and landlord
- **Notifications:** Landlord notified on new inquiry; tenant notified on response
- **Rate Limiting:** 3-layer anti-bypass system (user / device fingerprint / IP) enforcing 5 daily / 20 weekly per user, 3 daily / 10 weekly per device, 15 daily / 60 weekly per IP. See Section 4.1 for full specification.

### 6.7 Chat / Messaging
- **Trigger:** Available only after landlord approves tenant's connection request
- **Features:** Real-time messaging UI, message read receipts, conversation list per connection
- **Context:** Each chat tied to a specific connection request for clarity
- **Owner UI:** Split-pane layout (conversation list left, chat thread right)
- **Navigation:** "Open Chat" button on approved inquiries jumps to Messages tab with pre-selected conversation

### 6.8 Broker Reporting
- **Owner Action:** Report tenant inquiry as broker/agent with reason selection
- **Soft Block:** 2 reports within 48 hours triggers soft block on tenant
- **Block Effects:** Tenant cannot send new connection requests; account shows restricted banner
- **Resolution:** Re-verify Aadhaar + provide additional employment/renting details
- **Storage:** Supabase `broker_reports` table; `soft_block_states` table for soft-block resolution. Hook auto-detects Supabase connection and falls back to in-memory mock arrays when offline.

### 6.9 QR Code System
- **Generation:** Auto-generated QR code for each active listing
- **Landing Page:** `/scan/:id` shows property summary with CTA to contact landlord
- **Analytics:** Track scans per day, conversion to inquiries
- **Display Options:** Download QR as image, print-friendly format

### 6.10 Notifications System
- **Types:** Maintenance updates, inquiry responses, lease reminders, payment confirmations, platform announcements
- **Delivery:** In-app notification center + optional email (future)
- **Read State:** Mark individual or all as read
- **Deep Linking:** Click notification navigates to relevant page

### 6.11 Document Management
- **Upload:** Support for PDF, JPG, PNG formats, max 5MB per file
- **Types:** Rental agreements, Aadhaar cards, rent receipts, move-in checklists, utility bills
- **Status:** Active, Verified, Pending, Expired
- **Download:** One-click download for any uploaded document

### 6.12 Rent Management Tools
- **Receipt Generation:** Auto-generated receipts with landlord/tenant/property details
- **Payment Tracking:** Mark rent as paid, view payment history
- **Reminders:** Configurable rent due date and lease expiry reminders
- **Tax Forms:** Annual rental income summary for tax filing (owner view) + HRA calculator (tenant view)

### 6.13 Community Forum
- **Posts:** Create, edit, delete (own posts only)
- **Comments:** Nested comment threads
- **Categories:** Advice, Reviews, Events, General
- **Moderation:** Report inappropriate content (future admin feature)
- **Search:** Full-text search across post titles and content

---

## 7. Technical Requirements

### 7.1 Frontend
- **Framework:** React 19 + TypeScript
- **Styling:** Tailwind CSS
- **State Management:** React Context for auth, React hooks for local state
- **Routing:** React Router with protected route guards
- **Icons:** Remix Icon (via CDN) + Font Awesome (via CDN)
- **Charts:** Custom SVG-based mini charts (no heavy chart library)
- **Form Handling:** Native forms with validation
- **Image Handling:** Stable Diffusion / AI-generated images for mock data; file upload for user content
- **Responsive:** Desktop-first breakpoints (lg, md, sm) with mobile hamburger nav

### 7.2 Backend & Database (Supabase)
- **Authentication:** Supabase Auth with email/password
- **Database:** PostgreSQL via Supabase
- **Storage:** Supabase Storage for images and documents
- **Row Level Security (RLS):** Required on all tables to prevent unauthorized access
- **Edge Functions:** Server-side logic for QR generation, receipt PDF generation, Razorpay payment processing, UPI mandate creation

### 7.3 Third-Party Integrations
- **Google Maps:** Embed iframe for property locations
- **Aadhaar Verification:** IDfy or Signzy (primary) for real-time KYC against UIDAI. Fallback to Karza or Digilocker. API keys stored in Supabase Edge Function secrets.
- **Razorpay:** Rent payment processing (UPI AutoPay, recurring payments, payment links/QR), subscription billing for Pro tier
- **Email Service:** Supabase built-in email or SendGrid/Resend for notifications

### 7.4 Security Requirements
- All API keys stored in environment variables / Supabase secrets
- RLS policies on all database tables
- Input sanitization to prevent XSS
- File upload validation (type, size)
- HTTPS only in production
- Password hashing (handled by Supabase Auth)

### 7.5 Performance Requirements
- Initial page load under 3 seconds
- Image lazy loading for listing galleries
- Pagination for large data sets (maintenance requests, listings, tenants)
- Debounced search input (300ms)

---

## 8. UI/UX Requirements

### 8.1 Design System
- **Color Palette:**
  - Primary: Warm amber / gold tones (CTAs, active states)
  - Success: Green
  - Warning: Amber/Orange
  - Danger: Red
  - Background: White or near-white (min RGB 240)
  - Text: Dark charcoal (#1a1a1a, #333333)
- **Typography:** Google Fonts — clean, modern sans-serif; body 14–16px; headings scale proportionally
- **Border Radius:** `rounded-lg` (8px) cards, `rounded-md` (6px) buttons, `rounded-full` pills/avatars
- **Shadows:** Minimal or no shadows (clean flat design)

### 8.2 Layout Rules
- Minimum content width: 1024px on desktop
- Desktop-first, then responsive breakpoints for tablet and mobile
- Cards and containers must have visible layering (different background from page)
- Buttons never wrap text (use `whitespace-nowrap`)
- All clickable elements show pointer cursor
- Navbar: No max-width, transparent over hero, white background on scroll
- Footer: Non-black background, distinct from page

### 8.3 Interaction Requirements
- Toast notifications for all CRUD operations (success, error, info)
- Delete confirmations via modal (never instant delete)
- Inline editing where appropriate (profile info, property details)
- Form validation with inline error messages
- Loading states for async operations
- Tab navigation with active state highlighting
- Empty states with helpful CTA

### 8.4 Animation Guidelines
- Subtle entrance animations for cards and modals
- Smooth transitions for tab switching
- Hover effects on cards (slight lift or border highlight)
- Toast slide-in animation

---

## 9. SEO Requirements
- Semantic HTML (header, main, nav, article, section, footer)
- Title tags: max 60 chars, format varies by page type
- Meta descriptions: 120–160 chars, include core business info
- Image alt and title attributes on all images
- Schema.org structured data for listings, FAQ, business info
- Canonical URLs
- Internal links use `<a href>` (not div click handlers)
- Sitemap generation (future)

---

## 10. Development Phase Plan

> **Status as of this update: Phases 1–3 complete, Phase 4 mostly complete, Phase 5 in progress.** See `project_plan.md`'s "Phase Status Update" section for the current, maintained status — this section is kept for historical context on what was originally scoped per phase. In particular: `src/mocks/` (referenced throughout Phase 1 below) was fully removed once real Supabase data replaced it; there is no dedicated Phase 2 "7-day Pro trial auto-assigned on signup" feature confirmed built (verify before relying on this); and beyond the original phases, a security hardening pass (RLS fixes across 7 tables, migrations 047–053), CI pipeline, unit test suite, client error logging, and legal pages were added — see `project_plan.md` for details.

### Phase 1: Core UI & Mock Data (COMPLETED)
**Goal:** Build all page UIs with mock data, shared navigation, footer, and routing.
**Deliverables:**
- Home, Listings, Listing Detail, About, Contact, Community, How It Works, Feedback pages
- Tenant Profile (all tabs: Overview, Saved Listings, My Inquiries, Documents, Settings)
- Owner Profile (all tabs: Overview, Properties, Listings, Tenants, Inquiries, Messages, Requests, Documents, **Billing**, Settings)
- Landlord Dashboard, Lease Management, Track Requests, Notifications, Scan Landing
- Aadhaar Verification flow with OCR, name matching, IDfy/Signzy provider, masking, retry logic, and failure states
- List Property form
- Login and Signup pages
- Mock data files for all features
- Rate limiting hook (`useContactRateLimit`) — 3-layer anti-bypass: client-side localStorage + device fingerprinting (Canvas/WebGL/screen/timezone keyed storage surviving incognito) + Supabase Edge Functions (`check-contact-limit` + `record-contact`) with IP throttling. Limits: 5 daily / 20 weekly per user; 3 daily / 10 weekly per device; 15 daily / 60 weekly per IP.
- Broker reporting hook (`useBrokerReport`) — soft block on 2 reports in 48h
- SoftBlockModal — Aadhaar re-verification + additional details form
- ReportBrokerModal — broker report reason selection
- Chat interface with split-pane messaging + Report Tenant button in header
- Tax Forms split view (owner vs tenant)
- Push Notifications — browser push via FCM with SMS/email fallback, delivery status tracking, channel preferences
- Owner Rate Limits — inquiry responses (50/day, 200/week), chat messages (100/day, 500/week), community posts (5/day, 15/week)
- Scan Landing Rate Limit Counter
- Subscription & Billing — Free vs Pro tiers, Razorpay integration, billing history, auto-renewal, grace period
- Rent Payment Integration — UPI AutoPay, UPI QR, bank transfer, offline logging, payment failure handling, reconciliation panel
- Unit-Level Management — Units table with per-unit rent, tenant, maintenance, agreement, and payment status
- Responsive design across all pages

### Phase 2: Supabase Authentication
**Goal:** Connect real user authentication with role-based access.
**Deliverables:**
- Supabase project setup
- Email/password auth integration
- User sessions and protected routes
- Profile data synced from Supabase `users` table
- Logout and password reset flows
- Owner onboarding with 7-day Pro trial auto-assigned on signup

### Phase 3: Dynamic Data & Database
**Goal:** Replace mock data with real Supabase database.
**Deliverables:**
- Properties, Listings, Tenants tables with RLS
- Maintenance request CRUD
- Connection requests (inquiries) system
- Saved listings functionality
- Document upload and management (Supabase Storage)
- Notification system with deep-linking
- Community posts and comments persistence
- Chat messages table with real-time subscriptions
- Broker reports table with admin review queue
- Subscription system tables (`owner_subscriptions`, `billing_history`, `subscription_features`) with RLS
- Rent payment tables (`rent_payments`, `upi_mandates`) with RLS
- Razorpay webhook endpoint (Edge Function) for payment + subscription status sync
- Aadhaar verification Edge Function with IDfy/Signzy KYC integration
- `contact_attempts` table + `check-contact-limit` / `record-contact` Edge Functions for rate limiting

### Phase 4: Advanced Features
**Goal:** Add real-time messaging, QR codes, analytics, and polish.
**Deliverables:**
- Real-time chat between approved tenants and landlords (Supabase realtime)
- QR code generation with server-side rendering
- Rent receipt PDF generation (Edge Function)
- Tax form PDF generation with actual calculations
- Search indexing for listings (Postgres full-text search)
- Admin moderation dashboard for broker reports and community content
- Advanced analytics dashboard for Pro landlords

### Phase 5: Testing & Launch Prep
**Goal:** Quality assurance and production readiness.
**Deliverables:**
- Cross-browser testing
- Mobile responsiveness verification
- Performance optimization
- SEO audit
- Security audit (RLS policies review, input sanitization)
- Production deployment

---

## 11. Appendix

### 11.1 Mock Data Files (REMOVED — kept here for historical reference only)
The `src/mocks/` directory listed below was fully deleted once every feature was wired to real Supabase queries. There is no mock-data fallback anywhere in the app anymore; every hook reads and writes the live database. If you're looking for how a feature actually gets its data today, check the corresponding hook in `src/hooks/`, not this list.

- `src/mocks/chat-messages.ts` — Chat conversation mock data
- `src/mocks/community.ts` — Community posts and comments
- `src/mocks/contact-requests.ts` — Tenant-to-landlord connection requests
- `src/mocks/feedback.ts` — User reviews and ratings
- `src/mocks/listings.ts` — Property listings
- `src/mocks/units.ts` — Unit-level data per property (unit number, rent, tenant, maintenance, agreement, payment status)
- `src/mocks/maintenance.ts` — Maintenance requests
- `src/mocks/notifications.ts` — User notifications
- `src/mocks/notification-channels.ts` — Notification channel preferences and delivery status
- `src/mocks/qr-analytics.ts` — QR scan statistics
- `src/mocks/rent-receipts.ts` — Rent receipt records
- `src/mocks/rental-agreements.ts` — Generated rental agreements
- `src/mocks/saved-rental-agreements.ts` — Saved agreement templates
- `src/mocks/tenant-tax-documents.ts` — Tenant tax document records
- `src/mocks/verification.ts` — Aadhaar and profile verification statuses
- `src/mocks/broker-reports.ts` — Broker report records (mock fallback)
- `src/mocks/soft-block-states.ts` — Soft block state records (mock fallback)
- `src/mocks/subscriptions.ts` — Owner subscription data, billing history, and feature flags
- `src/mocks/rent-payments.ts` — Rent payment records with all statuses (paid, pending, failed, reconciled)
- `src/mocks/upi-mandates.ts` — UPI AutoPay mandates (active, paused, cancelled)

### 11.2 Custom Hooks
- `useAuth` — Authentication context (login/logout/profile updates)
- `useToast` — Toast notification system (success/error/info)
- `useAuth` — Authentication context (login/logout/profile updates)
- `useToast` — Toast notification system (success/error/info)
- `useContactRateLimit` — 3-layer anti-bypass rate limiting for tenant contacts (client-side localStorage + device fingerprinting + Supabase Edge Functions)
- `useBrokerReport` — Broker report tracking with soft block logic (Supabase-backed, auto-falls back to in-memory mock arrays)
- `useSubscription` — Fetches owner subscription, checks Pro feature access, handles upgrade/downgrade/cancel/auto-renew flows
- `useRentPayment` — Fetches payment history, creates new payments, handles retry logic, manages UPI mandate status
- `useOwnerRateLimit` — Owner-side rate limits: inquiry responses (50/day, 200/week), chat messages (100/day, 500/week), community posts (5/day, 15/week)
- `usePushNotifications` — Browser push via Firebase Cloud Messaging with SMS/email fallback, delivery status tracking, channel preferences

### 11.3 Key Components (Already Built)
- AuthProvider — authentication context wrapper
- SubscriptionProvider — subscription context wrapper
- ToastContainer — global toast notification system
- Navbar — responsive top navigation with mobile hamburger
- Footer — site-wide footer
- InquiriesTab — owner inquiry management with approve/decline/report
- ChatTab — split-pane messaging interface with Report Tenant button in header
- RequestsTab — maintenance request management
- SoftBlockModal — tenant account restriction resolution flow
- ReportBrokerModal — broker report reason selection
- QRCodeModal — QR code display and download
- EditListingModal — inline listing editor
- RentalAgreementModal — agreement preview modal
- VacationCalendar — booking calendar component
- NotificationBell — notification dropdown with unread count
- ChannelPreferences — notification channel toggle UI (push, SMS, email)
- DeliveryStatus — per-notification delivery tracking badge
- PushSetupBanner — FCM push notification onboarding banner
- PlanToggle — monthly/annual billing cycle toggle
- FeatureRow — plan comparison table row
- UpgradeModal — Razorpay checkout modal for Pro upgrade
- UPIQRModal — full-screen QR code display with scan instructions
- AutoPaySetupModal — step-by-step UPI mandate creation
- FailureBanner — auto-appearing payment failure banner with retry CTA
- ReconciliationPanel — landlord-side bank statement matching panel
- NotificationBanner — urgent alert banner (maintenance, payment, action required)
- GracePeriodBanner — subscription payment failure banner with update CTA
- ProBadge — "Pro" pill badge for owner profile and listing cards
- UpgradeCTAModal — shown when Free user clicks a Pro-only feature
- SaveListingButton — bookmark/unsave with active state toggle
- ScrollNavbar — transparent over hero, white background on scroll

### 11.4 Form Requirements (updated — Readdy form service was replaced)
Forms originally submitted to a Readdy-provided form service (`application/x-www-form-urlencoded`, `data-readdy-form` attribute). All of that has been replaced with real Supabase writes — e.g. the Contact form now inserts into `contact_inquiries` via `useContactInquiries` and is server-rate-limited by device fingerprint (see README.md's Trust & Safety Stack section). The bullets below describe the original (now superseded) behavior; treat "Readdy form service" as historical only.
- Form submissions via `application/x-www-form-urlencoded`
- Each form has a unique ID and `data-readdy-form` attribute
- Textarea inputs limited to 500 characters
- Client-side validation before submission
- Submission status feedback displayed inline (no page redirect)

---

## 12. Owner Subscription (Free vs Pro)

### 12.1 Overview
Bhavan runs a **Freemium subscription model exclusively for Property Owners / Landlords**. Tenants never pay — the entire platform is free for renters. Owners start on a generous Free tier and upgrade to Pro for advanced tools that help them scale their rental business.

### 12.2 Free Tier
**Cost:** ₹0 (forever free)

**Included Features:**
- Unlimited active properties
- Unlimited active listings
- Unlimited tenant inquiries per month
- Basic landlord dashboard with simple metrics
- Standard property listing page with photos and description
- QR code generation for listings
- Basic maintenance request tracking
- Standard chat messaging with approved tenants
- Community access and participation
- Email notifications for new inquiries

**Free Tier Limitations:**
- No access to advanced analytics (revenue trends, inquiry conversion rates, tenant retention)
- No automated rent reminders or recurring rent collection tools
- No priority support — standard email support only
- No bulk rent receipt generation
- No advanced tax form auto-filling (manual Schedule HP calculator only)
- No custom branded listing URLs
- Listings show "Free" badge to tenants

### 12.3 Pro Tier
**Cost:** ₹199/month or ₹999/year (save ~58% with annual)

**Included Features (everything in Free, plus):**
- **Unlimited** properties and listings
- **Unlimited** tenant inquiries per month
- **Advanced Analytics Dashboard:**
  - Revenue trend charts (monthly, quarterly, yearly)
  - Inquiry-to-approval conversion funnel
  - Listing performance rankings (views, saves, inquiries per listing)
  - Tenant retention rate tracking
  - Maintenance request resolution time metrics
- **Automated Rent Management:**
  - Auto-reminders for rent due dates (configurable before due date)
  - Lease expiry alerts (30, 15, 7 days before expiry)
  - Bulk rent receipt generation for all tenants
  - Recurring payment tracking across all properties
- **Priority Tools:**
  - Priority listing placement (Pro listings appear higher in search results)
  - "Verified Pro Landlord" badge on all listings and profile
  - Custom branded listing URLs (`mybhavan.com/l/[slug]`)
  - Listing performance insights and optimization suggestions
- **Enhanced Tax & Legal Support:**
  - Auto-filled Schedule HP with data pulled from rent receipts
  - One-click ITR-2 document generation
  - Annual rental income summary auto-generation
- **Premium Support:**
  - Priority email support (response within 4 hours)
  - Dedicated account manager for landlords with 5+ properties
- **Additional Perks:**
  - No advertisements on landlord dashboard
  - Advanced document templates for rental agreements
  - Export data to CSV/Excel (tenants, payments, maintenance)

### 12.4 Pricing & Plans UI
- **Plan Selector:** Toggle between Monthly (₹199/mo) and Annual (₹999/year) billing
- **Plan Comparison Table:** Side-by-side Free vs Pro feature matrix with green checkmarks for Pro features
- **Savings Callout:** "Save ₹1,389/year with annual billing" prominently displayed
- **Money-Back Guarantee:** 7-day full refund if unsatisfied
- **Trusted Badge:** "No hidden fees. Cancel anytime."
- **FAQ Accordion:** Common questions about billing, cancellation, and feature access

### 12.5 Razorpay Subscription Integration
- **Payment Gateway:** Razorpay (India's preferred payment processor)
- **Supported Payment Methods:**
  - UPI (Google Pay, PhonePe, Paytm, BHIM)
  - Credit/Debit cards (Visa, Mastercard, RuPay)
  - Net Banking (all major Indian banks)
  - Wallets (Paytm, PhonePe, Amazon Pay)
- **Subscription Flow:**
  1. Owner clicks "Upgrade to Pro" on the subscription page
  2. Selects monthly or annual plan
  3. Razorpay checkout modal opens with pre-filled amount
  4. Owner completes payment
  5. Webhook updates subscription status to `active`
  6. Owner immediately gains Pro access
- **Subscription Status States:**
  - `trial` — 7-day free trial for new landlords (auto-converts to Free if not upgraded)
  - `active` — Paid Pro subscription is current
  - `past_due` — Payment failed, 7-day grace period to retry
  - `cancelled` — Owner cancelled, reverts to Free at period end
  - `expired` — Grace period lapsed, reverts to Free immediately

### 12.6 Billing History
- **Billing Page (`/owner-profile` → Billing Tab):**
  - Table of all past invoices: date, plan, amount, status (Paid / Failed / Refunded)
  - Download invoice as PDF
  - Filter by date range and status
  - Summary card: total spent, next billing date, current plan
- **Invoice Details:**
  - Invoice number, billing period, GST breakdown (18% IGST)
  - Payment method used, transaction ID from Razorpay
  - "Download PDF" button for each invoice

### 12.7 Auto-Renewal
- **Default Behavior:** All Pro subscriptions auto-renew by default
- **Renewal Notification:** Email sent 3 days before renewal with plan details and amount
- **Renewal Failure Handling:**
  - First attempt fails → retry after 24 hours
  - Second attempt fails → email notification with "Update Payment Method" link
  - Third attempt fails → subscription enters `past_due` state
  - After 7 days in `past_due` → subscription `expired`, reverts to Free
- **Owner Control:** Toggle auto-renewal on/off in Billing tab settings

### 12.8 Grace Period
- **Grace Period Duration:** 7 days after a failed renewal payment
- **Grace Period Behavior:**
  - Owner retains full Pro access during grace period
  - Banner shown at top of dashboard: "Payment failed — update your payment method within 7 days to keep Pro access"
  - "Update Payment" CTA button in banner and Billing tab
- **After Grace Period:**
  - Subscription status becomes `expired`
  - Reverts to Free tier immediately
  - All properties and listings remain fully accessible
  - No content is hidden or deactivated upon downgrade

### 12.9 Subscription Data Model

#### Table: owner_subscriptions
| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| owner_id | uuid | FK → users (landlord only) |
| plan | enum | free, pro_monthly, pro_annual |
| status | enum | trial, active, past_due, cancelled, expired |
| razorpay_subscription_id | text | Razorpay subscription ID |
| razorpay_customer_id | text | Razorpay customer ID |
| current_period_start | timestamp | Start of current billing period |
| current_period_end | timestamp | End of current billing period |
| trial_ends_at | timestamp | Trial expiry (null if not in trial) |
| cancel_at_period_end | boolean | Whether to cancel at period end |
| created_at | timestamp | Subscription creation date |
| updated_at | timestamp | Last update |

#### Table: billing_history
| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| owner_id | uuid | FK → users |
| subscription_id | uuid | FK → owner_subscriptions |
| invoice_number | text | Unique invoice number (e.g., BGL-2026-0001) |
| plan | enum | free, pro_monthly, pro_annual |
| amount | integer | Amount in paise (₹19900 for ₹199) |
| gst_amount | integer | GST in paise (18% of amount) |
| total_amount | integer | Total including GST |
| currency | text | INR |
| status | enum | paid, failed, refunded, pending |
| razorpay_payment_id | text | Razorpay payment ID |
| razorpay_invoice_id | text | Razorpay invoice ID (optional) |
| billing_period_start | date | Period start |
| billing_period_end | date | Period end |
| paid_at | timestamp | Payment completion time |
| created_at | timestamp | Invoice creation date |

#### Table: subscription_features (Feature Flags)
| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| owner_id | uuid | FK → users |
| feature_key | text | e.g., "analytics", "auto_reminders", "bulk_receipts" |
| enabled | boolean | Whether the feature is active for this owner |
| source | enum | plan, addon, trial |
| expires_at | timestamp | When the feature access expires (null = never) |
| created_at | timestamp | Feature grant date |

### 12.10 Subscription Enforcement Logic
- **Property/Listing Limits:** Free tier has unlimited properties and listings. No enforcement or hiding of content.
- **Inquiry Quota:** No inquiry limits on Free tier. Pro adds advanced tools only.
- **Feature Gates:** Every Pro-only feature checks `useSubscription` hook before rendering. If Free user tries to access a Pro feature, show an upgrade CTA modal instead of the feature.
- **Badge Display:** Pro badge appears on owner profile header, all listing cards, and landlord info panels on listing detail pages.

### 12.11 Subscription Hooks & Components
- **useSubscription hook:** Fetches current subscription, checks feature access, handles upgrade/downgrade flows
- **SubscriptionBadge component:** Small "Pro" pill badge with amber/gold styling
- **UpgradeCTAModal:** Shown when Free user clicks a Pro-only feature
- **BillingHistoryTable:** Displays invoice history with download links
- **PlanSelector:** Monthly/annual toggle with price display
- **SubscriptionBanner:** Grace period or trial countdown banner at top of dashboard

---
## 13. Rent Payment Integration

### 13.1 Overview
The platform provides a complete rent payment flow for tenants to pay their landlords digitally, and for landlords to track, reconcile, and manage rent collections. The system supports India's most popular payment methods — UPI, bank transfers, and offline payment logging — with automated failure handling and landlord-side reconciliation.

### 13.2 Tenant Payment Flow

#### 13.2.1 Pay Rent Page (`/rent-payment`)
- **Header Card:** Shows current month's rent due, property name, flat number, due date, and days remaining. Includes a large "Pay Now" CTA.
- **Payment Methods (tabbed):**
  - **UPI AutoPay Tab:** Shows active mandate status (if any), upcoming auto-debit date, mandate amount. Option to set up new mandate with UPI ID / bank selection.
  - **UPI QR Tab:** Generates a unique UPI QR code with pre-filled amount, tenant name, and landlord VPA. Tenant scans with any UPI app.
  - **Bank Transfer Tab:** Displays landlord's masked bank details (account number, IFSC, bank name) for NEFT/RTGS/IMPS.
  - **Offline Tab:** Log cash or cheque payments manually with receipt number and date fields.
- **Payment History:** Full table of past rent payments with status, amount, mode, transaction ref, receipt download.
- **Failure Banner:** When a payment fails, a prominent banner shows the failure reason with retry and alternate method CTAs.

#### 13.2.2 UPI AutoPay
- **Mandate Setup:** Tenant enters UPI ID, selects bank, confirms mandate amount (monthly rent), and authorizes via Razorpay eNACH UPI flow.
- **Mandate Status:** Active mandates show next debit date. Paused/cancelled mandates show history.
- **Failure Handling:** If auto-debit fails (insufficient funds, UPI limit exceeded), tenant gets a push notification + in-app banner with "Retry" and "Pay Manually" options.
- **Reconciliation:** Auto-debit payments are auto-marked as `paid` when Razorpay webhook confirms success.

#### 13.2.3 UPI QR Code
- **Dynamic QR:** Each payment generates a unique QR with a Razorpay payment link embedded. QR includes: landlord VPA, amount, tenant reference.
- **Scan-to-Pay:** Tenant scans with PhonePe, Google Pay, Paytm, or any UPI app. Payment reflects in Bhavan within minutes via webhook.
- **Expiry:** QR codes expire after 24 hours for security. A fresh QR can be regenerated anytime.

#### 13.2.4 Payment Failure Handling
- **Failure Reasons Tracked:** UPI_TIMEOUT, BANK_REJECTED, INSUFFICIENT_FUNDS, USER_CANCELLED, RISK_REJECTED.
- **UI Behavior:**
  - Banner at top of `/rent-payment` explaining the failure and suggested action
  - "Retry Payment" button triggers the same method again
  - "Try Another Method" button switches to a different payment tab
  - "Contact Landlord" opens chat or shows landlord phone
- **Notification:** Push notification + email sent to tenant on payment failure.
- **Grace for Late Rent:** If payment fails within 3 days of due date, tenant sees a "Late Payment Warning" with potential penalty info.

### 13.3 Landlord Payment Management

#### 13.3.1 Rent Collection Dashboard
- **Overview Cards:** Total collected this month, outstanding amount, on-time payment rate, overdue count.
- **Tenant Payment Table:** Per-tenant view showing: tenant name, flat, rent amount, due date, payment status (Paid / Pending / Failed / Overdue), last payment date, action buttons (Send Reminder, View History).
- **Overdue Actions:** Bulk "Send Reminder" to all overdue tenants. Individual reminder with pre-filled message.

#### 13.3.2 Payment Reconciliation
- **Bank Statement Matching:** Landlord uploads or pastes bank statement entries. System auto-matches by amount + date to `rent_payments` records.
- **Manual Reconciliation:** For unmatched entries, landlord selects the matching tenant and month, adds a note, and marks as reconciled.
- **Reconciliation Status:** Each payment shows `reconciled` / `pending_reconciliation` / `unmatched` badge.
- **Reconciliation Panel:** Owner profile → Tenants tab → "Reconcile Payments" sub-panel.

#### 13.3.3 Razorpay Recurring for Landlords
- **Pro Feature:** Pro landlords can enable Razorpay recurring payment links for their tenants.
- **Setup:** Landlord generates a subscription link per tenant with fixed monthly amount. Tenant subscribes once, pays automatically every month.
- **Tracking:** Landlord sees all recurring subscriptions in a table with status, next charge date, and total collected.

### 13.4 Data Model

#### Table: rent_payments (Updated)
| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| tenant_id | uuid | FK → users (tenant) |
| property_id | uuid | FK → properties |
| property_unit_id | uuid | FK → units (specific flat/unit) |
| owner_id | uuid | FK → users (landlord) |
| amount | integer | Paid amount in paise |
| month | text | Payment month (e.g., "May 2026") |
| payment_mode | enum | upi_autopay, upi_qr, bank_transfer, cash, cheque, razorpay_recurring |
| transaction_ref | text | UPI ref / NEFT ID / cheque no |
| status | enum | paid, pending, failed, refunded, reconciled |
| razorpay_payment_id | text | Razorpay payment ID (if applicable) |
| failure_reason | text | Why payment failed (if status = failed) |
| receipt_url | text | Generated receipt PDF URL |
| reconciled_at | timestamp | When landlord matched bank statement |
| reconciliation_note | text | Landlord note during reconciliation |
| created_at | timestamp | Payment record date |
| updated_at | timestamp | Last update |

#### Table: upi_mandates
| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| tenant_id | uuid | FK → users |
| owner_id | uuid | FK → users (landlord) |
| property_id | uuid | FK → properties |
| upi_id | text | Tenant's UPI ID |
| bank_account | text | Linked bank account (masked) |
| mandate_amount | integer | Auto-debit amount in paise |
| frequency | text | monthly |
| start_date | date | Activation date |
| end_date | date | Expiry date |
| status | enum | active, paused, cancelled, expired |
| razorpay_token | text | Razorpay token reference |
| created_at | timestamp | Creation date |
| updated_at | timestamp | Last update |

### 13.5 Mock Data & Fallback
- `src/mocks/rent-payments.ts` — Mock rent payment records with all statuses (paid, pending, failed, reconciled)
- `src/mocks/upi-mandates.ts` — Mock UPI AutoPay mandates (active, paused)
- Hook auto-detects Supabase connection. When not connected, uses in-memory mock arrays.
- All CRUD operations are async to match Supabase patterns.

### 13.6 UI Components
- **PaymentMethodTabs:** Tabbed interface for UPI AutoPay / UPI QR / Bank Transfer / Offline
- **UPIQRModal:** Full-screen modal with large QR code, amount display, and scan instructions
- **AutoPaySetupModal:** Step-by-step mandate creation with UPI ID input and bank selection
- **PaymentHistoryTable:** Filterable table with status badges and receipt download
- **FailureBanner:** Auto-appearing banner with retry CTA and failure reason
- **ReconciliationPanel:** Landlord-side panel for matching bank entries to payments

### 13.7 Hooks
- **useRentPayment:** Fetches payment history, creates new payments, handles retry logic, manages UPI mandate status
- **usePaymentReconciliation:** Fetches unreconciled payments, matches bank entries, updates reconciliation status
# Bhavan — Renter Platform

Bhavan is a web platform that connects renters with landlords and fellow tenants across India. It offers verified property listings, rent management tools, and a supportive community for Indian renters. The platform is fully backed by Supabase for authentication, real-time data, and secure storage.

> **New to this codebase?** Start with **[HANDOVER.md](HANDOVER.md)** — what
> is finished, what only looks finished, and what is left before this can
> ship on web, iOS and Android.
>
> For how the pieces fit together, see **[ARCHITECTURE.md](ARCHITECTURE.md)**.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 19 + TypeScript |
| Bundler | Vite |
| Styling | Tailwind CSS 3.4 |
| Router | React Router v7 (route-based code splitting via `React.lazy`) |
| Auth & Database | Supabase (Auth + PostgreSQL + Realtime + Edge Functions) |
| Payments | Razorpay (rent payments, subscription billing) |
| i18n | react-i18next |
| Charts | Recharts |
| Icons | Remix Icon + Font Awesome (CDN) |
| QR Codes | qrcode |
| Mobile | Capacitor (Android/iOS shells) |
| Testing | Vitest (unit) + Playwright (e2e) |
| CI | GitHub Actions (typecheck, lint, test, build) |
| Build Tooling | ESLint 9 + TypeScript 5.8 |

---

## Project Architecture

### Directory Layout

```
src/
├── components/
│   ├── feature/            # Global feature components
│   │   ├── AuthProvider.tsx
│   │   ├── ErrorBoundary.tsx    # Catches render errors, logs via errorLogging.ts
│   │   ├── DeleteAccountModal.tsx
│   │   ├── LegalPageLayout.tsx  # Shared layout for Terms/Privacy/Cookies/Accessibility
│   │   ├── Footer.tsx
│   │   ├── Navbar.tsx
│   │   ├── RequireAdmin.tsx     # Route guard for /admin/*
│   │   ├── SubscriptionProvider.tsx
│   │   └── ToastContainer.tsx
│   └── base/               # Reusable UI primitives
├── pages/
│   ├── home/, listings/, listing-detail/, community/, about/, contact/
│   ├── how-it-works/, feedback/, scan/
│   ├── terms/, privacy/, cookies/, accessibility/    # Legal pages
│   ├── login/, signup/, auth-callback/, reset-password/
│   ├── list-property/, aadhaar-verify/
│   ├── tenant-profile/     # Tenant dashboard (Overview, Saved, Inquiries, Documents, Settings)
│   ├── owner-profile/      # Owner dashboard (Overview, Properties, Listings, Tenants, Inquiries, Messages, Requests, Documents, Billing, Settings)
│   ├── rent-payment/, rent-receipts/, rental-agreements/, tax-forms/
│   ├── notifications/, subscription/
│   ├── admin/               # Admin dashboard overview
│   │   ├── login/, users/, listings/, support/, errors/
│   │   ├── broker-reports/, verification/, property-verification/, community/
│   ├── Forbidden.tsx, NotFound.tsx, ServerError.tsx   # /403, catch-all, /500
├── hooks/                   # One hook per data domain -- see "Custom Hooks" below
├── router/
│   ├── config.tsx           # Route definitions (route-based code splitting)
│   └── index.ts             # AppRoutes + global navigate helper
├── lib/
│   ├── supabase.ts          # Supabase client (singleton)
│   ├── fingerprint.ts       # Canvas/WebGL device fingerprinting (anon rate limiting)
│   ├── errorLogging.ts      # Client-side error capture -> client_error_logs table
│   ├── razorpay.ts          # Razorpay Checkout script loader
│   ├── payments/razorpaySignature.ts  # Shared, unit-tested HMAC signature verification
│   ├── documents/           # Rent receipt + rental agreement HTML generators
│   ├── content/             # Static copy (FAQs, feedback questions, agreement clauses)
│   ├── validation.ts        # Name/email/phone/Aadhaar validation
│   └── subscriptionConfig.ts
├── i18n/
│   ├── index.ts             # i18n initialization
│   └── local/               # Translation files per language
└── main.tsx                 # App entry point

supabase/
├── migrations/              # 53 sequential SQL migrations (schema + RLS history)
├── functions/                # Edge Functions (Razorpay, Aadhaar, rate limits, admin actions)
└── tests/                    # Rollback-safe RLS regression scripts, run manually via
                               # `npx supabase db query --linked --file supabase/tests/<name>.sql`

e2e/                          # Playwright end-to-end specs
```

---

## Route Map

| Route | Page | Auth Required |
|---|---|---|
| `/` | Home | No |
| `/listings` | Browse Listings | No |
| `/listings/:id` | Listing Detail | No |
| `/community` | Community Forum | No |
| `/about` | About Us | No |
| `/contact` | Contact | No |
| `/how-it-works` | How It Works | No |
| `/feedback` | Reviews | No |
| `/terms`, `/privacy`, `/cookies`, `/accessibility` | Legal pages | No |
| `/login` | Login | No |
| `/signup` | Signup | No |
| `/auth/callback` | OAuth/email callback handler | No |
| `/reset-password` | Password reset | No |
| `/aadhaar-verify` | Aadhaar Verification | Yes |
| `/tenant-profile` | Tenant Dashboard | Yes |
| `/owner-profile` | Owner Dashboard | Yes |
| `/list-property` | List Property | Yes (Owner) |
| `/scan/:id` | QR Landing | No |
| `/tax-forms` | Tax Forms | Yes |
| `/rent-receipts` | Receipt Generator | Yes |
| `/rental-agreements` | Agreement Generator | Yes |
| `/notifications` | Notification Center | Yes |
| `/rent-payment` | Rent Payment | Yes |
| `/subscription` | Subscription Plans | Yes (Owner) |
| `/403` | Access Denied | No |
| `*` (catch-all) | Not Found | No |
| `/500` | Server Error | No |
| `/admin/login` | Admin Login | No |
| `/admin` | Admin Dashboard | Yes (Admin) |
| `/admin/broker-reports` | Broker Report Moderation | Yes (Admin) |
| `/admin/verification` | Aadhaar Verification Queue | Yes (Admin) |
| `/admin/property-verification` | Property Ownership Verification | Yes (Admin) |
| `/admin/community` | Community Moderation | Yes (Admin) |
| `/admin/users` | User Management | Yes (Admin) |
| `/admin/listings` | Listing Moderation | Yes (Admin) |
| `/admin/support` | Support Queue | Yes (Admin) |
| `/admin/errors` | Client Error Log Viewer | Yes (Admin) |

> Note: `/landlord-dashboard`, `/rent-management`, `/track-requests`, and `/soft-block` from earlier planning docs were never built as standalone routes — that functionality now lives inside the Owner/Tenant dashboard tabs.

---

## Key Architectural Patterns

### 1. Supabase-First Data Strategy
All application data is stored and read from Supabase. Hooks query the database directly via `supabase.from('table').select()`. There is no localStorage or mock data fallback for business data. New users see clean empty states with CTAs to add their own data.

**Pattern:**
```
Hook calls supabase client
  → Queries real database tables
  → Returns reactive data via useState/useEffect
  → UI renders empty states when no rows exist
```

### 2. Role-Based Dashboards
Two distinct user roles with separate dashboards:
- **Tenant Home** (`/tenant-profile`): Overview, Saved Listings, My Inquiries, Documents, Settings
- **Owner Home** (`/owner-profile`): Overview, Properties, Listings, Tenants, Inquiries, Messages, Requests, Documents, Billing, Settings

Role is set at signup and stored in the `users` table (synced to Supabase `users` table).

### 3. Trust & Safety Stack
- **Rate Limiting**: server-enforced, not client-side. The public "Request to Connect" flow uses Edge Functions (`check-contact-limit` + `record-contact`) with device fingerprinting and IP throttling; authenticated-user actions (community posts, inquiry responses, the Contact form) are enforced by Postgres triggers via `check_and_record_rate_limit()` and the `rate_limit_events` table — a client bypass (clearing storage, incognito) cannot defeat either path.
- **Broker Reporting**: Owners can flag tenants; 2 reports in 48h triggers soft block
- **Soft Block Resolution**: Aadhaar re-verification + additional details form
- **Aadhaar Verification**: OCR extraction → name matching → provider verification (IDfy/Signzy)
- **RLS Hardening**: every owner/author-scoped table (`rent_payments`, `rental_agreements`, `connection_requests`, `maintenance_requests`, `community_posts`, `rent_receipts`, `broker_reports`) has an explicit `WITH CHECK` or immutability trigger restricting writes to exactly what the real UI does — not just "does this row belong to you." Each has a rollback-safe regression script in `supabase/tests/`.
- **Client Error Logging**: uncaught errors and React error-boundary catches are logged to the `client_error_logs` table (RLS: anyone inserts their own, admin-only read), viewable at `/admin/errors`.

### 4. Subscription Model (Freemium for Owners)
- **Free Tier**: Unlimited properties, unlimited listings, unlimited inquiries
- **Pro Tier**: ₹199/mo or ₹999/year — advanced analytics + auto-reminders + priority placement
- **Razorpay Integration**: Subscription tokens stored in `owner_subscriptions` table
- **Grace Period**: 7 days after failed renewal before reverting to Free

### 5. Payment Integration
- UPI AutoPay (Razorpay token-based)
- UPI QR codes
- Bank transfer + offline payment logging
- Payment failure handling with retry + reconciliation panel
- Unit-level payment tracking via `property_unit_id` on rent payments

### 6. Notification System
- Browser push via Firebase Cloud Messaging
- SMS and email fallback for critical events
- Delivery status tracking per notification (`push_delivered`, `sms_delivered`, `email_delivered`, `read_at`)
- Channel preferences (push / SMS / email toggles)

---

## Environment Variables

Supabase is already configured. The `.env` file at the project root contains:

```
VITE_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_PUBLIC_SUPABASE_ANON_KEY=your-publishable-key
```

No other environment variables are required.

---

## Available Scripts

```bash
npm run dev            # Start development server
npm run build          # Production build
npm run preview        # Preview production build
npm run lint           # ESLint check
npm run type-check     # tsc --noEmit
npm run test           # Vitest unit tests (single run)
npm run test:watch     # Vitest in watch mode
npm run test:coverage  # Vitest with coverage report
npm run test:e2e       # Playwright end-to-end tests
npm run test:e2e:ui    # Playwright in interactive UI mode
npm run cap:sync       # Build + sync into Capacitor (Android/iOS)
npm run android:open   # Sync + open the Android project
npm run ios:open       # Sync + open the iOS project
```

CI (`.github/workflows/ci.yml`) runs type-check, lint, test, and build on every push. E2E tests are intentionally excluded from CI (they need live Supabase state) — run them locally with `npm run test:e2e`.

Database changes are managed as sequential files in `supabase/migrations/` (currently 001–053). Before applying a new migration for real, test it in a rolled-back transaction against the linked project:
```bash
npx supabase db query --linked --file supabase/migrations/<new_migration>.sql   # wrap in BEGIN/ROLLBACK first to test
```
RLS regression scripts in `supabase/tests/` follow the same pattern and are meant to be re-run by hand after touching policies on the table they cover.

---

## Development Notes

### Adding a New Page
1. Create the page component under `src/pages/[page-name]/page.tsx`
2. Add the route to `src/router/config.tsx`
3. Add navigation link in `Navbar.tsx` if needed
4. Follow existing page styling (brand colors, spacing, responsive breakpoints)

### Custom Hooks
- `useAuth`: Authentication state, login/logout, profile updates (Supabase-backed)
- `useListings` / `useListingDetail` / `useListingImages`: Browse, filter, and fetch listings
- `useSaveListing`: Bookmark/unbookmark listings (`saved_listings` table)
- `useConnectionRequests`: Create and manage tenant inquiries
- `useMaintenanceRequests`: Create maintenance tickets (tenant) and manage them (owner)
- `useProperties` / `usePropertyVisits`: Owner properties, unit breakdown, visit scheduling
- `useCommunity`: Community posts and comments
- `useReviews` / `useReviewEligibility`: Tenant↔owner reviews, restricted to actual relationships
- `useNotifications` / `useNotificationPreferences`: Notification center + delivery channel prefs
- `useSubscription`: Tier checking, feature gating, billing history
- `useContactRateLimit` / `useOwnerRateLimit`: Contact and owner-action rate limiting (server-enforced)
- `useBrokerReport`: Broker flagging + soft block triggers
- `usePushNotifications`: FCM registration + delivery tracking
- `useRentPayment`: Payment methods, history, mandates, reconciliation
- `useRentReceipts` / `useRentalAgreements`: Generate, share, and list legal documents
- `useChatMessages`: Tenant↔owner messaging for approved connections
- `useQrAnalytics`: Per-listing QR scan tracking
- `useVacationBookings`: Short-stay booking calendar
- `useContactInquiries`: Public Contact form submissions (server rate-limited)
- `useAdmin*` (`useAdminOverview`, `useAdminUsers`, `useAdminListings`, `useAdminVerification`, `useAdminPropertyVerification`, `useAdminErrorLogs`): Admin dashboard data

---

## Data Model Summary

> The authoritative schema is `supabase/migrations/001_baseline.sql` — a complete DDL baseline generated 2026-07-31 from the live database's system catalogs (tables, constraints, indexes, functions, views, triggers including the four on `auth.users`, RLS policies, storage buckets/policies, the realtime publication, and all pg_cron jobs). A fresh Supabase project can be stood up from it with `supabase db push`. The historical migrations 002–063 are preserved for reference in `supabase/migrations_archive/`; the old `bhavan_schema.sql` snapshot has been removed as superseded. New migrations continue from `064_` upward. If this list drifts, trust the baseline and the database over this file.

1. `users` — accounts with role (tenant/owner/admin)
2. `properties` — owner properties with derived unit counts
3. `units` — per-unit rent, tenant, lease, payment status
4. `listings` — public rental listings with metadata + counts
5. `connection_requests` — tenant inquiries to landlords (immutable-fields trigger: only `status`/`responded_at` are owner-writable)
6. `chat_messages` — tenant-landlord threaded messages
7. `broker_reports` — owner-reported broker flags (insert-time status/admin_note locked to admin-only)
8. `soft_block_states` — active restriction records
9. `community_posts` — forum posts and discussions (author cannot self-unhide an admin-moderated post)
10. `community_comments` — post comments
11. `community_post_reports` — moderation flags on posts
12. `saved_listings` — user bookmarked listings
13. `documents` — uploaded agreements, receipts, Aadhaar, utility bills
14. `qr_analytics` — per-listing scan and conversion tracking
15. `notifications` — user notifications
16. `notification_preferences` — delivery channel prefs
17. `owner_subscriptions` — premium plans
18. `billing_history` — invoice records
19. `subscription_features` — feature flags
20. `rent_payments` — rent transaction records (status can only reach `paid` via the verified Razorpay edge function, never a direct client write)
21. `rent_receipts` — issued receipts (immutable once issued; only `sent_to_tenant`/`sent_at` are owner-writable)
22. `rental_agreements` — generated lease agreements (owner cannot self-mark `signed_by_tenant`)
23. `upi_mandates` — auto-pay setups
24. `contact_attempts` — rate limit audit trail (public "Request to Connect" flow)
25. `contact_inquiries` — public Contact form submissions (server rate-limited via device fingerprint)
26. `user_push_tokens` — push notification tokens
27. `audit_logs` — security audit trail
28. `maintenance_requests` — maintenance tickets (owner cannot rewrite the tenant's original description/category/images)
29. `reviews` — tenant↔owner reviews, restricted to actual tenancy relationships
30. `property_visits` — scheduled in-person visits
31. `vacation_bookings` — short-stay booking calendar
32. `aadhaar_verification_attempts` — KYC attempt history (retry limiting)
33. `client_error_logs` — client-side error capture (insert own / admin read)
34. `rate_limit_events` — backing table for `check_and_record_rate_limit()`, the shared server-side rate-limit function

> The Product/Order tables (`product_categories`, `product_items`, `product_variants`, `product_skus`, `order_headers`, `order_items`, etc.) that shipped with the original platform scaffold were dropped in migration `017_drop_dead_ecommerce_tables.sql` — Bhavan doesn't sell physical products.

---

## License

Private — Bhavan Platform
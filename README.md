# Bhavan — Renter Platform

Bhavan is a web platform that connects renters with landlords and fellow tenants across India. It offers verified property listings, rent management tools, and a supportive community for Indian renters. The platform is fully backed by Supabase for authentication, real-time data, and secure storage.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 19 + TypeScript |
| Bundler | Vite |
| Styling | Tailwind CSS 3.4 |
| Router | React Router v7 |
| Auth & Database | Supabase (Auth + PostgreSQL + Realtime) |
| i18n | react-i18next |
| Charts | Recharts |
| Icons | Remix Icon + Font Awesome (CDN) |
| QR Codes | qrcode |
| Build Tooling | ESLint 9 + TypeScript 5.8 |

---

## Project Architecture

### Directory Layout

```
src/
├── components/
│   ├── feature/           # Global feature components
│   │   ├── AuthProvider.tsx
│   │   ├── Footer.tsx
│   │   ├── Navbar.tsx
│   │   ├── SubscriptionProvider.tsx
│   │   └── ToastContainer.tsx
│   └── base/              # Reusable UI primitives
├── pages/
│   ├── home/              # Landing page
│   ├── listings/          # Browse listings
│   ├── listing-detail/    # Individual property page
│   ├── community/         # Forum & discussions
│   ├── about/             # Company story
│   ├── contact/           # Contact form + FAQ
│   ├── login/             # Login page
│   ├── signup/            # Signup page
│   ├── list-property/     # Property listing form
│   ├── aadhaar-verify/    # Identity verification flow
│   ├── tenant-profile/    # Tenant dashboard (5 tabs)
│   ├── owner-profile/     # Owner dashboard (10 tabs)
│   ├── landlord-dashboard/ # Analytics dashboard
│   ├── rent-management/   # Rent & lease tools
│   ├── rent-payment/       # UPI, bank, offline payments
│   ├── rent-receipts/      # Receipt generator
│   ├── rental-agreements/ # Agreement generator
│   ├── tax-forms/          # Tax calculators + guides
│   ├── feedback/           # Reviews + ratings
│   ├── notifications/      # Notification center
│   ├── track-requests/     # Maintenance tracking
│   ├── subscription/       # Free vs Pro pricing
│   ├── scan/               # QR scan landing
│   ├── how-it-works/      # Platform guide
│   ├── soft-block/        # Account restriction page
│   ├── admin/             # Admin dashboard overview
│   ├── admin/broker-reports/  # Broker report moderation
│   ├── admin/verification/      # Aadhaar verification queue
│   ├── admin/community/       # Community content moderation
│   ├── Forbidden.tsx          # Access Denied error page
│   ├── NotFound.tsx             # 404 Not Found error page
│   └── ServerError.tsx          # 500 Server Error page
├── hooks/
│   ├── useAuth.ts              # Authentication context
│   ├── useListings.ts          # Browse + filter listings
│   ├── useListingDetail.ts     # Single listing fetch
│   ├── useSaveListing.ts       # Bookmark/unbookmark listings
│   ├── useConnectionRequests.ts # Inquiry CRUD
│   ├── useMaintenanceRequests.ts # Maintenance CRUD (tenant + owner)
│   ├── useProperties.ts        # Owner properties + units
│   ├── useNotifications.ts   # Notification CRUD
│   ├── useCommunity.ts         # Posts + comments
│   ├── useSubscription.ts     # Free vs Pro tier logic
│   ├── useContactRateLimit.ts  # 3-layer anti-bypass rate limiting
│   ├── useBrokerReport.ts     # Broker reporting + soft block
│   ├── useOwnerRateLimit.ts   # Owner action rate limits
│   ├── usePushNotifications.ts # FCM push + fallback delivery
│   ├── useRentPayment.ts      # Payment CRUD + mandate management
│   ├── useContactRateLimit.ts  # Rate limiting hook
│   ├── useToast.ts            # Toast notification system
│   └── ...
├── mocks/                   # Legacy mock files (deprecated — data now from Supabase)
├── router/
│   ├── config.tsx           # Route definitions
│   └── index.ts             # AppRoutes + global navigate helper
├── lib/
│   ├── supabase.ts          # Supabase client (singleton)
│   └── fingerprint.ts       # Canvas/WebGL device fingerprinting
├── i18n/
│   ├── index.ts             # i18n initialization
│   └── local/               # Translation files per language
└── main.tsx                 # App entry point
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
| `/login` | Login | No |
| `/signup` | Signup | No |
| `/aadhaar-verify` | Aadhaar Verification | Yes |
| `/tenant-profile` | Tenant Dashboard | Yes |
| `/owner-profile` | Owner Dashboard | Yes |
| `/landlord-dashboard` | Analytics | Yes (Owner) |
| `/list-property` | List Property | Yes (Owner) |
| `/scan/:id` | QR Landing | No |
| `/tax-forms` | Tax Forms | Yes |
| `/rent-receipts` | Receipt Generator | Yes |
| `/rental-agreements` | Agreement Generator | Yes |
| `/notifications` | Notification Center | Yes |
| `/track-requests` | Request Tracking | Yes (Tenant) |
| `/rent-payment` | Rent Payment | Yes |
| `/rent-management` | Rent & Lease Tools | Yes (Owner) |
| `/subscription` | Subscription Plans | Yes (Owner) |
| `/403` | Access Denied | No |
| `/404` | Not Found | No |
| `/500` | Server Error | No |
| `/soft-block` | Account Restriction | Yes (Tenant) |
| `/admin` | Admin Dashboard | Yes (Admin) |
| `/admin/broker-reports` | Broker Report Moderation | Yes (Admin) |
| `/admin/verification` | Aadhaar Verification Queue | Yes (Admin) |
| `/admin/community` | Community Moderation | Yes (Admin) |

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
- **Rate Limiting**: 3-layer system (user / device fingerprint / IP) with escalating limits, enforced by Edge Functions
- **Broker Reporting**: Owners can flag tenants; 2 reports in 48h triggers soft block
- **Soft Block Resolution**: Aadhaar re-verification + additional details form
- **Aadhaar Verification**: OCR extraction → name matching → provider verification (IDfy/Signzy)

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
npm run dev          # Start development server
npm run build        # Production build
npm run preview      # Preview production build
npm run lint         # ESLint check
```

---

## Development Notes

### Adding a New Page
1. Create the page component under `src/pages/[page-name]/page.tsx`
2. Add the route to `src/router/config.tsx`
3. Add navigation link in `Navbar.tsx` if needed
4. Follow existing page styling (brand colors, spacing, responsive breakpoints)

### Custom Hooks
- `useAuth`: Authentication state, login/logout, profile updates (Supabase-backed)
- `useListings`: Browse, filter, search listings from Supabase
- `useListingDetail`: Single listing fetch with related data
- `useSaveListing`: Bookmark/unbookmark listings (saved_listings table)
- `useConnectionRequests`: Create and manage tenant inquiries
- `useMaintenanceRequests`: Create maintenance tickets (tenant) and manage them (owner)
- `useProperties`: Owner properties with unit breakdown
- `useCommunity`: Community posts and comments
- `useNotifications`: Notification center with read/unread states
- `useSubscription`: Tier checking, feature gating, billing history
- `useContactRateLimit`: 3-layer anti-bypass rate limiting
- `useBrokerReport`: Broker flagging + soft block triggers
- `useOwnerRateLimit`: Owner action throttling
- `usePushNotifications`: FCM registration + delivery tracking
- `useRentPayment`: Payment methods, history, mandates, reconciliation

---

## Data Model Summary

**Core Tables** (Supabase):
1. `users` — accounts with role (tenant/landlord/admin)
2. `properties` — owner properties with derived unit counts
3. `units` — per-unit rent, tenant, lease, payment status
4. `listings` — public rental listings with metadata + counts
5. `connection_requests` — tenant inquiries to landlords
6. `chat_messages` — tenant-landlord threaded messages
7. `broker_reports` — owner-reported broker flags
8. `soft_block_states` — active restriction records
9. `community_posts` — forum posts and discussions
10. `community_comments` — post comments
11. `saved_listings` — user bookmarked listings
12. `documents` — uploaded agreements, receipts, Aadhaar, utility bills
13. `qr_analytics` — per-listing scan and conversion tracking
14. `notifications` — user notifications
15. `notification_preferences` — delivery channel prefs
16. `owner_subscriptions` — premium plans
17. `billing_history` — invoice records
18. `subscription_features` — feature flags
19. `rent_payments` — rent transaction records
20. `upi_mandates` — auto-pay setups
21. `contact_attempts` — rate limit audit trail
22. `user_push_tokens` — push notification tokens
23. `audit_logs` — security audit trail
24. `maintenance_requests` — maintenance tickets

**Product/Order Tables** (Platform-provided):
25. `product_categories` — product catalog categories
26. `product_items` — product listings
27. `product_variants` — product variant definitions
28. `product_skus` — product SKU records
29. `product_custom_fields` — custom field definitions
30. `product_custom_values` — per-product custom field values
31. `order_headers` / `order_items` — order records

---

## License

Private — Bhavan Platform
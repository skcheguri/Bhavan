# Bhavan — Engineering Handover

Written for the senior full-stack developer taking this over. It covers
what exists, what is genuinely finished, and what is not — including the
things that look finished and aren't.

Read the "Not production ready" section before estimating anything.

---

## 1. What this is

An Indian rental marketplace. Tenants find listings and request to
connect; owners approve; the pair then get chat, a rental agreement, rent
receipts, rent payments and maintenance requests.

On top of that sits **Societies** (`/society`) — a paid product for an
apartment complex or villa community: verified owners of one building in
one group, with notices, shared maintenance and fund collections. It is
additive; none of the rental flows changed. See
[WORKFLOWS.md](WORKFLOWS.md) §5.

| Layer | Choice |
|---|---|
| Frontend | React 19 + TypeScript + Vite, Tailwind, react-router 8 |
| Backend | Supabase (Postgres + RLS + Auth + Storage + Edge Functions on Deno) |
| Payments | Razorpay (orders + HMAC signature verification, server-side only) |
| Push | Firebase Cloud Messaging (HTTP v1) for web; Capacitor for native |
| Hosting | Vercel, deployed from GitHub Actions after CI passes |
| Mobile | Capacitor — Android builds and runs; iOS never built, see §4 |

Scale: 88 migrations (001 is a squashed baseline, then 064–150),
19 edge functions, ~55 tables, ~198 RLS policies, 143 unit tests, 50 E2E tests.

### Security model — read this first

Nearly all authorization is **Postgres RLS**, not application code. The
client talks to PostgREST directly with the anon key; what a user can see
or change is decided by policies in the database. Consequences:

- A change to a table's policies is a security change, even if no
  TypeScript changes.
- Anything the client must *not* control (payment amounts, plan prices,
  payment status, contact limits) lives in an edge function holding the
  service-role key. Do not move those client-side.
- `is_admin()` requires **aal2** — an admin session without MFA has no
  admin API access. This was decorative until migration 066; see §7.

---

## 2. Getting it running

```bash
npm ci
cp .env.example .env    # fill VITE_PUBLIC_SUPABASE_URL and _ANON_KEY
npm run dev             # http://localhost:3000
```

```bash
npm run type-check && npm run lint && npm test && npm run build
```

E2E needs env vars and degrades to skips without them — see
[e2e/README.md](e2e/README.md). Do not point it at production once a
staging project exists (§4.1).

After **every** migration:

```bash
npm run gen:types
```

The Supabase client is typed off `src/types/database.types.ts`. A renamed
column becomes a compile error instead of silently rendering as `''` —
including inside generated legal documents, which is how it bit us before
the types were wired.

> Footgun: `gen:types` redirects straight into the checked-in file, so a
> failed run truncates it to empty. If type-check suddenly reports
> `no exported member 'Database'`, that's what happened — `git checkout`
> the file and rerun.

---

## 3. What is actually done

Genuinely working and verified against a live database:

- Listing browse/search, including proximity search and geocoding
- Connection request → owner approval (the trust loop everything depends on)
- Chat, with notifications and push dispatch (web push verified; §4.9)
- Rental agreements and rent receipts, with Indian legal formatting.
  Stamp duty is optional per agreement (skip → owner shares the
  digitally-signed copy directly; the new `signed` status); owners can add
  their own custom terms. Document tenant-pickers list only "confirmed
  tenants" — an approved contact the owner promoted via the Inquiries tab
  ("Confirm as tenant", `set_connection_tenant` RPC)
- Vacation bookings (paid request → owner confirm/decline → stay) and
  Stage-1 host payouts (details capture, admin due-payouts queue, mark-paid)
- Universal sign-in — one email = one role; no tenant/owner login picker;
  a brand-new Google user picks a role on `/auth/callback` before entering
- Rent payments and Pro subscription via Razorpay, signature-verified server-side
- Admin panel with enforced TOTP MFA
- Self-service account deletion with a DPDP-aware retention carve-out:
  anonymizes the profile in place, blocks while a tenancy is in force or a
  vacation booking is live / a host payout is still owed, and scrubs host
  payout-account PII (bank/IFSC/UPI)
- Server-side rate limiting, error logging, error-rate alerting
- RLS audited across all tables; real holes closed across two waves —
  migrations 047–053, then a 2026-08-25 hardening pass (141–150) that fixed
  ~50 correctness/security findings, incl. a critical self-registration-as-
  admin hole and refund idempotency. The code is clean of known defects
  except the §4 blockers and residuals
- CI gating deploys; DB rebuildable from `supabase/migrations/`
- Societies: join by code behind the existing owner verification, Bhavan
  review queue, member admin, notices, maintenance with discussion, and a
  fund-collection ledger — all entitlement-gated in RLS, 18 E2E tests, and
  walked on an Android emulator

---

## 4. NOT production ready

### 4.1 Staging environment — stood up; E2E repoint still pending

A separate **staging** Supabase project now exists (`bhavan_data_core_stg`,
ref `xfrxnzwrmhyxtynamlhe`; production is `bhavan_data_core_prod`,
`edythmogblkmsjfcbatc`). The migrations were **proven to rebuild from scratch**
on the fresh staging project per the [STAGING.md](STAGING.md) runbook —
`001_baseline.sql` is a real baseline generated from live system catalogs, so
the rebuild works. The RLS regression CI job is wired to staging via the
`STAGING_DB_URL` secret.

Still outstanding: the **E2E suite is not yet repointed at staging** — it
falls back to the public project values until `E2E_SUPABASE_URL` /
`E2E_SUPABASE_ANON_KEY` (and fixture-account secrets) are set, so until then
CI still runs only the no-backend subset for E2E (the rest skip cleanly). Do
not point E2E at production. Note too that migrations rebuild the *schema*
only — auth settings, storage buckets, edge-function secrets, cron jobs and
`pg_net` config are set by hand per project, so expect some config drift
between staging and production.

### 4.2 Mobile: scaffolded, never built or run

> **Superseded for Android — see §4.8.** Android now builds clean
> (`assembleDebug` exits 0, debug APK produced). The release APK builds
> but comes out unsigned. iOS is still unbuilt and this section stands
> for it.

The native projects **do exist** and are tracked in git — `android/` and
`ios/` were generated on 31 Jul. iOS uses Swift Package Manager, not
CocoaPods, so there is no Podfile to install.

Wired up as of this handover: all four Capacitor plugins are registered on
both platforms (`cap sync` run against push-notifications, filesystem,
share and geolocation), Android declares `POST_NOTIFICATIONS`,
`ACCESS_COARSE_LOCATION` and `ACCESS_FINE_LOCATION`, and iOS has
`NSLocationWhenInUseUsageDescription` plus the `remote-notification`
background mode.

Still outstanding:

| | Android | iOS |
|---|---|---|
| Firebase config file | `google-services.json` (gitignored) | `GoogleService-Info.plist` (gitignored) |
| Push credentials | — | APNs auth key uploaded to Firebase |
| Signing | keystore | certificates + provisioning profiles |
| Store account | Google Play (₹2,000 one-time) | Apple Developer ($99/yr) |
| Store listing | screenshots, description, data safety form | screenshots, App Privacy questionnaire |
| Deep links | `assetlinks.json` (needs signing fingerprint) | AASA file (needs Team ID) |
| Icons / splash | still Capacitor defaults | still Capacitor defaults |

**Neither project has ever been built, launched or tested on a device.**
That is the real gap, and it is where the time goes: native UX (safe
areas, back button, keyboard), Razorpay inside a WebView, camera and file
upload permissions, and the device-matrix testing that shakes out the
rest. The native push path in `usePushNotifications.ts`, and the native
document/share/geolocation branches added just before handover, have never
executed — verify them first.

Treat "web works" as no evidence about mobile.

### 4.3 Third-party integrations that are stubs or unverified

**Aadhaar verification — two modes, one function.**
`supabase/functions/aadhaar-verify` runs in whichever mode its secrets
select (or `AADHAAR_MODE=otp|ocr` forces). The page calls
`{action:'config'}` on load and renders the matching UI, so switching
modes is a secrets change, not a code change.

- **`otp` — real UIDAI e-KYC (production target).** OTP to the
  Aadhaar-linked mobile via a licensed provider. Strongest check (proves
  the person controls the cardholder's phone) but needs a commercial
  contract (SurePass, Signzy, Karza, Cashfree, IDfy KYC). There are
  legal constraints on who may perform Aadhaar authentication in India —
  get this reviewed before signing, not after. Set
  `AADHAAR_PROVIDER_BASE_URL` + `AADHAAR_PROVIDER_API_KEY`; the adapter
  in the function is Surepass-shaped, adjust for your vendor.

- **`ocr` — IDfy Aadhaar OCR (works on test credentials today).** The
  user photographs their Aadhaar card; IDfy extracts the fields; the
  function validates the number's Verhoeff checksum and cross-checks the
  card name against the profile name before granting the badge. Set
  `IDFY_ACCOUNT_ID` + `IDFY_API_KEY` (from
  https://apicentral.idfy.com/credential), optionally `IDFY_BASE_URL`.
  IDfy fetches the card from a URL (`document1`/`document2`), so the
  function uploads the photo to the private `aadhaar-temp` bucket
  (migration 129), passes IDfy a 5-minute signed URL, and deletes the
  object immediately after — the image is never retained.
  **Weaker than OTP by design** — it proves possession of a plausible
  card image, not identity. Two hardening steps before relying on it in
  production: switch to IDfy **OCR Plus** (validates the card's
  UIDAI-signed QR, defeating doctored images) and add a selfie
  face-match (closes the "someone else's card" hole). Also confirm the
  IDfy API host/endpoint and field names against your dashboard docs —
  IDfy has multiple API generations; the function reads documented field
  aliases and `IDFY_BASE_URL` is overridable for exactly this reason.

- **TEST-ONLY OTP bypass.** Because real OTP needs a provider contract,
  the OTP *flow* can't be exercised in staging. Setting
  `AADHAAR_OTP_TEST_CODE` (e.g. `123456`) makes `send-otp` skip the
  provider and `verify-otp` accept exactly that code — so the full OTP
  UI (enter Aadhaar → enter OTP → verified) is testable. It activates
  **only** when that secret is set AND no real provider is configured; a
  real provider always wins. The OTP screen shows a "test environment"
  banner while it's on. **NEVER set this secret in production** — unset,
  it is dead code. To use it in staging:
  `npx supabase secrets set AADHAAR_OTP_TEST_CODE=123456 AADHAAR_MODE=otp --project-ref <ref>`

- **What verification actually gates.** Server-side, `verified_aadhaar`
  gates exactly one thing: **listing creation** (migration 136 trigger —
  the anti-broker gate belongs on the person putting up property).
  Contacting owners (connection requests), property visits, and signing
  rental agreements are gated on *other* conditions — an approved
  connection, party identity and signing order — but deliberately **not**
  on `verified_aadhaar`. Requiring Aadhaar just to inquire would add heavy
  friction for no anti-broker benefit. If the product later wants identity
  at the legal step, the agreement flow (migration 137) is where to add
  it; today it isn't there by choice, not by omission.

**Phone OTP — hook written, account not connected.** `send-sms-hook`
delivers Supabase-generated OTPs via MSG91 (Supabase natively supports
only Twilio/MessageBird/Vonage). Needs an MSG91 account, DLT template
registration (mandatory in India, and slow), and the hook enabled in
Supabase Auth settings.

**Razorpay — verify the mode, and finish the webhook setup.** Signature
verification is implemented and unit-tested. Confirm whether
`RAZORPAY_KEY_ID` is test or live, and complete Razorpay KYC.

**Auto-capture must be ON (dashboard setting).** Every order is created
without a per-order capture flag (the Orders API has none), so capture
is governed entirely by the account setting: Razorpay Dashboard →
Settings → Configuration → **Payment Capture → Automatic**. If it is set
to manual, payments settle as `authorized` and never `captured`, so
`payment.captured` never fires and nothing is fulfilled even though the
customer was charged — the code has no manual-capture path. Verify this
is Automatic before launch; it is easy to miss because test mode often
defaults differently than a fresh live account.

**Verifying the live-key switch (can't be unit-tested).** Whether live
keys actually work is not checkable from code — only a real transaction
proves it. To verify after switching:
- The mode is legible from the key: `RAZORPAY_KEY_ID` starting `rzp_test_`
  vs `rzp_live_`, and it is returned as `keyId` in every create-order
  response, so a quick check is to inspect the Checkout that opens.
- Confirm the Razorpay Dashboard's **Test/Live toggle** matches the keys
  set in Supabase secrets — a live `KEY_ID` with a test `KEY_SECRET` (or
  vice-versa) fails signature verification on every payment.
- The webhook secret is per-mode: switching to live needs the **live**
  webhook's secret in `RAZORPAY_WEBHOOK_SECRET`, not the test one.
- Do one real ₹1-class transaction end to end (pay → row flips to paid →
  entitlement granted), then refund it from the dashboard and confirm the
  `refund.processed` webhook flips the row to `refunded`. That single
  loop exercises keys, capture mode, and both webhook events at once.

The webhook now exists (`razorpay-webhook`, deployed) and covers rent, Pro
and society payments, but **it does not work until two things are done in
the Razorpay dashboard**, and until then it fails in the way that looks
exactly like it was never called:

1. Add the endpoint under Settings → Webhooks:
   `https://edythmogblkmsjfcbatc.supabase.co/functions/v1/razorpay-webhook`
   subscribed to **`payment.captured`**, **`payment.failed`** and
   **`refund.processed`**. `payment.failed` is what writes
   `status='failed'` — without that subscription, a failed payment leaves
   a pending row forever and the app's retry/failed UX never triggers.
   `refund.processed` reconciles refunds issued from the Razorpay
   dashboard (see the refunds note below).
2. Take the webhook secret Razorpay shows you and set it:
   `npx supabase secrets set RAZORPAY_WEBHOOK_SECRET=<value> --project-ref edythmogblkmsjfcbatc`

That secret is **not** `RAZORPAY_KEY_SECRET` — they are different values,
and using the key secret rejects every delivery with a 401. The secret
currently set is a placeholder from testing and must be replaced.

Two things to know when checking it works. The function is deployed with
`--no-verify-jwt`, which is required: Razorpay sends no Supabase JWT, so
the default gateway check would reject every delivery before the function
runs. And a rejected signature is deliberately not recorded in
`razorpay_webhook_events` — so if the table stays empty while Razorpay's
dashboard shows deliveries, the secret is wrong.

A rejected signature IS now recorded, as one `signature.rejected` row per
hour -- capped that way so nobody can flood the table by POSTing garbage,
while still answering "did anything reach us at all". So an empty table
really does mean Razorpay never called.

**Refunds — in-app + dashboard, both wired.** Booking refunds were
already automatic (respond-booking / cancel-booking). Rent and Pro/
society refunds now exist too: an admin opens a user in `/admin/users`,
the **Payments & Refunds** section lists their Razorpay payments, and
Refund calls the `refund-payment` edge function (Razorpay refund → row
marked `refunded` → a refunded Pro/society plan is revoked → user
notified). Refunds issued straight from the Razorpay dashboard reconcile
via the `refund.processed` webhook, so the two paths can't disagree.
Cash/offline rent has no Razorpay reference and is intentionally not
refundable here. This makes the billing screen's "refund within 7 days,
contact support" promise real. **Nothing to build — just subscribe the
webhook to `refund.processed` (above) so dashboard refunds reconcile.**

### 4.3d Rent payouts to owners — NOT built (Route stage 2)

Rent paid through Razorpay settles into **Bhavan's** account; there is
no path that forwards it to the landlord. Today rent is effectively a
record-keeping + receipt feature with the money pooled centrally — fine
for a pilot, **not** something to run at scale without telling owners
where their rent is. Same fix as vacation-booking payouts (§4.3c):
**Razorpay Route**, with each owner onboarded as a linked account and a
transfer (or on-hold transfer released after the rent period) attached
at capture. Until Route is live, if any real rent flows, an admin must
forward it manually — there is no Stage-1 rent-payout console yet (the
`/admin/payouts` queue covers vacation bookings only). Decide before
launch whether rent collection is even switched on, or stays owner-marks-
paid (the existing offline/cash path) until Route lands.

### 4.3e Pro is sold but enforces nothing — BEFORE monetizing

`/subscription` advertises ~13 Pro features (Advanced Analytics,
Automated Rent Reminders, Lease Expiry Alerts, Bulk Receipts, Priority
Listing Placement, Verified Pro Badge, Custom Branded URLs, Auto-filled
Tax Forms, Data Export, Priority Support, Dedicated Account Manager, …).
**Almost none are gated.** The one real Pro gate is server-side — the
free plan caps you at one active vacation listing (`enforce_vacation_listing_tier`
→ `has_pro()`, migration 126). Of the advertised list, none are: `FREE_TIER_LIMITS`
in `src/lib/subscriptionConfig.ts` is `Infinity` on every count,
`PRO_FEATURE_KEYS` is defined but never consulted, and `isPro` is read
only to render the billing tab — no advertised feature checks it. So a
free user has essentially everything a paid user does, and charging for
Pro today is selling access that isn't withheld.

Before taking Pro money, either enforce the list or shrink the list to
what's real:
- Add a `hasFeature(key)` gate off the subscription state and put it in
  front of each advertised capability (several — analytics, tax forms,
  data export, bulk receipts — are real screens that just aren't gated;
  others — auto reminders, lease alerts, custom URLs, account manager —
  don't exist yet and are pure marketing).
- The server-side authority already exists: `has_pro(uuid)` (migration
  073) — gate the real features in RLS/RPCs with it, not just the UI, so
  the entitlement can't be flipped from the client.
- Whatever isn't enforced by launch should come off the pricing page —
  advertising unenforced features is the actual exposure here.

### 4.3f GST is charged but no compliant tax invoice is produced

`create-subscription-order` / `create-society-subscription-order` add 18%
GST (`gst_amount` on `billing_history`) and the owner is charged it, but
the only artefact is a row and an `invoice_number` string — no GST-
compliant **tax invoice** document is ever generated. Charging GST while
issuing no compliant invoice is a real compliance exposure, not cosmetic.

This is blocked on business/legal data that isn't (and shouldn't be) in
the repo, plus a document template:
- The registered entity's **GSTIN**, legal name and registered address.
- **SAC code** for the service (SaaS/subscription) and the **place of
  supply** rules (intra- vs inter-state changes CGST+SGST vs IGST — the
  code currently lumps it as one 18% line, which itself needs review).
- A sequential, financial-year-scoped invoice number series (the current
  `INV-<year>-<order-suffix>` is not a compliant series).
- A rendered invoice document (the app already has an HTML→document
  pipeline in `src/lib/documents/` used for rent receipts and rental
  agreements — a GST invoice template belongs alongside those), delivered
  to the owner and stored.
Get this reviewed by whoever handles the entity's GST filing before
launch; do not ship "we charge GST" without the invoice behind it.

### 4.3g Rent reconciliation is a scratchpad, not a ledger

The owner **Reconcile** tab (`ReconciliationPanel`) lets an owner type
bank-statement lines and match them to rent payments. It now refuses a
match whose amounts disagree (that guard shipped), but the bank entries
themselves live in React `useState` — they are **not persisted**: close
the panel and every entry and match-in-progress is gone, and there is no
stored audit trail of what was reconciled against what. `reconcilePayment`
only flips the payment's status to `reconciled` and stores a free-text
note; the bank side is never recorded. To make it a real ledger:
- Persist bank entries in a `rent_reconciliation_entries` table (owner_id,
  date, amount, description, matched_payment_id, created_at) with owner-
  scoped RLS.
- Store the match linkage (which entry ↔ which payment) so a reconciled
  payment can be traced back to its bank line, and make reconciled rows
  immutable.
- Optional but expected of a ledger: CSV/statement import instead of
  hand-typing, and a running matched/unmatched balance that survives
  reloads.

### 4.3h UPI AutoPay is a non-functional scaffold — DO NOT enable for real

The "UPI AutoPay" tab looks complete (set up a mandate, pause, cancel)
but is **entirely fake**: `useRentPayment.createMandate` writes an
`upi_mandates` row with a fabricated `razorpay_token` (`token_<Date.now>`)
and never touches Razorpay. There is no real UPI e-mandate, no
tokenization, and — critically — **nothing that ever debits it**: no
recurring charge job exists, so even the fake mandate collects no rent.
It must not be presented to real users as working autopay.

A real implementation is a substantial integration, not a wiring fix:
- Razorpay **UPI AutoPay / e-mandate** (Subscriptions or the Recurring
  Payments API): create an authenticated mandate, store the real token,
  handle the mandate-approval webhook.
- A recurring **pre-debit notification** (mandatory in India, ~24h before
  each debit) plus the scheduled debit itself — a new cron that raises a
  charge on each due date and reconciles the result through the existing
  `razorpay-webhook`.
- Mandate lifecycle: pause/resume/cancel must call Razorpay, not just
  flip a local status; handle failed debits and expiry.
Until all of that exists, keep the tab hidden or clearly labelled
"coming soon". The honest launch position is one-tap manual Razorpay
rent (which works) without recurring autopay.

### 4.3i CORS `*` on payment functions — reviewed, kept on purpose

The payment/refund/booking edge functions send
`Access-Control-Allow-Origin: *`. This was flagged and **deliberately
left as-is**, not overlooked. It is safe here: every one of these
functions authenticates with a **bearer JWT** (or, for the webhook, a
Razorpay signature) and reads **no cookies**, so a wildcard CORS grants a
malicious page nothing — it cannot obtain the caller's token, and a
cross-origin `fetch` without it is rejected 401 by the function itself.
An origin allowlist would add real fragility for zero security gain: the
**Capacitor mobile app** sends `Origin: capacitor://localhost` (or
`http://localhost`), and Vercel **preview deploys** each have their own
origin — an allowlist would silently break payments on those surfaces. If
a future reason to tighten appears, do it via an env-driven allowlist
that explicitly includes the Capacitor origin(s) and reflects the request
Origin, never a single hard-coded domain.

### 4.3b Societies: what is not finished

The feature works end to end and is covered by E2E tests. What is missing
is lifecycle and polish rather than function:

- ~~No renewal reminder.~~ Done: `society-renewal-reminders` runs daily at
  04:00, warns admins at 14 and 3 days, then marks lapsed plans `expired`
  and tells every member. Registered with the cron watchdog.
- **Aadhaar is not in the join gate.** `is_verified_owner()` requires an
  admin-approved property, deliberately not `verified_aadhaar`, because
  the KYC provider is not contracted and requiring it would block every
  join with the cause buried in an RLS denial. One clause, one function,
  when the provider lands.
- ~~A notice cannot be edited.~~ Done: admins edit in place, the row is
  marked "edited", and editing deliberately does not re-notify.
- ~~No receipt for a confirmed contribution.~~ Done: a printable receipt
  that states plainly Bhavan never held the money.
- ~~No pagination anywhere.~~ Done for notices and issues (20 per page,
  "show older"). The member directory keeps a 500-row cap rather than
  paging, because the pending-request count on the Members tab is computed
  from those rows and paging would make an admin see "2 waiting" when
  there were thirty.
- **Two mobile checks outstanding** — MOBILE_TESTING §5e.10 and §5e.11.
- **The owner-side contractor UI is typechecked, not clicked.** The list
  and assignment on `/owner-profile?tab=requests` have never been driven
  in a browser, unlike the society equivalents.
- **Closed societies are not purged.** A society can sit closed forever;
  nobody has decided a retention period, which is a DPDP question worth
  answering before there are many of them.

One thing that is easy to misread as a gap and is not: fund collections
are a **ledger**, not a payment path. That is a legal boundary, explained
in migration 085 and ARCHITECTURE.md.

### 4.3c Vacation booking payouts — Stage 2 (Razorpay Route), before launch

Booking payments work end to end (guest pays upfront via Razorpay;
decline/cancel refunds are automatic — migrations 126–128, four
`*-booking*` edge functions). Host payouts are **Stage 1**: money
accumulates in the platform Razorpay account, hosts register a UPI/bank
account in Owner Profile → Billing, and an admin executes each transfer
manually from `/admin/payouts` (completed stays and no-shows are owed
automatically; late-cancel forfeits default to the platform and the
admin releases or keeps each one). Stage 1 is fine for early volume but
does not scale and makes the platform a manual money-forwarder.

**Stage 2 is Razorpay Route — do these before launch:**

1. **Apply for Route now** — it is approval-gated and the clock is
   Razorpay's. Dashboard (Live mode) → sidebar **Route** → Get
   Started/Activate; if the product isn't visible, raise a support
   ticket asking for Route activation for marketplace host payouts.
   Prerequisite: live-mode KYC/activation complete.
2. **Host onboarding as linked accounts.** Each host completes KYC with
   Razorpay and becomes a linked account (`acc_*`). Store the linked
   account id on `host_payout_accounts` (add a column; the table and its
   RLS already exist). Build the "connect your Razorpay account" step in
   the Payout Account card (replaces/supplements the raw UPI/bank form
   for Route-onboarded hosts).
3. **Split at capture.** In `create-booking-order`, attach `transfers[]`
   to the order (host's linked account gets `base_amount`, platform
   retains `service_fee`) — or create transfers post-capture from
   `verify-booking-payment` for held-until-checkout semantics. Decide
   hold policy first: Route supports `on_hold` transfers released later,
   which matches the current "payout after check-out" promise.
4. **Refund interplay.** Declines/cancellations currently refund the full
   payment from the platform balance. With Route splits, a refund after
   transfer needs a **transfer reversal** first — wire reversals into
   `respond-booking` / `cancel-booking` for any booking whose transfer
   already settled, or keep transfers on hold until the refund window
   closes (simpler; recommended).
5. **Webhooks.** Subscribe to `transfer.processed` / `transfer.failed`
   (and settlement events) in the existing `razorpay-webhook` function
   and flip `vacation_bookings.payout_status` from them — the admin
   queue then only handles exceptions and forfeit decisions.
6. **Reconciliation view.** Once splits are automatic, extend
   `/admin/payouts` to show Route transfer state instead of manual
   mark-paid for Route-onboarded hosts; keep the manual path as fallback
   for hosts who never complete linked-account KYC.

Until Route is approved, Stage 1 is the operating procedure — nothing
blocks bookings, but plan the launch messaging around "payouts within N
days" that an admin can actually honor manually.

### 4.4 Auth configuration — production Site URL corrected

This was the live production bug: Supabase **Site URL** was
`http://localhost:3000`, so password resets and Google OAuth bounced real
users to localhost (Supabase silently falls back to Site URL when a
`redirectTo` isn't allow-listed). **Fixed this session** — Site URL is now the
production Vercel URL and the production `/**` plus `http://localhost:3000/**`
redirect URLs were added. Application code was always correct
(`window.location.origin` throughout); this was dashboard config.

Still verify before native launch: the Redirect URLs list must also include
the native OAuth deep link `com.bhavan.app://auth/callback` (required for
native Google sign-in — see ANDROID_RELEASE.md). Confirm it is present on
both the production and staging projects.

### 4.5 Accessibility

Roughly 152 `<input>` elements across the app against 11 files using
`aria-label`, no focus traps in modals, and data tables that don't work at
mobile widths. This has had no dedicated pass. If Bhavan is ever procured
by an institution or challenged under accessibility rules, this is where
it fails.

### 4.6 Smaller, real (still open)

Two hardening passes on 2026-08-25 (migrations 141–150 plus edge-function and
frontend fixes) closed ~50 correctness/security audit findings across the
database, edge functions and the UI — a critical self-registration-as-admin
hole, refund idempotency, RLS write gaps, a signed-agreement delete guard,
Aadhaar name-binding, and a batch of broken or half-wired UI (a dead 404,
profile-save, admin queues that hid fetch errors, chat unread badges, and
more). The codebase is now clean of known defects except the blockers above
and the small items below. (The per-finding registers were removed from this
doc once resolved; they live in git history and migrations 141–150.)

Genuinely still open, small:

- **`audit_logs` is dormant** — the table exists and nothing writes to it.
  Wire it to admin actions or drop it; a security table everyone assumes is
  populated is worse than none.
- **Pro entitlements are mostly client-side.** The purchase is server-
  verified and the free-tier one-vacation-listing cap is enforced via
  `has_pro()` (migration 126), but the ~13 advertised Pro features are gated
  (where at all) only in React — move those into RLS. See §4.3e.
- **No cross-tenancy review rate limit** — one review per tenancy is enforced
  (unique index, migration 107), but nothing caps how many *different*-tenancy
  reviews one user posts. Minor.
- ~~Unused Font Awesome (~18 KB) and dead i18n scaffolding.~~ Done: Font Awesome
  is gone (only Remix Icon is loaded in `index.html`), and the i18n dependency
  and scaffolding were removed.

### 4.7 Known residuals — small, documented, not blockers

Real but low-severity; each is a conscious "later," not an unknown.

- ~~Society badge counts undercount past page 1.~~ Done: `get_society_badge_counts`
  (migration 153) returns server-side counts over the *unpaginated* set, consumed
  by `useSocietyBadgeCounts`; `society/page.tsx` no longer counts over the loaded
  20-row page.
- **No dedicated society-push toggle.** Society notices/polls/collections are
  typed `platform`/`maintenance`/`payment`, so they follow those toggles. A
  separate switch needs a new `community` notification type, retyping those
  inserts, and a `send-push` mapping.
- **Consumer route role-guards.** `/tenant-profile`, `/owner-profile`, etc. are
  reachable by either role (self-gated by `if (!user)`, own-user-id scoped,
  RLS-backed — no cross-user leak); a role redirect would be polish.
- ~~Chat previews over-fetch.~~ Done: `getLastMessagesByRequest` /
  `getUnreadCountsByRequest` now call `DISTINCT ON` RPCs (`get_last_messages_by_request`
  / `get_unread_counts_by_request`, migration 152) instead of pulling full thread
  histories. (Login still makes 2–3 redundant `get_my_profile` calls — same
  Low-perf bucket, still open.)
- ~~Listing-detail badges render unconditionally.~~ Done: `useListingDetail`
  now maps `owner.verified_aadhaar` into `owner_verified_aadhaar`, and the
  listing-detail and scan-landing owner badges render from it (neutral
  "Property Owner" when unverified). The fake green "Active" presence dot —
  which had no signal behind it — was removed.
- **By design, not bugs.** A confirmed vacation booking counts as one inquiry
  (its `connection_requests` row genuinely carries the host↔guest chat); and
  there is no "end tenancy" action — a completed open-ended agreement stays
  active until the row is removed.

### 4.8 Android build — verified

Builds clean. `assembleDebug` exits 0 (JDK from Android Studio's bundled
JBR, SDK at the default location; neither `JAVA_HOME` nor `ANDROID_HOME`
is set globally, so set them for the session). Gradle output is redirected
to `C:\bhavan-build`, not `android/app/build` — look there for artifacts.

- Debug APK: `C:\bhavan-build\app\outputs\apk\debug\app-debug.apk`,
  ~11.3 MB, current with the synced web assets.
- Release APK: `app-release-unsigned.apk`, ~3.1 MB — minify and
  shrinkResources are clearly working (3.6× smaller), but it is
  **unsigned**: `android/keystore.properties` does not exist on this
  machine, so `signingConfigs.release` finds nothing. Generate the upload
  keystore before the first Play upload.

This supersedes §4.2's "never built" for Android. iOS is unchanged and
still unbuilt.

### 4.9 Push notifications — working on web, native untested

**Web push works end to end and is verified** — a chat message creates a
notification, the trigger dispatches it, FCM accepts it, and it arrives on a
registered device (`notifications.push_delivered` flips to true), confirmed
against production on a real device. **Push is not a launch blocker for web.**
Getting here took three fixes worth knowing if you touch it: chat messages
weren't creating a `notifications` row (070); the AFTER-INSERT notify trigger
briefly aborted chat sends on the `notifications.type` CHECK (071); and
`PushManager.subscribe()` ran before the service worker was active (no tokens
registered).

Residuals:

- **One Windows/Edge machine** fails to register (*"push service error"*)
  while iOS Safari on the same account registers fine and the server side is
  proven healthy — so it's that browser failing to reach its own push service
  (network / VPN / Windows notification settings), not app config. **Don't
  chase the VAPID key**: it isn't validated at `subscribe()` time (VAPID is
  project-agnostic; a mismatched key fails later, at *send*).
- **Native push (Capacitor) has never executed** — there is no app to run it
  in yet (§4.2). Verify it when the app builds.

---

## 6. Operational docs

| Document | Covers |
|---|---|
| [INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md) | On-call runbook: severity levels, rollback, credential rotation |
| [PUSH_SETUP.md](PUSH_SETUP.md) | FCM setup, service account, VAPID, native prerequisites |
| [e2e/README.md](e2e/README.md) | Test tiers, fixture accounts, CI behaviour |
| `supabase/functions/send-sms-hook/README.md` | MSG91 OTP wiring |

---

## 7. Things that will surprise you

Each of these was a real bug, not a hypothetical:

- **`INSERT ... ON CONFLICT DO UPDATE` evaluates the UPDATE policy against
  the *existing* row.** Push token reassignment across account switches
  could never work as an upsert; it needs a `SECURITY DEFINER` RPC
  (migration 068).
- **The contact rate limit never worked** until migration 062 — the anon
  client hit an admin-only SELECT policy and silently got zero rows, so
  the limit always passed.
- **Admin MFA was decorative at the API layer** until 066. `is_admin()`
  checked role only, so a leaked admin password gave full REST access
  regardless of MFA. A code comment claimed RLS enforced it. It didn't.
- **Vercel "Sensitive" environment variables cannot be read by
  `vercel pull` from CI** — it returns the literal string `[SENSITIVE]`,
  which builds a working bundle pointed at a nonexistent backend. The flag
  is one-way; you must delete and re-add the variable.
- **SPA rewrites make a missing JS chunk return `200 text/html`**, so a
  stale client fails with a syntax error rather than a 404. There's a
  one-shot reload guard in `ErrorBoundary.tsx`.

---

## 8. Suggested order of work

1. Staging Supabase project is stood up and the RLS CI job runs against it
   (§4.1); the one piece left is repointing **E2E** at staging
   (`E2E_SUPABASE_URL`/keys + fixture accounts)
2. ~~Fix Supabase Site URL / Redirect URLs~~ — done (§4.4); before native
   launch, just confirm the `com.bhavan.app://auth/callback` deep link is in
   the Redirect URLs
3. Razorpay: confirm live keys, set the **real** `RAZORPAY_WEBHOOK_SECRET`
   (the current one is a placeholder) and add the dashboard webhook
   subscribed to `payment.captured` + `payment.failed` + `refund.processed`
   (§4.3), and **apply for Route immediately** — its approval clock is the
   long pole for both booking and rent payouts (§4.3c, §4.3d)
4. Decide Pro's launch story: gate the advertised features with
   `has_pro()` / a `hasFeature()` check, or trim the pricing page to what
   is actually enforced — do not charge for Pro until one of these is
   done (§4.3e)
5. Decide rent's launch story: leave rent collection off / owner-marks-
   paid until Route, or wire rent payouts in Route stage 2 (§4.3d)
6. Payouts Stage 2 (bookings + rent) once Route is approved (§4.3c, §4.3d)
7. `cap add android` → device testing → Play Store (§4.2)
8. iOS after Android — longer review cycle, more account setup
9. Aadhaar and phone-OTP providers, contracts permitting (§4.3)
10. Accessibility pass (§4.5), then the §4.6/§4.7 residuals

Items 1–5 are the web launch blockers (**web push already works — §4.9**; for
item 3 the Route *application* is the blocker — approval and Stage 2 can land
after launch as long as manual payouts are honored; items 4–5 are "don't take
money for what you don't deliver" gates). Item 7 onward is a separate project
in practice; scope it as one.

---

## 9. Effort estimate

Planning numbers, not a commitment. Assumes **one senior full-stack
developer**, comfortable with React and Postgres/RLS but new to this
codebase, working focused days. Whoever takes this should re-baseline it
after a week — they'll know their own velocity better than this document
does.

"Days" means engineering days. Calendar time is longer, and for several
items the constraint is a third party, not the work (see the end).

### Shared — done once, benefits every platform

| Work | Days |
|---|---|
| Ramp-up on the codebase (RLS-heavy, ~197 source files) | 3–5 |
| Staging Supabase project + repoint CI/E2E (§4.1) | 3–4 |
| Supabase Site URL / redirect config (§4.4) | 0.5 |
| Razorpay live keys + webhook dashboard wiring (webhook code + idempotency + `payment.failed`/`refund.processed` already built) | 1–2 |
| Pro entitlements moved into RLS (§4.6) | 2–3 |
| Accessibility pass (§4.5) | 5–8 |
| §4.7 residuals: `audit_logs` wiring, review rate limit, society count RPC (the ~50 audit findings + the refund crash-window are already fixed) | 1 |
| Aadhaar provider integration, once a contract exists | 3–5 |
| MSG91 OTP wiring | 2–3 |

Staging is the widest range for a reason: migrations rebuild the *schema*,
but auth settings, storage buckets, edge-function secrets, cron jobs and
`pg_net` config are not in them. Expect to discover config drift.

### Web

Launch blockers only — staging, auth config, Razorpay + webhook (web push
already works, §4.9): **7–11 days (~2 weeks)**.

Everything above, including accessibility and the RLS entitlements:
**+12–18 days (~3–4 weeks)**.

### Android

| Work | Days |
|---|---|
| First successful device build (project already scaffolded) | 1–2 |
| `google-services.json`, verified delivery (plugins already synced) | 1–2 |
| Deep links so a notification tap lands on the right screen | 2–3 |
| Native UX: safe areas, back button, keyboard avoidance, scroll | 4–6 |
| Razorpay in the native shell (different from the web SDK) | 3–5 |
| Camera / file upload + runtime permissions | 2–3 |
| Play Console, data safety form, listing assets, testing track | 2–3 |
| Device-matrix testing and the fixes it produces | 4–6 |

**~18–28 days (~4–6 weeks).**

Some of this is already spent (§4.2, §4.8): Android builds clean and was
walked on an emulator, the four Capacitor plugins are synced, native Google
sign-in (Custom Tabs + deep link) and native camera/photo upload are wired,
and the back button + a My-Society pass were verified on-device. So the
first-build row is effectively retired and several rows start part-done —
the remaining time is real-device UX, Razorpay-in-shell, deep links, store
setup and the device matrix. The estimate's low end is the more likely one.

### iOS

| Work | Days |
|---|---|
| Xcode signing and provisioning (project already scaffolded, SPM not CocoaPods) | 1–2 |
| APNs key, verified delivery (background mode already set) | 1–2 |
| Universal links (needs an AASA file served from the domain) | 2–3 |
| Native UX: notch / dynamic island / safe areas | 3–5 |
| Razorpay on iOS (cheaper if Android went first) | 2–4 |
| App Store Connect, privacy labels, ATT if applicable | 2–3 |
| Device testing + review-rejection fixes | 3–5 |

**~14–23 days (~3–5 weeks)**, plus review latency.

Doing iOS *after* Android is materially cheaper — deep-link design, native
UX patterns and the payment integration all transfer. Running them in
parallel with one developer does not save time.

### Waiting, not working

These run concurrently with engineering if started early, and block
launch if started late:

| Gate | Typical |
|---|---|
| Razorpay KYC / live activation | 3–10 days |
| MSG91 DLT template registration (mandatory in India) | 1–3 weeks |
| KYC provider contract for Aadhaar | 2–6 weeks (commercial) |
| Apple Developer account approval | days; longer for an org needing D-U-N-S |
| App Store review | 1–7 days per submission; first is often rejected |
| Google Play review | up to ~7 days |

Check Google Play's current requirements for **new personal developer
accounts** before choosing the account type — Play has required a closed
test with a minimum number of testers over a fixed period before
production access, which is calendar time you cannot compress. Verify the
policy as it stands today; it has changed more than once.

### Rough totals, one developer

- **Web, launch-blocking only:** ~2–3 weeks
- **Web, properly production ready:** ~5–7 weeks
- **+ Android:** ~4–6 weeks more
- **+ iOS:** ~3–5 weeks more
- **Everything, sequential:** roughly **4–6 months** calendar, including
  third-party gates

### What could blow this up

- **Native UX rework.** The UI was built web-first, and the data tables
  are already known to be unusable at mobile widths. That debt lands
  hardest on the app builds, and it's the line item most likely to double.
- **Razorpay in a native shell** — the integration that most often turns
  out fiddlier than planned.
- **Native push on the app builds (§4.9)** — web push works, but the
  Capacitor path has never executed; budget time to prove it on-device.
- **Staging bring-up** surfacing config that was only ever set by hand in
  the dashboard.

---

## 10. Access the new developer needs

GitHub repo · Supabase project (owner) · Vercel project · Firebase project
`bhavan-f7b8e` · Razorpay dashboard · domain DNS · MSG91 and KYC provider
accounts once they exist · Google Play and Apple Developer accounts.

**Rotate before or immediately after handover:** the Supabase service-role
key, the Firebase service account, and the Razorpay key secret. These have
been used in local development and appear in developer shell history.

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

Scale: 26 migrations (001 is a squashed baseline), 14 edge functions,
48 tables, 153 RLS policies, 110 unit tests, 50 E2E tests.

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
- Chat, with notifications and push dispatch (§5 caveat on delivery)
- Rental agreements and rent receipts, with Indian legal formatting
- Rent payments and Pro subscription via Razorpay, signature-verified server-side
- Admin panel with enforced TOTP MFA
- Self-service account deletion with a DPDP-aware retention carve-out
- Server-side rate limiting, error logging, error-rate alerting
- RLS audited across all tables; several real holes closed (migrations 047–053)
- CI gating deploys; DB rebuildable from `supabase/migrations/`
- Societies: join by code behind the existing owner verification, Bhavan
  review queue, member admin, notices, maintenance with discussion, and a
  fund-collection ledger — all entitlement-gated in RLS, 18 E2E tests, and
  walked on an Android emulator

---

## 4. NOT production ready

### 4.1 No staging environment — fix this first

There is **one** Supabase project and it is production. Every migration
in this repo was applied to it directly, and the E2E suite points at it.

This is the single biggest structural risk you inherit. Before doing
anything else, create a second Supabase project, apply
`supabase/migrations/` to it, and repoint CI and E2E at it. The
migrations are designed to rebuild from scratch, so this should work —
`001_baseline.sql` is a real baseline generated from live system
catalogs, not a hand-written guess.

Until that exists, CI runs only the tests that need no backend (7 of 32).

### 4.2 Mobile: scaffolded, never built or run

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
**None are gated.** `FREE_TIER_LIMITS` in `src/lib/subscriptionConfig.ts`
is `Infinity` on every count, `PRO_FEATURE_KEYS` is defined but never
consulted, and `isPro` is read only to render the billing tab — no
feature checks it. So a free user has everything a paid user does, and
charging for Pro today is selling access that isn't withheld.

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

### 4.4 Auth configuration is wrong in production

Supabase **Site URL** is still `http://localhost:3000`, and the Vercel URL
is not in the Redirect URLs allow-list. Supabase silently falls back to
Site URL when a `redirectTo` isn't allow-listed, so password resets and
Google OAuth currently bounce real users to localhost. Application code is
correct (`window.location.origin` throughout) — this is dashboard config.

Fix: Authentication → URL Configuration → Site URL = production URL;
Redirect URLs = production `/**` plus `http://localhost:3000/**`.

### 4.5 Accessibility

Roughly 152 `<input>` elements across the app against 11 files using
`aria-label`, no focus traps in modals, and data tables that don't work at
mobile widths. This has had no dedicated pass. If Bhavan is ever procured
by an institution or challenged under accessibility rules, this is where
it fails.

### 4.6 Smaller, real

- **Source maps are published in production** (`vite.config.ts: sourcemap: true`).
  Good for debugging, but it ships readable source. Decide deliberately;
  the usual answer is to upload them to an error tracker instead.
- **Unused dependencies**: `@stripe/react-stripe-js` and `recharts` have
  zero source references. Remove them.
- **`audit_logs` is dormant** — the table exists and nothing writes to it.
  Either wire it to admin actions or drop it; a security table everyone
  assumes is populated is worse than none.
- **Pro entitlements are client-side only.** The subscription purchase is
  server-verified, but what a Pro user is *allowed to do* is enforced in
  React. Move the gates into RLS.
- **Reviews have no uniqueness or rate limit** — nothing stops one user
  submitting many reviews for the same tenancy.
- **The `geocode` edge function is an open proxy** — no auth, no rate
  limit. Fine at current volume, a bill risk at scale.
- ~18KB of unused Font Awesome; dead i18n scaffolding.

---

## 5. Push notifications — state

**Working and verified end to end.** A chat message creates a
notification, the trigger dispatches it, FCM accepts it, and it arrives
on a registered device (`notifications.push_delivered` flips to true).
Confirmed against production on a real iOS device.

Three bugs were fixed to get there, all worth knowing about:

1. Chat messages never created a `notifications` row, so the dispatcher —
   which fires on insert into that table — never saw them (migration 070).
2. Migration 071 exists because 070 alone broke chat message *sending* for
   about two minutes: `notifications.type` has a CHECK constraint that
   rejected the new value, and because the trigger is AFTER INSERT the
   rejection aborted the transaction. A cautionary tale about trigger-based
   side effects.
3. `PushManager.subscribe()` was called before the service worker became
   active, so no browser could register a token — `user_push_tokens` was
   empty for every account.

### Known limitation

One Windows/Edge machine still fails to register with
*"Registration failed – push service error"*. iOS Safari on the same
account registers fine, and the server side is proven healthy (FCM
rejects a bogus token with a precise, correct error, which means the
service account authenticates and the FCM v1 API is enabled). So this is
the browser failing to reach its own push service — network, VPN, or
Windows notification settings — not app configuration.

**Do not go looking at the VAPID key for this.** The key is not validated
against the Firebase project at `subscribe()` time; VAPID is
project-agnostic and a mismatched key fails later, when *sending*. The
banner now says as much rather than surfacing a raw DOMException.

Native push (Capacitor) has still never executed — there is no app to run
it in (§4.2).

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

1. Stand up a staging Supabase project; repoint CI and E2E (§4.1)
2. Fix Supabase Site URL / Redirect URLs — this affects real users today (§4.4)
3. Close out push (§5), then confirm delivery end-to-end on web
4. Razorpay: confirm live keys, set the **real** `RAZORPAY_WEBHOOK_SECRET`
   (the current one is a placeholder) and add the dashboard webhook
   subscribed to `payment.captured` + `refund.processed` (§4.3), and
   **apply for Route immediately** — its approval clock is the long pole
   for both booking and rent payouts (§4.3c, §4.3d)
5. Decide Pro's launch story: gate the advertised features with
   `has_pro()` / a `hasFeature()` check, or trim the pricing page to what
   is actually enforced — do not charge for Pro until one of these is
   done (§4.3e)
6. Decide rent's launch story: leave rent collection off / owner-marks-
   paid until Route, or wire rent payouts in Route stage 2 (§4.3d)
7. Payouts Stage 2 (bookings + rent) once Route is approved (§4.3c, §4.3d)
8. `cap add android` → device testing → Play Store (§4.2)
9. iOS after Android — longer review cycle, more account setup
10. Aadhaar and OTP providers, contracts permitting (§4.3)
11. Accessibility pass (§4.5), then the §4.6 list

Items 1–6 are web launch blockers (for item 4, the Route *application*
is the blocker — approval and Stage 2 can land after launch as long as
manual payouts are honored; items 5–6 are "don't take money for what you
don't deliver" gates). Item 8 onward is a separate project in practice;
scope it as one.

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
| Ramp-up on the codebase (RLS-heavy, 157 files) | 3–5 |
| Staging Supabase project + repoint CI/E2E (§4.1) | 3–4 |
| Supabase Site URL / redirect config (§4.4) | 0.5 |
| Finish and verify push delivery (§5) | 1–3 |
| Razorpay live keys + webhook + idempotency | 2–3 |
| Pro entitlements moved into RLS (§4.6) | 2–3 |
| Accessibility pass (§4.5) | 5–8 |
| Small items: source maps, unused deps, `audit_logs`, review rate limit, `geocode` auth | 2–3 |
| Aadhaar provider integration, once a contract exists | 3–5 |
| MSG91 OTP wiring | 2–3 |

Staging is the widest range for a reason: migrations rebuild the *schema*,
but auth settings, storage buckets, edge-function secrets, cron jobs and
`pg_net` config are not in them. Expect to discover config drift.

### Web

Launch blockers only — staging, auth config, push, Razorpay + webhook:
**8–13 days (~2–3 weeks)**.

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
- **The open push bug (§5)** — hours if it's the VAPID key, days if not.
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

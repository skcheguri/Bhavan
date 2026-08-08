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

**Aadhaar verification — not wired.** `supabase/functions/aadhaar-verify`
is written against a generic KYC provider shape and returns
*"Aadhaar verification provider is not configured yet"* until
`AADHAAR_PROVIDER_BASE_URL` and `AADHAAR_PROVIDER_API_KEY` are set. Needs
a commercial contract with a KYC provider (SurePass, Signzy, Karza).
There are legal constraints on who may perform Aadhaar authentication in
India — get this reviewed before wiring, not after.

**Phone OTP — hook written, account not connected.** `send-sms-hook`
delivers Supabase-generated OTPs via MSG91 (Supabase natively supports
only Twilio/MessageBird/Vonage). Needs an MSG91 account, DLT template
registration (mandatory in India, and slow), and the hook enabled in
Supabase Auth settings.

**Razorpay — verify the mode, and finish the webhook setup.** Signature
verification is implemented and unit-tested. Confirm whether
`RAZORPAY_KEY_ID` is test or live, and complete Razorpay KYC.

The webhook now exists (`razorpay-webhook`, deployed) and covers rent, Pro
and society payments, but **it does not work until two things are done in
the Razorpay dashboard**, and until then it fails in the way that looks
exactly like it was never called:

1. Add the endpoint under Settings → Webhooks:
   `https://edythmogblkmsjfcbatc.supabase.co/functions/v1/razorpay-webhook`
   subscribed to **`payment.captured`**.
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

**Push delivery — actively broken, under investigation.** See §5.

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

One thing that is easy to misread as a gap and is not: fund collections
are a **ledger**, not a payment path. That is a legal boundary, explained
in migration 085 and ARCHITECTURE.md.

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
4. Razorpay: confirm live keys, add the webhook (§4.3)
5. `cap add android` → device testing → Play Store (§4.2)
6. iOS after Android — longer review cycle, more account setup
7. Aadhaar and OTP providers, contracts permitting (§4.3)
8. Accessibility pass (§4.5), then the §4.6 list

Items 1–4 are web launch blockers. Item 5 onward is a separate project in
practice; scope it as one.

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

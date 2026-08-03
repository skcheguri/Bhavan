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

| Layer | Choice |
|---|---|
| Frontend | React 19 + TypeScript + Vite, Tailwind, react-router 8 |
| Backend | Supabase (Postgres + RLS + Auth + Storage + Edge Functions on Deno) |
| Payments | Razorpay (orders + HMAC signature verification, server-side only) |
| Push | Firebase Cloud Messaging (HTTP v1) for web; Capacitor for native |
| Hosting | Vercel, deployed from GitHub Actions after CI passes |
| Mobile | Capacitor — **configured but never generated, see §4** |

Scale: 157 source files, 9 migrations (001 is a squashed baseline), 11
edge functions, 97 unit tests, 32 E2E tests.

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

### 4.2 Mobile does not exist yet

This is the item most likely to be underestimated. Capacitor is
*configured* — dependencies, `capacitor.config.ts`, `cap:sync` /
`android:open` / `ios:open` scripts, and `.gitignore` entries for native
secrets. But `npx cap add android` and `npx cap add ios` have **never
been run**. There is no `android/` or `ios/` directory. No native project
has ever been built, launched, or tested on a device.

Everything below is outstanding:

| | Android | iOS |
|---|---|---|
| Native project (`cap add`) | not created | not created |
| Push credentials | `google-services.json` | APNs auth key + entitlements |
| Signing | keystore | certificates + provisioning profiles |
| Store account | Google Play (₹2,000 one-time) | Apple Developer ($99/yr) |
| Store listing | screenshots, description, privacy labels | same + App Privacy questionnaire |
| Review | Data safety form | App Tracking Transparency if applicable |

Plus work that only surfaces once a native shell exists: deep-link /
universal-link config so notification taps open the right screen, safe-area
insets, hardware back button on Android, keyboard avoidance, and the
Razorpay checkout inside a WebView (which is a different integration from
the web SDK and needs its own testing).

The native push path in `usePushNotifications.ts` is written but has
**never executed** — there has been no device to run it on.

Treat "web works" as no evidence at all about mobile.

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

**Razorpay — verify the mode.** Signature verification is implemented and
unit-tested, but I could not read the configured keys (Supabase secrets).
Confirm whether `RAZORPAY_KEY_ID` is test or live, complete Razorpay KYC,
and note that **no webhook is configured** — payment recovery currently
depends on the client returning from checkout. A webhook is the standard
safety net for the case where the user closes the tab mid-payment.

**Push delivery — actively broken, under investigation.** See §5.

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

## 5. In flight right now (as of handover)

**Push notifications don't reach devices yet.** Two bugs found and fixed
today; a third is open.

1. Chat messages never created a `notifications` row, so the push
   dispatcher — which fires on insert into that table — never saw them.
   Fixed in migration 070. *(Note: 071 exists because 070 alone broke
   chat message sending for about two minutes — `notifications.type` has
   a CHECK constraint that rejected the new value, and because the trigger
   is AFTER INSERT it aborted the transaction. Worth reading as a warning
   about trigger-based side effects.)*
2. `PushManager.subscribe()` was called before the service worker became
   active, so no device could ever register a token — `user_push_tokens`
   was empty for every account. Fixed by waiting for activation.
3. **Open:** subscription now fails with *"Registration failed – push
   service error"* on Edge. Not yet isolated. The VAPID key is
   well-formed and the service worker installs cleanly, so the suspects
   are (a) the VAPID key not belonging to Firebase project `bhavan-f7b8e`,
   or (b) the browser's push service. Diagnostic snippet and reasoning are
   in the session notes; the fastest split is to try Chrome.

Push has **never been confirmed delivered end-to-end on any platform.**
Treat it as unproven.

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

## 9. Access the new developer needs

GitHub repo · Supabase project (owner) · Vercel project · Firebase project
`bhavan-f7b8e` · Razorpay dashboard · domain DNS · MSG91 and KYC provider
accounts once they exist · Google Play and Apple Developer accounts.

**Rotate before or immediately after handover:** the Supabase service-role
key, the Firebase service account, and the Razorpay key secret. These have
been used in local development and appear in developer shell history.

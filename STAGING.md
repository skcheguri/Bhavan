# Staging — bring-up runbook (Part A)

A separate **staging** environment so no fix is ever tested against
production. Steps marked **[you]** are dashboard/account actions only you can
do; **[auto]** are scripts/commands in this repo.

> **Golden rule:** staging and production are separated **by environment, not
> by a flag**. Production env values are never put in staging and vice versa.
> Test keys, the Aadhaar OTP bypass, and demo data are staging-only.

---

## 1. Create the staging Supabase project **[you]**
In the Supabase dashboard → New project (same org). Note its **project ref**
and keys. Put the ref/keys only in local env files and CI secrets — **never
commit them**.

## 2. Rebuild the schema on staging from scratch **[you + auto]**
Prove the migrations rebuild on an empty project:
```bash
npx supabase link --project-ref <STAGING_REF>
npx supabase db push
```
If any migration fails on a fresh project, fix it with a **new** numbered
migration (never edit an applied one) and report it. Then regenerate types:
```bash
npm run gen:types
npm run type-check
```

## 3. Staging env file **[you]**
Create `.env.staging` (gitignored) with the **staging** values:
```
VITE_PUBLIC_SUPABASE_URL=<staging url>
VITE_PUBLIC_SUPABASE_ANON_KEY=<staging anon key>
```
Confirm `.env` (production) is untouched.

## 4. Auth URL configuration **[you]** — fixes a live production bug too
Supabase → Authentication → URL Configuration:
- **Staging:** Site URL = staging URL; Redirect URLs = staging `/**` +
  `http://localhost:3000/**`.
- **Production (fix now):** Site URL = production URL; Redirect URLs =
  production `/**`, `http://localhost:3000/**`, **and the native deep link
  `com.bhavan.app://auth/callback`**. Until this is set, password resets and
  Google OAuth bounce real users to localhost.

## 5. Vercel **[you]**
A staging/preview deployment that uses **staging** env vars only; production
keeps production env vars only. Keep git auto-deploy to production **off** —
production deploys only after CI is green.

## 6. GitHub Actions E2E → staging **[you]**
Set repo secrets `E2E_SUPABASE_URL`, `E2E_SUPABASE_ANON_KEY` (staging), and
staging fixture accounts. **E2E must never run against production.**

## 7. Test-mode integrations — staging only **[you]**
Set as **staging** Supabase function secrets / env, never production:
- Razorpay **TEST** keys (`rzp_test_…`) + the **test** webhook secret.
- `AADHAAR_MODE=ocr` with IDfy self-serve test credentials, **or**
  `AADHAAR_OTP_TEST_CODE=123456` to exercise the OTP UI. The code is dead when
  unset; **never set it in production.**
- Phone OTP is not needed for the pilot — onboard via email/Google.

Everything here is env-driven with no hardcoded fallback, so none can leak to
production.

## 8. Seed demo data **[auto]** — staging only
See `scripts/demo-seed/README.md`. Validate first, then import:
```bash
npm run seed:demo -- --file my-demo.json --validate-only
STAGING_SUPABASE_URL=... STAGING_SERVICE_ROLE_KEY=... DEMO_USER_PASSWORD=... \
PROD_SUPABASE_URL=<prod url, as a guard> \
npm run seed:demo -- --file my-demo.json --confirm
```
The importer refuses to run if the staging URL equals the prod URL, and labels
everything DEMO. City/locality/society are data — works for any city.

## 9. Part A acceptance test — run all in staging, record pass/fail
- [ ] Sign up / sign in / sign out / password reset as a test tenant **and** a test owner
- [ ] Create a listing; browse / search / filter it
- [ ] Connection request → owner approval → chat
- [ ] Generate an agreement and a receipt; print-preview both
- [ ] One Razorpay **TEST** payment flips a row to `paid`
- [ ] One dashboard refund flips a row to `refunded`
- [ ] **Confirm production received zero writes** (check prod row counts before/after)

Record results here (date, each item, pass/fail). **Stop and report Part A
before starting Part B** if any migration, auth redirect, or test payment fails.

---

## Resetting staging
To wipe and re-seed staging: on the staging project, drop the public schema and
re-run `npx supabase db push`, then re-run the seed. Never run a reset against
production. (A documented dry-run purge/rename for *production* test data is a
separate PR — see the prompt Part C4 / Hard Rule 4.)

## Env mapping (names only — no secrets in git)
| Where | Vars | Scope |
|---|---|---|
| `.env` | `VITE_PUBLIC_SUPABASE_URL`, `VITE_PUBLIC_SUPABASE_ANON_KEY` | production |
| `.env.staging` | same names, staging values | staging |
| Supabase fn secrets (staging) | `RAZORPAY_*` (test), `AADHAAR_*` (test), service role | staging |
| GitHub secrets | `E2E_SUPABASE_URL`, `E2E_SUPABASE_ANON_KEY`, fixtures | staging |
| Vercel | preview = staging vars; production = prod vars | both, separated |

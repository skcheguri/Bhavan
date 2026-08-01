# E2E tests

These run against a real instance of the app (Playwright's `webServer`
config starts `npm run dev` automatically if one isn't already running)
using whatever Supabase project your local `.env` points at -- real
routing, real Supabase calls, real RLS. This is different from the
Vitest suite in `src/`, which mocks the Supabase client entirely.

## Test data strategy

Most specs in `public-pages.spec.ts` and the client-validation checks in
`auth.spec.ts` need no seeded data -- they only assert on UI that's
present regardless of what's in the database (or use "whatever the
first listing card is," not a specific one).

Tests that need a real logged-in session (like the tenant-login example
in `auth.spec.ts`) read credentials from environment variables and
`test.skip()` themselves cleanly when those aren't set, rather than
failing:

```bash
E2E_TENANT_EMAIL=tenant@example.com E2E_TENANT_PASSWORD=... npm run test:e2e
```

**Recommended when introducing more authenticated-flow tests:** create a
handful of dedicated, clearly-named test accounts (e.g.
`e2e-tenant@yourdomain.test`) in Supabase specifically for this purpose
-- don't point E2E at your own personal account or real user data. Seed
them once by hand or with a small setup script; E2E tests should assume
they already exist rather than creating/deleting accounts on every run
(that's slow and racy against Supabase's email rate limits, which you've
already hit once manually this session).

For flows that create real rows (a maintenance request, a vacation
booking), prefer asserting the request went through via UI feedback
(a success toast, a new list item appearing) over asserting exact
database state -- and if a test creates a row it doesn't need to keep,
clean it up in the test itself (or accept it as test fixture data in a
dedicated test account, not a shared/production one).

## Critical path (`critical-path.spec.ts`)

Covers the connection-request -> owner-approval flow, the trust loop every
other feature depends on. Needs two dedicated test accounts plus a test
listing owned by the owner account:

```bash
E2E_TENANT_EMAIL=e2e-tenant@yourdomain.test
E2E_TENANT_PASSWORD=...
E2E_OWNER_EMAIL=e2e-owner@yourdomain.test
E2E_OWNER_PASSWORD=...
E2E_TEST_LISTING_ID=<uuid of a listing owned by the owner account>
```

Unlike most specs, this one creates a real `connection_requests` row and
approves it -- so an `afterAll` hook signs in as the owner (via
`VITE_PUBLIC_SUPABASE_URL`/`VITE_PUBLIC_SUPABASE_ANON_KEY`, already in your
`.env`) and deletes the row it just approved, making the suite safely
re-runnable. If that cleanup itself fails partway (e.g. the run is killed
before `afterAll` runs), the next run's tenant test will fail with a
timeout waiting for "Request to Connect" because the listing already shows
"Request Approved" -- clear it manually:

```sql
DELETE FROM connection_requests
WHERE listing_id = '<E2E_TEST_LISTING_ID>' AND tenant_id = '<e2e tenant's user id>';
```

## Money and destructive paths

`payment.spec.ts`, `subscription.spec.ts` and `account-deletion.spec.ts`
cover the three flows where a regression costs real money or destroys real
data. They share `helpers.ts`, which wraps sign-in, edge-function and
PostgREST calls.

These deliberately **do not** drive the Razorpay checkout iframe. Paying
with a test card through a third-party iframe is slow and brittle, and it
proves the least interesting part: everything that actually protects the
money is server-side. So the assertions are that you cannot order without
being signed in, cannot order against someone else's tenancy, cannot
choose your own amount or plan price, and cannot mark anything paid
without a signature only Razorpay can produce. None of these tests create
a Razorpay order, so they leave no `billing_history` residue.

Account deletion is irreversible, so that spec never touches a shared
fixture -- each destructive test creates a throwaway account and tears it
down in a `finally` block. Those tests need the Auth admin API:

```bash
E2E_SERVICE_ROLE_KEY=<service_role key from Supabase -> Settings -> API>
```

Without it they **skip** rather than fail, matching the rest of the suite.
Treat that key like a password: it bypasses RLS entirely. Keep it in your
shell or a local untracked file -- never in the repo, and never in CI
unless the CI project is a disposable one.

## Running

```bash
npm run test:e2e          # headless, once
npm run test:e2e:ui       # Playwright's interactive UI mode -- best for writing new specs
```

First run only: `npx playwright install chromium` (already done if
you're reading this after the initial testing-setup pass).

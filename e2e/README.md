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

## In CI

The `e2e` job in `.github/workflows/ci.yml` runs this suite on every push
and pull request, and production deploys are gated on it.

Two things are unconfigured in CI, and they're easy to conflate: the
**test process** has no fixture logins, and the **app under test** has no
Supabase config either, because `.env` is untracked and a fresh checkout
doesn't have one. So anything needing a live backend -- a listing to
click, a password-reset round trip -- skips, on top of the credentialed
tests skipping.

The suite is now **50 tests across 7 specs** (account-deletion 5, auth 4,
critical-path 2, payment 8, public-pages 4, society 18, subscription 9).
With nothing configured, only the backend-free tests run — static public
pages, client-side form validation, and the listings browse UI including
the collapsible filter panel; everything else skips.

Adding two **repository variables** (Settings -> Secrets and variables ->
Actions -> **Variables**, not Secrets -- both values already ship inside
the browser bundle) connects the app and enables the edge-function auth
guards and subscription pricing checks (a dozen or so more tests):

```
PUBLIC_SUPABASE_URL
PUBLIC_SUPABASE_ANON_KEY
```

Neither tier signs in nor creates rows, so pointing them at the
production project is harmless, and both work on pull requests from forks
(which cannot read repo secrets at all).

The remaining tests — the bulk of the 50, across the authenticated,
payment, deletion, critical-path and society specs — need fixture
accounts, and turning them on in CI is a decision, not a config step: they
sign in as real users and the deletion spec creates and destroys real ones. Against the production
project that means every push mutates production. Wire
`E2E_SUPABASE_URL`, `E2E_SUPABASE_ANON_KEY`, the fixture credentials and
`E2E_SERVICE_ROLE_KEY` only once a **disposable** Supabase project exists
for CI to point at.

## Running

```bash
npm run test:e2e          # headless, once
npm run test:e2e:ui       # Playwright's interactive UI mode -- best for writing new specs
```

The credentials above are read from the environment, not from `.env`
(Playwright's config doesn't load it). Keep them in a local untracked
file you source before running -- and note that a value quoted in `.env`
keeps its quotes when exported by a plain shell, which silently breaks
the Supabase URL.

First run only: `npx playwright install chromium` (already done if
you're reading this after the initial testing-setup pass).

The suite runs on a single worker by design. Almost every authenticated
spec signs in as the same two fixture accounts, and concurrent logins get
throttled by Supabase auth -- which shows up as a click timing out deep
inside an unrelated assertion, not as a login error. If you add
per-test accounts later, parallelism can come back.

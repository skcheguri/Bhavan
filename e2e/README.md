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

## Running

```bash
npm run test:e2e          # headless, once
npm run test:e2e:ui       # Playwright's interactive UI mode -- best for writing new specs
```

First run only: `npx playwright install chromium` (already done if
you're reading this after the initial testing-setup pass).

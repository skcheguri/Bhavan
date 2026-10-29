# Demo-data seed (staging only)

Validate and import owner-supplied **demo** data into a **staging** Supabase
project. It never runs against production and labels everything DEMO.

## The flow

1. Copy `template.json`, replace every value with sample data the owner
   supplies (keep the shape). City / locality / society are **data** — put any
   Indian city in; nothing is hardcoded.
2. **Validate** (no DB, no env needed):
   ```bash
   npm run seed:demo -- --file my-demo.json --validate-only
   ```
   It refuses bad rows and prints a clear error list — missing photos, missing/
   contradictory billing unit, a 0-bed residential listing, an email used as a
   name, duplicate societies, unresolved keys.
3. **Import into staging** (needs staging env — see below):
   ```bash
   STAGING_SUPABASE_URL=... STAGING_SERVICE_ROLE_KEY=... DEMO_USER_PASSWORD=... \
   PROD_SUPABASE_URL=<your prod url, as a guard> \
   npm run seed:demo -- --file my-demo.json --confirm
   ```
   `--city Hyderabad` imports only that city's rows; omit it to import all.

## Safety

- The import **aborts** if `STAGING_SUPABASE_URL` equals `PROD_SUPABASE_URL`.
- Only staging service-role credentials should ever be passed. Never run this
  with production credentials.
- Demo accounts use a `@demo.bhavan.invalid` email domain and a `[DEMO]`
  description marker so demo data is identifiable and purgeable.
- All demo users share `DEMO_USER_PASSWORD` so you can log in as any of them.

## The template fields

`owners` / `tenants`: `key` (local id), `name` (a real name, never an email),
`email` (unique), `phone` (optional), owners also `verified` (bool).
`listings`: `ownerKey`, `title`, `city`, `locality`, `state`, `category`
(`residential` | `commercial` | `vacation`), `propertyType`, `bedrooms`,
`bathrooms`, `areaSqft`, `rent`, `billingUnit` (`/mo` for non-vacation, `/night`
for vacation — validated for consistency), `deposit`, `maintenanceCharge`,
`furnished`, `parking`, `amenities[]`, `photos[]` (required), `status`.
`societies`: `adminKey`, `name`, `kind`, `city`, `state`, `address`,
`members[]`, `announcements[]`, `tickets[]`, `collections[]` (with
`contributions[]`).

## Not yet seeded

- **Rental agreements + receipts** — schema-heavy; add in a follow-up. The
  import prints a reminder.
- Connection requests, chat, property visits, vacation bookings — add later if
  the demo needs them.

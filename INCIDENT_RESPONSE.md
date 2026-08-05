# Incident Response Runbook

Practical steps for a production incident on Bhavan. This assumes a small
team (today: a single admin) — no formal on-call rotation exists yet. That
is itself a known gap; see "Known limitations" at the end.

## Stack, in one paragraph

Frontend is a Vite/React SPA deployed to **Vercel** (auto-deploys on push
to `main`, via Vercel's GitHub integration — not the GitHub Actions
workflow below). Backend is entirely **Supabase**: Postgres, Auth, Storage,
and scheduled jobs (`pg_cron`). Payments run through **Razorpay**.
`.github/workflows/ci.yml` gates every push/PR with type-check, lint, unit
tests, and a build — it does not deploy anything itself.

## Severity levels

- **SEV1 — Down or unsafe.** Site unreachable, users can't sign in at all,
  payments are being charged incorrectly, or there's a live data
  exposure/security compromise. Drop everything.
- **SEV2 — Degraded.** A major flow is broken (listings won't load,
  connection requests fail, payment webhook stops confirming) but the rest
  of the site works. Fix same day.
- **SEV3 — Isolated/minor.** A single page or edge case is broken, cosmetic
  issues, a non-security bug. Normal priority.

## Detection

You'll typically learn about an incident from one of these — check in this
order:

1. **`/admin/errors`** — the client error log. As of the error-rate
   alerting job (pg_cron, every 5 minutes, defined in
   `001_baseline.sql`; the original is kept as
   `migrations_archive/059_error_rate_alerting.sql`), a red "Error spike" badge appears on the
   Admin Dashboard's Error Logs card and a banner appears at the top of
   `/admin/errors` itself when errors cross the configured threshold
   (default: 10 in 15 minutes). No email/SMS is wired up for this yet — you
   have to look. If you later configure a webhook URL in that page's
   "Alert settings" panel, it'll also post to Slack/Discord/etc.
2. **Vercel dashboard** — deployment failures, function/build errors.
3. **Supabase dashboard** — project status, database CPU/connections,
   Auth logs, Storage. Also check https://status.supabase.com for
   provider-side outages.
4. **Razorpay dashboard** — payment/webhook delivery failures.
5. **A user reports it** — via the Contact form (`/admin/support`) or
   directly.
6. **Nothing at all.** If `check-error-rate` has stopped running, source 1
   goes quiet and looks identical to "no errors." Confirm the scheduled
   jobs are alive — see the playbook below.

## Immediate triage (first 5 minutes)

1. Confirm severity (above).
2. Check `/admin/errors` for a spike and read the actual stack traces —
   most client-side incidents show up here first with a real message and
   URL.
3. Check whether the last deploy to `main` correlates with the incident's
   start time (`git log --oneline -10` and Vercel's deployment list). A
   regression right after a deploy is the most common cause — see Rollback
   below.
4. Check Supabase's dashboard for an ongoing outage or a spike in errors
   on their side before assuming the bug is in this codebase.

## Playbooks

### Site down / broken deploy

Vercel keeps every previous deployment. Fastest recovery: in the Vercel
dashboard, find the last known-good deployment and **promote it to
production** (no CLI/git action needed, and it's instant — no rebuild).
Once stable, find and fix the regression in a new commit rather than
leaving production pinned to an old deploy indefinitely.

### Database / RLS issue

Postgres migrations in `supabase/migrations/` are **not easily reversible**
— there's no automatic "down" migration. Prefer a **forward-fix migration**
(a new numbered file that corrects the issue) over trying to hand-revert
schema or RLS policy changes. Use:

```bash
npx supabase db query --linked --file path/to/diagnostic.sql
```

to inspect state directly before writing a fix. If a bad migration was
*just* pushed and hasn't been widely relied upon yet, `supabase db push`
after correcting the migration file is usually cleaner than a manual
`DROP`/`ALTER` session — but check with the Supabase CLI's own guidance
for your case, since forcing history can diverge local and remote state.

### Payment issue (Razorpay)

- Payment signature verification is unit-tested
  (`src/lib/payments/razorpaySignature.test.ts`) but webhook delivery
  itself is external. Check Razorpay's dashboard for webhook delivery
  failures/retries first.
- Never manually mark a `rent_payments` row as paid/confirmed from the
  admin panel or SQL without confirming the actual transaction in the
  Razorpay dashboard — the status-transition RLS hole this exact scenario
  could enable was closed in migration 047; don't reopen an equivalent gap
  by hand-editing status columns as a "quick fix."
- If webhooks are failing platform-wide (not one payment), that's SEV1 —
  tenants may believe they've paid when the record hasn't updated.

### Scheduled jobs stopped (pg_cron / pg_net)

Four jobs run inside Postgres. A fifth thing to know: `check-cron-health`
watches the other three and raises a **"Job stopped"** alert on the admin
dashboard when one of them stops succeeding, so this is no longer purely a
pull check. What it cannot do is detect its own death — if the watchdog
itself stops, nothing raises an alert, which is why the manual queries
below still matter.

| Job | Schedule | If it stops |
|---|---|---|
| `check-error-rate` | every 5 min | You lose the only automated detection you have |
| `purge-unconfirmed-accounts` | 03:00 daily | Abandoned signups accumulate; cosmetic |
| `expire-lapsed-subscriptions` | 03:30 daily | **Expired Pro subscriptions keep working** — paid features given away |
| `check-cron-health` | every 15 min | The other three fail silently again; nothing else watches them |

Run these from the Supabase **SQL Editor**, or with the CLI as shown. The
dashboard equivalent is **Integrations -> Cron**; extensions are listed
under **Database -> Extensions** (expect `pg_cron` and `pg_net`).

**1. Are the jobs registered and active?**

```bash
npx supabase db query --linked "select jobid, jobname, schedule, active from cron.job order by jobname;"
```

Four rows, all `active = true`. A missing row means the migration that
creates it was never applied to this project.

**2. Are they actually succeeding?** This is the one that matters — a job
can be `active` and fail on every run.

```bash
npx supabase db query --linked "select j.jobname, d.status, count(*) runs, max(d.start_time) last_run from cron.job_run_details d join cron.job j on j.jobid=d.jobid where d.start_time > now() - interval '24 hours' group by 1,2 order by 1;"
```

Healthy looks like `status = succeeded` for all four, and **288 runs for
`check-error-rate`** — that is every five-minute slot in a day. A lower
number means runs are being skipped, which is a real problem even though
nothing failed. For the failure message on a bad run:

```bash
npx supabase db query --linked "select jobid, status, return_message, start_time from cron.job_run_details where status <> 'succeeded' order by start_time desc limit 10;"
```

**3. Did outbound calls leave the database?** Push notifications are
dispatched by a trigger calling `net.http_post`, so if push has gone quiet
and the notification rows exist, look here:

```bash
npx supabase db query --linked "select id, status_code, left(content, 80) body, created from net._http_response order by created desc limit 10;"
```

A healthy push shows `status_code = 200` with `{"sent":1,"failed":0}`.
`sent: 0` with a `firstError` means FCM rejected it — the message text
distinguishes a dead device token from a credentials problem.

Two things to know before you trust this table. It is **auto-pruned**, so
it is a short live window rather than an audit log — an empty result means
"nothing recently", not "nothing ever". And the dispatcher swallows its
own failures by design, so that a push problem can never roll back the
notification it was sent for; the in-app bell stays correct while push
silently does nothing.

Definitions live in `001_baseline.sql` (the original three jobs),
`072_cron_health_watchdog.sql` (the watchdog) and
`065_push_notifications_delivery.sql` (the `net.http_post` dispatch).

### Suspected account compromise (including admin)

- Admin panel access requires TOTP MFA as of the mandatory-enrollment
  change (see `src/components/feature/RequireAdmin.tsx`) — a compromised
  admin password alone is no longer sufficient to reach `/admin`.
- To lock out a compromised admin session immediately: revoke their
  sessions from the Supabase Auth dashboard (Authentication → Users → the
  account → "Revoke sessions"), then reset their password.
- If their TOTP factor may also be compromised (e.g. they lost the device
  *and* it's a security concern, not just inconvenience), delete their row
  from `auth.mfa_factors` via SQL so they're forced through
  `/admin/mfa-setup` again on next login — self-service re-enrollment
  (`/admin/security`) only works from an already-aal2 session, by design
  (see the comment at the top of `src/pages/admin/security/page.tsx`).
- Check `client_error_logs` for anything unusual in the surrounding window.
  There is a dormant `audit_logs` table in the schema (action/before/after
  columns, admin-only read policy) but **nothing in the app currently
  writes to it** — don't rely on it as an active audit trail until
  something is wired up to populate it.

### Personal data breach (DPDP Act obligations)

The Privacy Policy (Section 8) commits to notifying affected users and the
Data Protection Board of India for a breach "likely to affect" a Data
Principal. In practice, if you determine personal data was exposed
(not just a bug with no data impact):

1. Contain it first (revoke access, patch the RLS/auth gap, rotate any
   exposed keys) — see the specific playbook above for the failure mode.
2. Identify what data and which users were actually affected — Supabase
   query the relevant table(s) scoped to the incident window.
3. Draft and send a plain-language notice to affected users: what
   happened, what data was involved, what you've done about it.
4. File notification to the Data Protection Board of India per the DPDP
   Act's process — **as of this writing that process/portal had not yet
   been fully operationalized by the Board**; check the Board's current
   guidance at the time of any real incident rather than relying on this
   note.
5. This step in particular is worth a lawyer's involvement, not just
   engineering judgment — see "Known limitations" below.

## Rollback quick reference

| Layer | How |
|---|---|
| Frontend (Vercel) | Promote a previous deployment in the Vercel dashboard — instant, no rebuild |
| Code (git) | `git revert <bad-commit>` and push — lets CI re-verify before Vercel picks it up |
| Database schema | Forward-fix migration, not a manual revert (see above) |
| A specific feature | No feature-flag system exists in this codebase — reverting the owning commit(s) with `git revert` is the only rollback path for a single feature |

## Post-incident

For anything SEV1/SEV2: write a short postmortem (what happened, timeline,
root cause, what fixed it, what prevents recurrence) and, if the runbook
itself was wrong or missing a step, update this file in the same PR as the
fix.

## Known limitations (as of this writing)

Be honest with yourself about these rather than assuming coverage that
isn't there yet:

- **No point-in-time recovery (PITR).** Supabase PITR requires a paid-tier
  upgrade that hasn't been done yet. Until it is, recovery from a bad
  migration or accidental mass-delete depends on Supabase's default backup
  retention for the current plan — check what that actually covers before
  assuming a specific RPO.
- **No on-call rotation / single admin.** If the one admin account is
  unavailable during an incident, there is currently no documented
  secondary access path. Worth adding a second trusted admin account as
  this scales past a single operator.
- **No outbound email/SMS alerting yet.** The error-rate alert
  (`error_rate_alerts` table) surfaces in the admin UI and can push to a
  webhook once one is configured, but there's no default channel that
  reaches a phone/inbox without someone configuring `webhook_url` in
  `/admin/errors`'s alert settings first.
- **DPDP breach-notification process is procedural, not automated** — the
  steps above are what to do, not a system that does it for you. If a
  qualified breach occurs, get a lawyer involved for the regulator-facing
  parts.
- **`audit_logs` table exists but nothing populates it.** It's in the
  schema with the right shape (action, table_name, before/after JSON,
  admin-only RLS) but no trigger or app code writes to it today. Either
  wire it up (e.g. triggers on sensitive tables) or remove it — right now
  it gives a false sense of having an audit trail.

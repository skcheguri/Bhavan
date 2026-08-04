# Bhavan — Architecture

Counts and statuses verified against the repo and the live Supabase
project on 2026-08-04. See [HANDOVER.md](HANDOVER.md) for what is left to
do and why.

**Status key** — `✅` live and verified · `🟡` built, not wired up · `⛔` not started

```mermaid
flowchart TD
  subgraph CLIENT["Clients — one React 19 + Vite codebase"]
    WEB["✅ Web app — all roles<br/><small>public · tenant · owner · admin</small>"]
    CAP["🟡 Capacitor shell<br/><small>android/ + ios/ scaffolded, plugins wired<br/>never built or run on a device</small>"]
  end

  subgraph SUPA["Supabase — the backend"]
    DB["✅ Postgres + RLS<br/><small>39 tables · 134 policies · 9 migrations<br/>authorization lives here, not in the client</small>"]
    AUTH["✅ Auth — email + Google<br/><small>admin requires TOTP (aal2)<br/>🟡 phone OTP: hook written, no SMS provider</small>"]
    STORE["✅ Storage + Realtime<br/><small>ownership-documents bucket<br/>realtime used only for chat</small>"]
    FN["✅ Edge functions (11)<br/><small>payments · subscriptions · push · KYC<br/>contact limits · geocode · admin</small>"]
    CRON["✅ Scheduled jobs (pg_cron)<br/><small>error-rate check · expire subscriptions<br/>purge unconfirmed accounts</small>"]
  end

  subgraph EXT["External services"]
    RZP["✅ Razorpay<br/><small>HMAC verified server-side, unit tested<br/>⛔ no webhook — recovery relies on the client returning</small>"]
    GOOG["✅ Google OAuth<br/><small>via Supabase Auth</small>"]
    FCM["✅ Firebase Cloud Messaging<br/><small>web push verified end to end<br/>native path never executed</small>"]
    AADH["🟡 Aadhaar KYC<br/><small>function built, no provider contract or keys</small>"]
    SMS["🟡 SMS — MSG91<br/><small>auth hook written, account + DLT registration pending</small>"]
  end

  subgraph CI["CI — GitHub Actions, every push and PR"]
    GATE["✅ verify + e2e<br/><small>typecheck · lint · 97 unit tests · build<br/>Playwright: 32 tests, 7 run unconfigured</small>"]
  end

  subgraph DEPLOY["Deployment"]
    VERCEL["✅ Vercel — production<br/><small>gated on green CI; git auto-deploy disabled<br/>so a red build cannot ship</small>"]
    STORES["⛔ App stores<br/><small>no signing, no accounts, no listing</small>"]
  end

  WEB --> SUPA
  CAP --> SUPA
  DB -.->|"pg_net"| FN
  CRON --> FN
  FN --> RZP
  FN --> FCM
  FN --> AADH
  AUTH --> GOOG
  AUTH --> SMS
  CLIENT --> CI
  GATE -->|"green only"| VERCEL
  CAP -.->|"manual, not yet attempted"| STORES

  classDef ok fill:#d9f2e6,stroke:#2f7d5d,color:#14452f
  classDef partial fill:#fdf0d5,stroke:#c08a2e,color:#6b4a10
  classDef none fill:#fbe0dc,stroke:#c0564a,color:#6b1e16
  class WEB,DB,AUTH,STORE,FN,CRON,RZP,GOOG,FCM,GATE,VERCEL ok
  class CAP,AADH,SMS partial
  class STORES none
```

## Corrections against the previous diagram

| Previously shown | Actual |
|---|---|
| 34 tables, 119 RLS policies | **39 tables, 134 policies** |
| Edge functions (7) | **11** |
| Auth: "email, Google, phone OTP" | email and Google are live; **phone OTP is not wired** — no SMS provider |
| Razorpay "live & verified" | signature verification is real and tested, but **no webhook**, and whether the keys are live or test is unconfirmed |
| Auto-deploy: "no deploy step yet" | **Vercel deploy exists**, gated on CI |
| Web hosting: "not configured in this repo" | **`vercel.json` present and wired** |
| CI: typecheck, lint, test, build | plus **Playwright E2E**, which deploys are gated on |
| *(absent)* | **Firebase Cloud Messaging** — a live dependency |
| *(absent)* | **pg_cron / pg_net** — scheduled jobs and push dispatch run inside Postgres |
| "Manual Capacitor builds" | projects **scaffolded and plugin-wired**, but never built or run |

## Two things the boxes don't convey

**Authorization is in the database.** The client talks to PostgREST directly
with the anon key; what a user may read or write is decided by RLS
policies. A change to a table's policies is a security change even when no
TypeScript moves. Anything the client must not control — payment amounts,
plan prices, payment status, contact limits — lives in an edge function
holding the service-role key.

**There is one Supabase project and it is production.** Every migration was
applied to it directly and the E2E suite points at it. The layers above
imply an environment boundary that does not exist yet; standing up staging
is the first task in the handover.

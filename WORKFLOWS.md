# Bhavan — current workflows

What the app does **today**, before any community/complex work. Drawn from
the code, not from the plan, so it can serve as the baseline that any
proposed change is measured against.

See [ARCHITECTURE.md](ARCHITECTURE.md) for how the pieces are built and
[HANDOVER.md](HANDOVER.md) for what is finished versus what only looks it.

---

## 1. The core loop: tenant finds a flat, owner approves, money moves

Everything else in the app hangs off this. Note that no contact details
are exchanged until the owner approves — that is the product's whole
premise, and the rate limits exist to stop it being farmed by brokers.

```mermaid
flowchart TD
  subgraph T["Tenant"]
    T1["Browse listings<br/><small>public · text + 20km proximity search</small>"]
    T2["Open a listing"]
    T3["Request to connect<br/><small>name · phone · message</small>"]
    T4["Chat unlocked"]
    T5["Pay rent<br/><small>Razorpay</small>"]
    T6["Download receipts<br/>+ agreement"]
    T7["Raise maintenance request<br/><small>about their own flat</small>"]
  end

  subgraph O["Owner"]
    O1["List a property<br/><small>photos · geocoded address</small>"]
    O2["Receive inquiry"]
    O3["Approve / decline"]
    O4["Generate rental agreement"]
    O5["Generate rent receipt"]
    O6["Handle maintenance request"]
  end

  O1 --> T1
  T1 --> T2 --> T3
  T3 -->|"notification + push"| O2
  O2 --> O3
  O3 -->|approved| T4
  O3 -.->|declined| T2
  T4 --> O4 --> T6
  T4 --> T5 --> O5 --> T6
  T4 --> T7 --> O6

  classDef tenant fill:#d9f2e6,stroke:#2f7d5d,color:#14452f
  classDef owner fill:#fdf0d5,stroke:#c08a2e,color:#6b4a10
  class T1,T2,T3,T4,T5,T6,T7 tenant
  class O1,O2,O3,O4,O5,O6 owner
```

**Guards already in place on that loop**

| Guard | Where |
|---|---|
| 5 connection requests per day | Postgres trigger, not the client |
| Contact details hidden until approval | RLS on `connection_requests` |
| Payment amount from the agreement, never the request body | edge function |
| Payment marked paid only on a verified Razorpay signature | edge function |
| Tenant cannot flip a payment to paid | no UPDATE policy on `rent_payments` |

---

## 2. Who verifies what

Two separate review queues, both worked by a Bhavan platform admin. This
is the pipeline a community feature would reuse rather than reinvent.

```mermaid
flowchart LR
  U["Owner uploads<br/>ownership document"] --> Q1["Admin queue:<br/>property verification"]
  A["Tenant/owner submits<br/>Aadhaar"] --> Q2["Admin queue:<br/>Aadhaar verification"]
  Q1 -->|approved| V1["Listing shows<br/>Verified badge"]
  Q1 -.->|rejected| R1["Reason returned<br/>to owner"]
  Q2 -->|approved| V2["Profile shows<br/>Verified · unlocks<br/>visits + agreements"]
  Q2 -.->|rejected| R2["Reason returned"]

  classDef ok fill:#d9f2e6,stroke:#2f7d5d,color:#14452f
  classDef queue fill:#e8e6f5,stroke:#5b53a3,color:#241f5c
  class V1,V2 ok
  class Q1,Q2 queue
```

> **Aadhaar is not actually live.** The edge function is written but returns
> "provider is not configured" until a KYC contract exists. The queue and
> the UI are real; the automated check is not.

---

## 3. Roles as they exist today

This matters more than it looks, because "admin" is already taken.

```mermaid
flowchart TD
  R["users.role"] --> RT["tenant<br/><small>browse, request, pay rent</small>"]
  R --> RO["owner<br/><small>list, approve, invoice, Pro</small>"]
  R --> RA["admin<br/><small>PLATFORM admin — every user,<br/>listing, report and error log.<br/>Requires TOTP (aal2)</small>"]

  classDef danger fill:#fbe0dc,stroke:#c0564a,color:#6b1e16
  class RA danger
```

**A community admin is a fourth thing and must not reuse this role.**
Making a building's admin a `users.role = 'admin'` would hand them the
entire platform. Community authority belongs in a membership row scoped to
one community.

---

## 4. Money today

```mermaid
flowchart LR
  P1["Tenant pays rent"] -->|Razorpay order| E1["create-rent-payment-order"]
  E1 --> RZ["Razorpay checkout"]
  RZ -->|signature| E2["verify-rent-payment"]
  E2 --> DB1["rent_payments → paid"]

  P2["Owner buys Pro<br/><small>₹999 + GST, one-time annual</small>"] --> E3["create-subscription-order"]
  E3 --> RZ
  RZ -->|signature| E4["verify-subscription-payment"]
  E4 --> DB2["owner_subscriptions"]

  classDef fn fill:#d9f2e6,stroke:#2f7d5d,color:#14452f
  class E1,E2,E3,E4 fn
```

Two known gaps, both recorded in the handover: there is **no Razorpay
webhook**, so recovery depends on the client returning from checkout; and
**Pro entitlements are enforced in React**, not in the database.

---

## 5. Where a community feature would attach

Nothing above changes. The community model is additive — new tables, new
routes, and it reuses the notification pipeline and the admin review queue
that already exist.

```mermaid
flowchart TD
  subgraph EX["Exists today — unchanged"]
    X1["users / auth"]
    X2["Admin review queue"]
    X3["Notifications + push"]
    X4["Razorpay + signature verification"]
    X5["Document storage"]
  end

  subgraph NEW["New — additive"]
    N1["communities<br/><small>join code · Bhavan-reviewed</small>"]
    N2["community_members<br/><small>unit · role · approval</small>"]
    N3["community_tickets<br/><small>building-level, PAID</small>"]
    N4["community_announcements"]
    N5["community_subscriptions<br/><small>paid by an admin, per building</small>"]
  end

  X1 --> N2
  X2 -->|"reviews the first owner"| N1
  N1 --> N2
  N2 --> N3
  N2 --> N4
  N3 --> X3
  N4 --> X3
  N5 -->|"unlocks"| N3
  X4 --> N5
  X5 --> N1

  classDef ok fill:#d9f2e6,stroke:#2f7d5d,color:#14452f
  classDef new fill:#e8e6f5,stroke:#5b53a3,color:#241f5c
  classDef paid fill:#fdf0d5,stroke:#c08a2e,color:#6b4a10
  class X1,X2,X3,X4,X5 ok
  class N1,N2,N4 new
  class N3,N5 paid
```

The only existing thing that needs touching is moving Pro entitlement
checks out of React and into RLS — and that is a fix to a known weakness,
not a change in behaviour.

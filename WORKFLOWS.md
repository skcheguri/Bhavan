# Bhavan — current workflows

What the app does **today**, drawn from the code rather than the plan.

Sections 1-4 are the original rental product. Section 5 was written as
"where a community feature would attach" while it was still a proposal;
it now describes what was built.

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
  U["Owner uploads<br/>ownership document<br/><small>/list-property or /register-flat</small>"] --> Q1["Admin queue:<br/>property verification"]
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

### Two ways in, one queue

Proving ownership used to happen only inside the listing flow, so an
owner who lives in their own flat had to advertise their home to the
whole platform just to join their building's society. `/register-flat`
is the same document check without a listing at the end of it, and the
property lands as `self_occupied` rather than the vacant a listing
implies. Both routes land in the same admin queue; a submission with no
listing is badged there, because the reviewer has no photos to
cross-check and the document is the whole case.

Reached from the two places the need actually arises: the society page's
"verify a property first" notice, and a line on the ownership step of
`/list-property`, since that is where owners go when they think "add my
property" -- which is not always the same as "advertise it". There is
deliberately no card for it on the profile; one was built and removed,
because nobody opens their profile thinking they should register their
home.

> **`properties.verified` is Bhavan's output, not the owner's input.**
> Until migration 102 the owner could set it themselves -- RLS grants
> rows, not columns -- which meant self-approving into any society *and*
> awarding themselves the Verified badge, since
> `cascade_property_verification_to_listings` copies the flag onto every
> listing. A trigger now pins it for anyone who is not a platform admin
> or the service role. Replacing the document on an approved property
> drops it back to unverified, so an approval always refers to evidence
> somebody actually looked at.

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

### `owner` covers two different people

One rents flats out. The other lives in their own flat and joined Bhavan
for the society. Both are `role = 'owner'`, and the second sees no
tenants, no listings and no income -- three dashboard tiles reading zero
forever.

The split is **per flat, not per person** (`properties.occupancy`, added
in migration 101), because the common case here is somebody who lives in
one flat and lets another, often in the same building. A user-level flag
would be wrong for half their properties the day it was set.

| `occupancy` | Meaning | Set by |
|---|---|---|
| `self_occupied` | The owner lives here | `/register-flat`, and the default |
| `rented_out` | A tenant lives here | The DB, while a rental agreement is live |
| `vacant` | Neither | The DB, when the last agreement lapses |

**Derived, never asked.** Owners briefly had buttons to set this by
hand. It was a row of chrome on every profile for something the app
already knew, and it earned nothing: which half of the dashboard to show
follows from listings and agreements on their own (`isLandlord` in
`src/lib/occupancy.ts`). The column is kept because it is free, it
survives a lapsed agreement, and it tells the review queue that a
submission is somebody's home rather than a half-finished listing.

Two rules worth keeping:

- **Society membership is not evidence of living there.** Landlords stay
  in the society group after renting out -- that is how they hear about
  maintenance and dues. Residence is inferred from the *absence of a
  tenancy on the flat*, never from `community_members`.
- **A live agreement outranks the owner's declaration.** The DB refuses
  to move a flat off `rented_out` while an agreement is running, so a let
  flat cannot be quietly dropped out of the income total. Ending the
  agreement is the way out.

This leaves one case unhandled on purpose: a flat let informally, with
no agreement in Bhavan. The rent is real and the dashboard will read
zero. There is no signal that can tell us, and a checkbox the owner has
to remember only works for people who were already going to do the
paperwork. The fix is to make creating an agreement easy enough that it
stops being skipped, not to add a declaration.

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

Both gaps this section used to record have moved.

A **Razorpay webhook** now exists and is deployed, covering rent, Pro and
society payments. It is not yet configured in the Razorpay dashboard, so
until that is done fulfilment still depends on the client returning from
checkout. HANDOVER 4.3 has the two steps.

The claim that **Pro entitlements are enforced in React** was wrong when
it was written, and correcting it is worth keeping visible: they were not
enforced anywhere. Every free-tier limit was Infinity and no code path
read an entitlement. Migration 073 added `has_pro()` as the server-side
check; society entitlements were built on it from the start.

---

## 5. Societies — an apartment complex or villa community

Built after sections 1-4 and additive: nothing above changed. A society is
a group of **verified owners** in one building, reached at `/society`.

```mermaid
flowchart TD
  subgraph JOIN["Getting in"]
    A["Verified owner<br/><small>role=owner + an admin-approved property</small>"]
    A -->|"has a join code"| B["Request to join"]
    A -->|"no society yet"| C["Register one<br/><small>arrives pending</small>"]
    C --> D["Bhavan reviews<br/>/admin/societies"]
    D -->|approved| E["Society is live<br/><small>code resolves · founder becomes admin</small>"]
    B --> F["Society admin approves"]
    F --> G["Member"]
    E --> G
  end

  subgraph USE["Inside a society"]
    G --> H["Notices<br/><small>FREE · admins post, everyone is notified</small>"]
    G --> I["Maintenance<br/><small>PAID · shared property, with discussion</small>"]
    G --> J["Funds<br/><small>PAID to start · who has paid, who has not</small>"]
  end

  K["Society plan<br/><small>Rs 5,899/yr per building</small>"] -->|"unlocks for everyone"| I
  K --> J

  classDef free fill:#d9f2e6,stroke:#2f7d5d,color:#14452f
  classDef paid fill:#fdf0d5,stroke:#c08a2e,color:#6b4a10
  classDef queue fill:#e8e6f5,stroke:#5b53a3,color:#241f5c
  class A,B,C,E,F,G,H free
  class I,J,K paid
  class D queue
```

**Why the free/paid line sits there.** A society that does nothing until
someone pays is one nobody finishes setting up, and an admin cannot show
the other owners it is worth funding before asking them to fund it. So the
group, the join code and notices are free; the operational tooling is not.
One subscription covers the whole building — the check is
`community_is_paid(community_id)` and never anything about the individual.

**Guards, all in Postgres**

| Guard | Why it exists |
|---|---|
| Joining requires a verified property | The code proves you know the building; verification proves you own a flat in it |
| Join requests land member/pending whatever the client sends | Otherwise anyone with the code appoints themselves |
| A society can never lose its last admin | Both demotion and deletion; otherwise nobody can run it |
| Members are removed by admins, never by themselves | Leaving would erase you from the "who has not paid" list |
| Only a verified Razorpay callback can mark a building paid | `community_subscriptions` has no client INSERT or UPDATE policy |
| A contribution always lands as `claimed` | A claim is not money until an admin finds it in the account |

**What this deliberately is not.** Fund collections are a ledger. Owners
pay the society's own UPI id from their own app; Bhavan records who says
they paid and what the admin confirmed, and never touches the money.
Taking it into a Bhavan account and forwarding it would be payment
aggregator activity under the RBI framework. If in-app payment is wanted
later, the route is Razorpay Route with each society onboarded as a linked
account.

There is also no group chat, on purpose: every one of these buildings
already has a WhatsApp group, and what WhatsApp is bad at is a notice that
does not scroll away and an issue with a status. Discussion is attached to
the ticket it is about, where it self-archives when the issue resolves.

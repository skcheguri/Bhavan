import { test, expect } from "@playwright/test";
import {
  authHeaders,
  createDisposableSociety,
  createSocietyWithPlainMember,
  destroySociety,
  hasOwner,
  hasServiceRole,
  hasSupabase,
  hasTenant,
  OWNER_EMAIL,
  OWNER_PASSWORD,
  restUrl,
  serviceHeaders,
  signIn,
  SUPABASE_ANON_KEY,
  TENANT_EMAIL,
  TENANT_PASSWORD,
  userIdFor,
} from "./helpers";

// The society feature: joining by code, the paid gate on maintenance, and
// the contribution ledger.
//
// Almost everything here talks to PostgREST rather than clicking, for the
// same reason as the payment specs: the rules worth protecting are RLS
// policies and triggers. A UI test proves a button is hidden; it cannot
// prove the endpoint behind it refuses. Every guard below has a way to
// lose someone money or let them into a building they do not live in.

test.describe("society page, signed out", () => {
  test("asks you to sign in rather than showing an empty state", async ({ page }) => {
    await page.goto("/society");
    // The distinction matters: an empty "no society" screen would read as
    // "this feature is broken" to someone who simply is not signed in.
    await expect(page.getByText(/sign in to continue/i)).toBeVisible();
    await expect(page.getByText(/for verified property owners/i)).toBeVisible();
  });
});

test.describe.serial("joining by code", () => {
  test.skip(!hasServiceRole || !hasOwner, "Service role + owner fixture not set");

  let societyId = "";
  let joinCode = "";
  let ownerToken = "";
  let ownerId = "";

  test.beforeAll(async ({ request }) => {
    ownerToken = await signIn(request, OWNER_EMAIL!, OWNER_PASSWORD!);
    ownerId = await userIdFor(request, ownerToken);
    const society = await createDisposableSociety(request, ownerId);
    societyId = society.id;
    joinCode = society.joinCode;
  });

  test.afterAll(async ({ request }) => {
    if (societyId) await destroySociety(request, societyId);
  });

  test("activation makes the founder its first admin", async ({ request }) => {
    // A society that activates with nobody able to administer it is a dead
    // end -- there is no path to appointing anyone. This is the trigger
    // that prevents it.
    const res = await request.get(
      restUrl(`community_members?community_id=eq.${societyId}&select=role,status`),
      { headers: serviceHeaders() }
    );
    const rows = await res.json();
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe("admin");
    expect(rows[0].status).toBe("approved");
  });

  test("the code is found however it is typed", async ({ request }) => {
    const res = await request.post(restUrl("rpc/find_community_by_code"), {
      headers: authHeaders(ownerToken),
      data: { p_code: `  ${joinCode.toLowerCase()}  ` },
    });
    const rows = await res.json();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(societyId);
  });

  test("lookup returns nothing identifying and never the code itself", async ({ request }) => {
    const res = await request.post(restUrl("rpc/find_community_by_code"), {
      headers: authHeaders(ownerToken),
      data: { p_code: joinCode },
    });
    const rows = await res.json();
    // Name, type and city only. Handing back the address or the join code
    // would make this RPC a way to read rows you have no relationship to.
    expect(Object.keys(rows[0]).sort()).toEqual(["city", "id", "kind", "name"]);
  });

  test("a wrong code finds nothing", async ({ request }) => {
    const res = await request.post(restUrl("rpc/find_community_by_code"), {
      headers: authHeaders(ownerToken),
      data: { p_code: "ZZZZZZ" },
    });
    expect(await res.json()).toEqual([]);
  });

  test("a society awaiting review is not findable by its code", async ({ request }) => {
    const pending = await request.post(restUrl("communities"), {
      headers: { ...serviceHeaders(), Prefer: "return=representation" },
      data: {
        name: `E2E Pending ${Date.now()}`,
        kind: "apartment",
        address: "x",
        city: "Hyderabad",
        created_by: ownerId,
        status: "pending",
      },
    });
    const [row] = await pending.json();
    try {
      const res = await request.post(restUrl("rpc/find_community_by_code"), {
        headers: authHeaders(ownerToken),
        data: { p_code: row.join_code },
      });
      expect(await res.json()).toEqual([]);
    } finally {
      await destroySociety(request, row.id);
    }
  });

  test("someone who is not a verified owner cannot join", async ({ request }) => {
    test.skip(!hasTenant, "Tenant fixture not set");
    const tenantToken = await signIn(request, TENANT_EMAIL!, TENANT_PASSWORD!);
    const tenantId = await userIdFor(request, tenantToken);

    const res = await request.post(restUrl("community_members"), {
      headers: authHeaders(tenantToken),
      data: { community_id: societyId, user_id: tenantId, unit_numbers: ["B-101"] },
    });

    // The code proves you know which building. Verification proves you own
    // a flat in it. Without this, a code forwarded into a WhatsApp group is
    // an open door.
    expect(res.status()).toBe(403);
    expect((await res.json()).code).toBe("42501");
  });

});

test.describe.serial("joining as an ordinary owner", () => {
  // Founded by the TENANT so the fixture owner is a plain applicant rather
  // than the founder. A founder is an admin, and migration 075 also lets
  // the creator of an admin-less active society appoint themselves. Both
  // are correct, and both would make these assertions pass vacuously.
  test.skip(!hasServiceRole || !hasOwner || !hasTenant, "Service role + both fixtures not set");

  let societyId = "";
  let ownerToken = "";
  let ownerId = "";

  test.beforeAll(async ({ request }) => {
    ownerToken = await signIn(request, OWNER_EMAIL!, OWNER_PASSWORD!);
    ownerId = await userIdFor(request, ownerToken);
    const tenantToken = await signIn(request, TENANT_EMAIL!, TENANT_PASSWORD!);
    const founderId = await userIdFor(request, tenantToken);
    societyId = (await createDisposableSociety(request, founderId)).id;
  });

  test.afterAll(async ({ request }) => {
    if (societyId) await destroySociety(request, societyId);
  });

  test("a join request lands powerless whatever the client sends", async ({ request }) => {
    const res = await request.post(restUrl("community_members"), {
      headers: { ...authHeaders(ownerToken), Prefer: "return=representation" },
      data: {
        community_id: societyId,
        user_id: ownerId,
        unit_numbers: ["A-402"],
        // Both ignored by a trigger. Trusting them would let anyone holding
        // the code appoint themselves.
        role: "admin",
        status: "approved",
      },
    });

    const [row] = await res.json();
    expect(row.role).toBe("member");
    expect(row.status).toBe("pending");
    expect(row.approved_at).toBeNull();
  });

  test("a member cannot promote themselves", async ({ request }) => {
    const res = await request.patch(
      restUrl(`community_members?community_id=eq.${societyId}&user_id=eq.${ownerId}`),
      { headers: authHeaders(ownerToken), data: { role: "admin", status: "approved" } }
    );
    expect(res.status()).toBe(400);
    expect((await res.json()).message).toMatch(/only a community admin can change/i);
  });
});

test.describe.serial("the paid gate on maintenance", () => {
  test.skip(!hasServiceRole || !hasOwner || !hasTenant, "Service role + both fixtures not set");

  let societyId = "";
  let ownerToken = "";
  let ownerId = "";

  test.beforeAll(async ({ request }) => {
    ownerToken = await signIn(request, OWNER_EMAIL!, OWNER_PASSWORD!);
    ownerId = await userIdFor(request, ownerToken);
    const tenantToken = await signIn(request, TENANT_EMAIL!, TENANT_PASSWORD!);
    const founderId = await userIdFor(request, tenantToken);
    // Unpaid on purpose -- this block is about the transition. The fixture
    // owner is a plain member, so the admin exemptions do not apply.
    societyId = (await createSocietyWithPlainMember(request, founderId, ownerId)).id;
  });

  test.afterAll(async ({ request }) => {
    if (societyId) await destroySociety(request, societyId);
  });

  test("an unpaid society cannot raise an issue", async ({ request }) => {
    const res = await request.post(restUrl("community_tickets"), {
      headers: authHeaders(ownerToken),
      data: {
        community_id: societyId,
        raised_by: ownerId,
        title: "Lift stuck",
        description: "Doors not opening",
        category: "lift",
      },
    });
    expect(res.status()).toBe(403);
    expect((await res.json()).code).toBe("42501");
  });

  test("an ordinary member cannot post a notice", async ({ request }) => {
    // Notices are free to READ for everyone, but posting is the admin
    // speaking to the building -- not a board anyone can pin to.
    const res = await request.post(restUrl("community_announcements"), {
      headers: authHeaders(ownerToken),
      data: {
        community_id: societyId,
        author_id: ownerId,
        title: "Water tank cleaning",
        body: "Supply off Sunday 10am-2pm.",
      },
    });
    expect(res.status()).toBe(403);
  });

  test("a client cannot grant its own society a plan", async ({ request }) => {
    // community_subscriptions has no INSERT policy for anyone. If this ever
    // starts succeeding, every paid feature is free.
    const res = await request.post(restUrl("community_subscriptions"), {
      headers: authHeaders(ownerToken),
      data: { community_id: societyId, plan: "standard", status: "active" },
    });
    expect(res.status()).toBe(403);
  });

  test("the same request succeeds once the society is paid", async ({ request }) => {
    await request.post(restUrl("community_subscriptions"), {
      headers: serviceHeaders(),
      data: {
        community_id: societyId,
        plan: "standard",
        status: "active",
        purchased_by: ownerId,
        current_period_end: "2030-01-01T00:00:00Z",
      },
    });

    const res = await request.post(restUrl("community_tickets"), {
      headers: authHeaders(ownerToken),
      data: {
        community_id: societyId,
        raised_by: ownerId,
        title: "Lift stuck",
        description: "Doors not opening",
        category: "lift",
      },
    });
    expect(res.status()).toBe(201);
  });

  test("the raiser can fix their wording but not the status", async ({ request }) => {
    const list = await request.get(
      restUrl(`community_tickets?community_id=eq.${societyId}&select=id`),
      { headers: serviceHeaders() }
    );
    const [ticket] = await list.json();

    const edit = await request.patch(restUrl(`community_tickets?id=eq.${ticket.id}`), {
      headers: authHeaders(ownerToken),
      data: { description: "Doors not opening since Tuesday" },
    });
    expect(edit.status()).toBe(204);

    // RLS grants rows, not columns, so this needs a trigger. Without it,
    // fixing a typo in your own ticket would also let you close it.
    const close = await request.patch(restUrl(`community_tickets?id=eq.${ticket.id}`), {
      headers: authHeaders(ownerToken),
      data: { status: "resolved" },
    });
    expect(close.status()).toBe(400);
    expect((await close.json()).message).toMatch(/only a society admin can change/i);
  });
});

test.describe.serial("the contribution ledger", () => {
  test.skip(!hasServiceRole || !hasOwner || !hasTenant, "Service role + both fixtures not set");

  let societyId = "";
  let collectionId = "";
  let ownerToken = "";
  let ownerId = "";
  let founderId = "";

  test.beforeAll(async ({ request }) => {
    ownerToken = await signIn(request, OWNER_EMAIL!, OWNER_PASSWORD!);
    ownerId = await userIdFor(request, ownerToken);
    const tenantToken = await signIn(request, TENANT_EMAIL!, TENANT_PASSWORD!);
    founderId = await userIdFor(request, tenantToken);
    // The fixture owner contributes as a plain member; the tenant admins.
    societyId = (await createSocietyWithPlainMember(request, founderId, ownerId, { paid: true })).id;

    const res = await request.post(restUrl("community_collections"), {
      headers: { ...serviceHeaders(), Prefer: "return=representation" },
      data: {
        community_id: societyId,
        created_by: founderId,
        title: "Diwali celebration",
        purpose: "Decorations and snacks",
        mode: "per_flat",
        per_flat_rupees: 2000,
        target_rupees: 40000,
        upi_id: "society@upi",
      },
    });
    collectionId = (await res.json())[0].id;
  });

  test.afterAll(async ({ request }) => {
    if (societyId) await destroySociety(request, societyId);
  });

  test("a contribution posted as confirmed is recorded as merely claimed", async ({ request }) => {
    // A claim is not money. Were this to stick, an owner could appear in
    // the paid column having transferred nothing.
    const res = await request.post(restUrl("community_contributions"), {
      headers: { ...authHeaders(ownerToken), Prefer: "return=representation" },
      data: {
        collection_id: collectionId,
        user_id: ownerId,
        amount_rupees: 2000,
        status: "confirmed",
      },
    });
    const [row] = await res.json();
    expect(row.status).toBe("claimed");
    expect(row.confirmed_at).toBeNull();
    expect(row.confirmed_by).toBeNull();
  });

  test("the owner cannot then confirm their own payment", async ({ request }) => {
    const res = await request.patch(
      restUrl(`community_contributions?collection_id=eq.${collectionId}&user_id=eq.${ownerId}`),
      { headers: authHeaders(ownerToken), data: { status: "confirmed" } }
    );
    expect(res.status()).toBe(400);
    expect((await res.json()).message).toMatch(/only a society admin can confirm/i);
  });

  test("who has paid is keyed on members, so non-payers are visible", async ({ request }) => {
    // A list of contributions cannot express an absence, and the absence is
    // exactly what a treasurer is chasing.
    const res = await request.post(restUrl("rpc/get_collection_status"), {
      headers: authHeaders(ownerToken),
      data: { p_collection: collectionId },
    });
    const rows = await res.json();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r: { user_id: string }) => Boolean(r.user_id))).toBe(true);
  });

  test("a confirmed amount cannot be edited afterwards", async ({ request }) => {
    await request.patch(
      restUrl(`community_contributions?collection_id=eq.${collectionId}&user_id=eq.${ownerId}`),
      { headers: serviceHeaders(), data: { status: "confirmed", confirmed_by: founderId } }
    );

    // Changing it now would silently move a figure the treasurer has
    // already reconciled against a bank statement.
    const res = await request.patch(
      restUrl(`community_contributions?collection_id=eq.${collectionId}&user_id=eq.${ownerId}`),
      { headers: authHeaders(ownerToken), data: { amount_rupees: 5 } }
    );
    expect(res.status()).toBe(400);
    expect((await res.json()).message).toMatch(/has been confirmed/i);
  });
});

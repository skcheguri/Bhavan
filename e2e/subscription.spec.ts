import { test, expect } from "@playwright/test";
import {
  authHeaders,
  fnUrl,
  hasOwner,
  hasSupabase,
  hasTenant,
  OWNER_EMAIL,
  OWNER_PASSWORD,
  signIn,
  SUPABASE_ANON_KEY,
  TENANT_EMAIL,
  TENANT_PASSWORD,
} from "./helpers";

// Pro subscription purchase. As with rent payments, the checkout iframe
// itself is out of scope; what's asserted is that pricing is decided by
// the server, that only owners can buy, and that a client-supplied
// "this was already paid" claim cannot activate a plan on its own.
//
// None of these tests create a Razorpay order: every path exercised here
// is rejected before an order or invoice row exists, so the suite leaves
// no billing_history residue behind.

test.describe("subscription pricing UI", () => {
  test("plan page shows both plans and the modal totals GST correctly", async ({ page }) => {
    await page.goto("/subscription");

    await expect(page.getByRole("heading", { name: /choose your plan/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /free forever/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /pro unlimited/i })).toBeVisible();

    // Annual is the default selection: base 999 + 18% GST (180) = 1,179.
    // Hard-coding the arithmetic here is the point -- if the displayed
    // total ever drifts from base+GST, a customer is quoted a price the
    // server won't charge. Asserting on the pay button rather than a bare
    // "₹999" both avoids the price appearing twice (card + modal) and
    // checks the number the user is actually committing to.
    await page.getByRole("button", { name: /upgrade to pro/i }).first().click();
    await expect(page.getByText(/GST \(18%\)/i)).toBeVisible();
    await expect(page.getByText("₹180")).toBeVisible();
    await expect(page.getByRole("button", { name: /pay ₹1,179/i })).toBeVisible();
  });

  test("the page no longer promises auto-renewal it does not implement", async ({ page }) => {
    await page.goto("/subscription");
    // Pro is a one-time payment. The FAQ used to describe renewal
    // charges, grace periods and a free trial that never existed.
    await expect(page.getByText(/no auto-charges/i)).toBeVisible();
  });
});

test.describe("subscription server guards", () => {
  // Without Supabase env the function URLs collapse to a relative path and
  // would hit the dev server instead, so even the no-credentials tests skip.
  test.skip(!hasSupabase, "Supabase env not set");

  test("creating an order requires authentication", async ({ request }) => {
    const res = await request.post(fnUrl("create-subscription-order"), {
      headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      data: { plan: "pro_annual" },
    });
    expect(res.status()).toBe(401);
  });

  test("tenants cannot buy an owner-only plan", async ({ request }) => {
    test.skip(!hasTenant, "E2E_TENANT_EMAIL/PASSWORD not set");
    const token = await signIn(request, TENANT_EMAIL!, TENANT_PASSWORD!);
    const res = await request.post(fnUrl("create-subscription-order"), {
      headers: authHeaders(token),
      data: { plan: "pro_annual" },
    });
    expect(res.status()).toBe(403);
    expect((await res.json()).error).toMatch(/property owners only/i);
  });

  test("an unknown plan is rejected rather than priced", async ({ request }) => {
    test.skip(!hasOwner, "E2E_OWNER_EMAIL/PASSWORD not set");
    const token = await signIn(request, OWNER_EMAIL!, OWNER_PASSWORD!);
    const res = await request.post(fnUrl("create-subscription-order"), {
      headers: authHeaders(token),
      data: { plan: "pro_lifetime_free" },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/unknown plan/i);
  });

  test("the price is never taken from the request body", async ({ request }) => {
    test.skip(!hasOwner, "E2E_OWNER_EMAIL/PASSWORD not set");
    const token = await signIn(request, OWNER_EMAIL!, OWNER_PASSWORD!);
    // A caller supplying their own amount alongside an invalid plan must
    // still be refused on the plan -- pricing comes from the server-side
    // table, never the body.
    const res = await request.post(fnUrl("create-subscription-order"), {
      headers: authHeaders(token),
      data: { plan: "pro_annual_cheap", amount: 100, total_amount: 100 },
    });
    expect(res.status()).toBe(400);
  });

  test("verification requires authentication", async ({ request }) => {
    const res = await request.post(fnUrl("verify-subscription-payment"), {
      headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      data: {
        billingRowId: "11111111-2222-4333-8444-555555555555",
        razorpay_order_id: "order_x",
        razorpay_payment_id: "pay_x",
        razorpay_signature: "0".repeat(64),
      },
    });
    expect(res.status()).toBe(401);
  });

  test("a forged signature cannot activate a plan", async ({ request }) => {
    test.skip(!hasOwner, "E2E_OWNER_EMAIL/PASSWORD not set");
    const token = await signIn(request, OWNER_EMAIL!, OWNER_PASSWORD!);
    const res = await request.post(fnUrl("verify-subscription-payment"), {
      headers: authHeaders(token),
      data: {
        billingRowId: "11111111-2222-4333-8444-555555555555",
        razorpay_order_id: "order_forged",
        razorpay_payment_id: "pay_forged",
        razorpay_signature: "0".repeat(64),
      },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/verification failed/i);
  });

  test("claiming 'already paid' does not bypass verification", async ({ request }) => {
    test.skip(!hasOwner, "E2E_OWNER_EMAIL/PASSWORD not set");
    const token = await signIn(request, OWNER_EMAIL!, OWNER_PASSWORD!);
    // recoverPaidOrder exists so a genuinely-paid-but-unverified invoice
    // can be rescued. It is a client-supplied flag, so it must prove
    // nothing on its own: the function has to confirm the payment with
    // Razorpay before activating anything.
    const res = await request.post(fnUrl("verify-subscription-payment"), {
      headers: authHeaders(token),
      data: {
        billingRowId: "11111111-2222-4333-8444-555555555555",
        razorpay_order_id: "order_never_existed",
        razorpay_payment_id: "pay_never_existed",
        recoverPaidOrder: true,
      },
    });
    expect(res.ok()).toBeFalsy();
    const body = await res.json();
    expect(body.success).toBeUndefined();
  });
});

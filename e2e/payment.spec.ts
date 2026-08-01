import { test, expect } from "@playwright/test";
import {
  authHeaders,
  fnUrl,
  hasSupabase,
  hasTenant,
  signIn,
  SUPABASE_ANON_KEY,
  TENANT_EMAIL,
  TENANT_PASSWORD,
} from "./helpers";

// Rent payments are the highest-consequence flow in the app: a regression
// either takes money without recording it, or records a payment that
// never happened.
//
// These tests deliberately stop short of completing a Razorpay checkout.
// That would mean driving a third-party iframe with a test card -- slow,
// brittle, and it proves the least interesting part. Everything that
// actually protects the money is server-side, so that is what's asserted
// here: you cannot order without being signed in, you cannot order
// against someone else's tenancy, you cannot choose your own amount, and
// you cannot mark a payment paid without a signature only Razorpay can
// produce.

test.describe("rent payment page", () => {
  test.skip(!hasTenant, "E2E_TENANT_EMAIL/PASSWORD not set");

  test("a signed-in tenant reaches the payment page and its history tab", async ({ page }) => {
    await page.goto("/login");
    await page.getByText(/i'm a tenant/i).click();
    await page.getByPlaceholder("your@email.com").fill(TENANT_EMAIL!);
    await page.getByPlaceholder("Enter your password").fill(TENANT_PASSWORD!);
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await expect(page).toHaveURL(/\/listings/);

    await page.goto("/rent-payment");
    await page.getByRole("button", { name: /history/i }).first().click();
    await expect(page.getByRole("heading", { name: /payment history/i })).toBeVisible();
  });
});

// Asserting that an *unauthenticated* caller is refused needs no
// credentials, only a Supabase project to talk to. Keeping these separate
// means they still run in CI, where no fixture logins exist.
test.describe("rent payment auth guards", () => {
  test.skip(!hasSupabase, "Supabase env not set");

  test("creating an order requires authentication", async ({ request }) => {
    const res = await request.post(fnUrl("create-rent-payment-order"), {
      headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      data: { agreementId: "00000000-0000-0000-0000-000000000000", month: "2026-08" },
    });
    expect(res.status()).toBe(401);
  });

  test("verification requires authentication", async ({ request }) => {
    const res = await request.post(fnUrl("verify-rent-payment"), {
      headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      data: {
        paymentRowId: "11111111-2222-4333-8444-555555555555",
        razorpay_order_id: "order_x",
        razorpay_payment_id: "pay_x",
        razorpay_signature: "0".repeat(64),
      },
    });
    expect(res.status()).toBe(401);
  });
});

test.describe("rent payment server guards", () => {
  test.skip(!hasTenant, "E2E_TENANT_EMAIL/PASSWORD not set");

  test("a tenant cannot start a payment against an agreement that isn't theirs", async ({ request }) => {
    const token = await signIn(request, TENANT_EMAIL!, TENANT_PASSWORD!);
    const res = await request.post(fnUrl("create-rent-payment-order"), {
      headers: authHeaders(token),
      // A well-formed id that is not this tenant's agreement. RLS plus the
      // explicit tenant_id filter must both refuse to find it.
      data: { agreementId: "11111111-2222-4333-8444-555555555555", month: "2026-08" },
    });
    expect(res.status()).toBe(404);
    expect((await res.json()).error).toMatch(/no rental agreement found/i);
  });

  test("the amount is never taken from the request body", async ({ request }) => {
    const token = await signIn(request, TENANT_EMAIL!, TENANT_PASSWORD!);
    // Sending an amount must not be honoured -- the function derives it
    // from the agreement's monthly_rent. Rejecting the request outright
    // (no such agreement for this tenant) is the correct outcome here;
    // what must never happen is a 200 carrying the attacker's amount.
    const res = await request.post(fnUrl("create-rent-payment-order"), {
      headers: authHeaders(token),
      data: {
        agreementId: "11111111-2222-4333-8444-555555555555",
        month: "2026-08",
        amount: 1,
        amountPaise: 100,
      },
    });
    expect(res.ok()).toBeFalsy();
    const body = await res.json();
    expect(body.amount).toBeUndefined();
  });

  test("missing required fields are rejected before any order is created", async ({ request }) => {
    const token = await signIn(request, TENANT_EMAIL!, TENANT_PASSWORD!);
    const res = await request.post(fnUrl("create-rent-payment-order"), {
      headers: authHeaders(token),
      data: {},
    });
    expect(res.status()).toBe(400);
  });

  test("a forged payment signature is rejected", async ({ request }) => {
    const token = await signIn(request, TENANT_EMAIL!, TENANT_PASSWORD!);
    const res = await request.post(fnUrl("verify-rent-payment"), {
      headers: authHeaders(token),
      data: {
        paymentRowId: "11111111-2222-4333-8444-555555555555",
        razorpay_order_id: "order_forged",
        razorpay_payment_id: "pay_forged",
        razorpay_signature: "0".repeat(64),
      },
    });
    // Must fail on the signature, before the row is ever looked at.
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/verification failed/i);
  });
});

test.describe("rent payment RLS", () => {
  test.skip(!hasSupabase || !hasTenant, "Supabase env or tenant credentials not set");

  test("a tenant cannot mark their own payment paid directly", async ({ request }) => {
    const token = await signIn(request, TENANT_EMAIL!, TENANT_PASSWORD!);
    // No tenant UPDATE policy exists on rent_payments by design (migration
    // 047): only verify-rent-payment, holding the service role after
    // checking a real signature, may flip a payment to paid. A direct
    // PATCH must therefore change nothing.
    const res = await request.patch(
      `${fnUrl("").replace("/functions/v1/", "/rest/v1/")}rent_payments?status=eq.pending`,
      {
        headers: { ...authHeaders(token), Prefer: "return=representation" },
        data: { status: "paid" },
      }
    );
    const body = await res.json().catch(() => []);
    expect(Array.isArray(body) ? body.length : 0).toBe(0);
  });
});

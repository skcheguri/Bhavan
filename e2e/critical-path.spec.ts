import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// Covers the core trust loop of the marketplace: a tenant requests to
// connect on a listing, and the owner approves it. This is the one flow
// every other feature (chat, agreements, payments) depends on, and until
// this file existed it had zero automated coverage.
//
// Requires two dedicated, pre-confirmed test accounts and a test listing
// owned by the owner account -- see e2e/README.md for how these were
// seeded. Skips itself cleanly (not a failure) when the env vars aren't
// configured, matching the existing pattern in auth.spec.ts.
//
// Test-data note: each run creates one real connection_request row
// between the two dedicated test accounts. That does count against the
// tenant test account's real server-side daily contact-request limit
// (5/day). To keep the suite re-runnable, afterAll below signs in as the
// owner and deletes the request it just approved -- the "Owners can read
// and update their requests" RLS policy is FOR ALL, so a normal
// (RLS-respecting, anon-key) delete works without a service-role key.
const TENANT_EMAIL = process.env.E2E_TENANT_EMAIL;
const TENANT_PASSWORD = process.env.E2E_TENANT_PASSWORD;
const OWNER_EMAIL = process.env.E2E_OWNER_EMAIL;
const OWNER_PASSWORD = process.env.E2E_OWNER_PASSWORD;
const LISTING_ID = process.env.E2E_TEST_LISTING_ID;
const SUPABASE_URL = process.env.VITE_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_PUBLIC_SUPABASE_ANON_KEY;

const canRun = TENANT_EMAIL && TENANT_PASSWORD && OWNER_EMAIL && OWNER_PASSWORD && LISTING_ID;

test.describe.serial("connection request -> approval", () => {
  test.skip(!canRun, "E2E_TENANT_EMAIL/PASSWORD, E2E_OWNER_EMAIL/PASSWORD, E2E_TEST_LISTING_ID not set");

  test.afterAll(async () => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: OWNER_EMAIL!,
      password: OWNER_PASSWORD!,
    });
    if (signInError) return;

    await supabase
      .from("connection_requests")
      .delete()
      .eq("listing_id", LISTING_ID!)
      .eq("owner_id", (await supabase.auth.getUser()).data.user?.id ?? "");

    await supabase.auth.signOut();
  });

  test("tenant can submit a connection request on a listing", async ({ page }) => {
    await page.goto("/login");
    await page.getByText(/i'm a tenant/i).click();
    await page.getByPlaceholder("your@email.com").fill(TENANT_EMAIL!);
    await page.getByPlaceholder("Enter your password").fill(TENANT_PASSWORD!);
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await expect(page).toHaveURL(/\/listings/);

    await page.goto(`/listings/${LISTING_ID}`);
    await page.getByRole("button", { name: /request to connect/i }).first().click();

    await page.locator("#req-name").fill("E2E Tenant");
    // Not "9876543210" -- that's a perfectly descending sequence and the
    // app's own hasFakeDigitPattern() check correctly rejects it as fake.
    await page.locator("#req-phone").fill("9847263501");
    await page.locator("#req-message").fill("E2E test request -- please ignore.");
    await page.getByRole("button", { name: /send request/i }).click();

    await expect(page.getByText(/request sent! owner will review and approve/i)).toBeVisible({ timeout: 10_000 });
  });

  test("owner can approve the tenant's pending request", async ({ page }) => {
    await page.goto("/login");
    await page.getByText(/i'm an owner/i).click();
    await page.getByPlaceholder("your@email.com").fill(OWNER_EMAIL!);
    await page.getByPlaceholder("Enter your password").fill(OWNER_PASSWORD!);
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await expect(page).toHaveURL(/\/listings/);

    await page.goto("/owner-profile");
    await page.getByRole("button", { name: /inquiries/i }).click();

    const requestCard = page.locator("text=E2E Tenant").first();
    await expect(requestCard).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: /approve.*start chat/i }).first().click();
    await page.getByRole("button", { name: /yes, approve/i }).click();

    await expect(page.getByText(/approved.*chat unlocked/i).first()).toBeVisible({ timeout: 10_000 });
  });
});

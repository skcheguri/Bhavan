import { test, expect } from "@playwright/test";
import { hasSupabase } from "./helpers";

// Smoke tests for pages that render without needing a logged-in
// session -- the cheapest, most stable layer of E2E coverage since they
// need no seeded test account and no cleanup.
test.describe("public pages", () => {
  test("home page loads with no console errors", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.goto("/");

    await expect(page.getByRole("heading", { name: /find your next home with confidence/i })).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });

  test("listings page shows the browse UI, with filters behind the edit toggle", async ({ page }) => {
    await page.goto("/listings");

    // Anchored to the count, not just the words: with an empty result set
    // the page also renders "No properties found", and a looser regex
    // matches both and trips strict mode. Written this way the assertion
    // holds whether or not the project has listings, so this test -- and
    // with it the filter toggle below -- still runs in CI.
    await expect(page.getByText(/\d+ properties found/i)).toBeVisible();

    // Filters start collapsed so the sticky header doesn't eat the
    // viewport while scrolling results -- on a phone it was ~30% of the
    // screen. They must be genuinely hidden, not just visually: a
    // display:none panel keeps its controls out of the tab order.
    const filters = page.locator("#listing-filters");
    await expect(filters).toBeHidden();

    // The <option> text inside a closed native dropdown doesn't count as
    // visible per Playwright's actionability rules, so assert on the
    // select element itself rather than its option text.
    await page.getByRole("button", { name: /edit filters/i }).click();
    await expect(filters).toBeVisible();
    await expect(filters.locator("select").first()).toBeVisible();

    // Applying collapses the panel again and leaves a count behind, which
    // is the only remaining signal that results are filtered.
    await filters.getByRole("button", { name: /update search/i }).click();
    await expect(filters).toBeHidden();
  });

  test("navigating from listings to a listing's detail page works", async ({ page }) => {
    // Unlike the rest of this file, this one needs the project to
    // actually contain a listing to click.
    test.skip(!hasSupabase, "Supabase env not set");
    await page.goto("/listings");

    // Listing cards are plain divs with an onClick navigate() handler,
    // not <a href> links -- data-product-shop is a leftover attribute
    // from the original template, but it's a stable, unique-enough
    // hook for "this element is a listing card."
    const firstCard = page.locator("[data-product-shop]").first();
    await expect(firstCard).toBeVisible({ timeout: 10_000 });
    await firstCard.click();

    await expect(page).toHaveURL(/\/listings\/[\w-]+/);
    await expect(page.getByText(/about this property/i)).toBeVisible();
  });

  test("login page shows both role options", async ({ page }) => {
    await page.goto("/login");

    await expect(page.getByText(/i'm a tenant/i)).toBeVisible();
    await expect(page.getByText(/i'm an owner/i)).toBeVisible();
  });
});

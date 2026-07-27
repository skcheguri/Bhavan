import { test, expect } from "@playwright/test";

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

  test("listings page shows the browse UI and filters", async ({ page }) => {
    await page.goto("/listings");

    await expect(page.getByText(/properties found/i)).toBeVisible();
    // The filter <select>'s <option> text isn't independently "visible"
    // per Playwright's actionability rules (options in a closed native
    // dropdown register as hidden even though the select itself is
    // visible) -- assert on the select element, not its option text.
    await expect(page.locator("select").first()).toBeVisible();
  });

  test("navigating from listings to a listing's detail page works", async ({ page }) => {
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

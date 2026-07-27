import { test, expect } from "@playwright/test";

test.describe("signup form", () => {
  test("strips special characters from the name field live", async ({ page }) => {
    await page.goto("/signup");

    const nameInput = page.getByPlaceholder("John Doe").first();
    await nameInput.fill("John@#$ Doe123!");

    await expect(nameInput).toHaveValue("John Doe");
  });

  test("shows a validation error for an invalid name on submit", async ({ page }) => {
    await page.goto("/signup");

    // A name of only spaces is the one invalid value that's actually
    // reachable through the real UI: the live onChange filter strips
    // any non-letter/non-space character before it lands in state, and
    // the input's `required` attribute blocks native submission for a
    // truly empty value -- but "   " is non-empty, passes the character
    // filter, and still fails isValidName()'s trimmed-length check.
    await page.getByPlaceholder("John Doe").first().fill("   ");
    await page.getByPlaceholder("your@email.com").first().fill("test@example.com");
    await page.getByPlaceholder("Min. 8 characters").fill("password123");
    await page.getByRole("checkbox").first().check();
    await page.getByRole("checkbox").nth(1).check();
    await page.getByRole("button", { name: /create account/i }).click();

    await expect(page.getByText(/name can only contain letters and spaces/i)).toBeVisible();
  });
});

test.describe("forgot password", () => {
  test("shows the check-your-email step after requesting a reset link", async ({ page }) => {
    // This only exercises the client-side step transition, not real
    // email delivery -- Supabase's resetPasswordForEmail() is rate
    // limited (see send-sms-hook/README.md-adjacent notes on the email
    // side), so E2E shouldn't hammer it on every run. Use a throwaway
    // address that's syntactically valid but not a real test account.
    await page.goto("/login");
    await page.getByText(/i'm a tenant/i).click();
    await page.getByRole("button", { name: /forgot password/i }).click();
    // The sign-in form's own email field shares the same placeholder,
    // so it's not unique on the page once the modal is open -- the
    // modal's field renders last in the DOM.
    await page.getByPlaceholder("your@email.com").last().fill(`e2e-${Date.now()}@example.com`);
    await page.getByRole("button", { name: /send reset link/i }).click();

    await expect(page.getByText(/check your email/i)).toBeVisible({ timeout: 10_000 });
  });
});

// Example of a real authenticated-flow test. Requires seeded test
// credentials (see e2e/README.md) -- skips itself cleanly rather than
// failing when they're not configured, so this file doesn't block CI
// for contributors who haven't set up a test account yet.
const TENANT_EMAIL = process.env.E2E_TENANT_EMAIL;
const TENANT_PASSWORD = process.env.E2E_TENANT_PASSWORD;

test.describe("tenant login", () => {
  test.skip(!TENANT_EMAIL || !TENANT_PASSWORD, "E2E_TENANT_EMAIL / E2E_TENANT_PASSWORD not set");

  test("a seeded tenant account can log in and reach their dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByText(/i'm a tenant/i).click();
    await page.getByPlaceholder("your@email.com").fill(TENANT_EMAIL!);
    await page.getByPlaceholder("Enter your password").fill(TENANT_PASSWORD!);
    await page.getByRole("button", { name: /^sign in$/i }).click();

    await expect(page).toHaveURL(/\/listings/);
  });
});

import { test, expect } from "@playwright/test";
import {
  authHeaders,
  createDisposableUser,
  destroyUser,
  hasServiceRole,
  hasTenant,
  restUrl,
  serviceHeaders,
  signIn,
  SUPABASE_URL,
  TENANT_EMAIL,
  TENANT_PASSWORD,
} from "./helpers";

// Account deletion is irreversible, so unlike every other spec this one
// must never touch a shared fixture -- each destructive test creates its
// own throwaway account and tears it down afterwards. Tests that need to
// create an account are skipped (not failed) unless E2E_SERVICE_ROLE_KEY
// is set, matching how the rest of the suite degrades.

test.describe("delete account confirmation gate", () => {
  test.skip(!hasTenant, "E2E_TENANT_EMAIL/PASSWORD not set");

  test("requires typing DELETE, and cancelling destroys nothing", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("your@email.com").fill(TENANT_EMAIL!);
    await page.getByPlaceholder("Enter your password").fill(TENANT_PASSWORD!);
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await expect(page).toHaveURL(/\/listings/);

    await page.goto("/tenant-profile");
    await page.getByRole("button", { name: /settings/i }).first().click();
    await page.getByRole("button", { name: /permanently erase your personal data/i }).click();

    const confirmButton = page.getByRole("button", { name: /^delete account$/i });
    await expect(confirmButton).toBeDisabled();

    // A near-miss must not arm it either.
    await page.locator("#delete-confirm-input").fill("delete");
    await expect(confirmButton).toBeDisabled();

    await page.locator("#delete-confirm-input").fill("DELETE");
    await expect(confirmButton).toBeEnabled();

    // Back out -- the fixture account must survive this test.
    await page.getByRole("button", { name: /^cancel$/i }).click();
    await expect(page.getByRole("heading", { name: /delete your account\?/i })).toBeHidden();
    await expect(page).toHaveURL(/\/tenant-profile/);
  });

  test("states plainly what is retained on shared legal documents", async ({ page }) => {
    await page.goto("/login");
    await page.getByPlaceholder("your@email.com").fill(TENANT_EMAIL!);
    await page.getByPlaceholder("Enter your password").fill(TENANT_PASSWORD!);
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await expect(page).toHaveURL(/\/listings/);

    await page.goto("/tenant-profile");
    await page.getByRole("button", { name: /settings/i }).first().click();
    await page.getByRole("button", { name: /permanently erase your personal data/i }).click();

    // The dialog previously claimed everything was erased while name and
    // PAN in fact remained on signed agreements. If that promise ever
    // silently returns, this fails.
    await expect(page.getByText(/your name and PAN stay on those documents/i)).toBeVisible();
  });
});

test.describe("delete account lifecycle", () => {
  test.skip(!hasServiceRole, "E2E_SERVICE_ROLE_KEY not set (needed to create/destroy throwaway accounts)");

  test("erases the profile, revokes login, and leaves shared records intact", async ({ request }) => {
    const user = await createDisposableUser(request, { role: "tenant", name: "Deletion Lifecycle" });

    try {
      const token = await signIn(request, user.email, user.password);

      const res = await request.post(`${SUPABASE_URL}/rest/v1/rpc/delete_my_account`, {
        headers: authHeaders(token),
        data: {},
      });
      expect(res.status()).toBe(204);

      // The users row survives (so counterparty records keep a valid FK)
      // but is scrubbed.
      const after = await request.get(restUrl(`users?id=eq.${user.id}&select=name,email,phone,deleted_at`), {
        headers: serviceHeaders(),
      });
      const [row] = await after.json();
      expect(row).toBeTruthy();
      expect(row.name).toBe("Deleted User");
      expect(row.email).not.toBe(user.email);
      expect(row.phone).toBeNull();
      expect(row.deleted_at).not.toBeNull();

      // Login is genuinely revoked, not just hidden.
      const reLogin = await request.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        headers: serviceHeaders(),
        data: { email: user.email, password: user.password },
      });
      expect(reLogin.ok()).toBeFalsy();
    } finally {
      await destroyUser(request, user.id);
    }
  });

  test("is blocked while a lease is still running, and erases contact details once it ends", async ({ request }) => {
    const owner = await createDisposableUser(request, { role: "owner", name: "Lease Owner" });
    const tenant = await createDisposableUser(request, { role: "tenant", name: "Lease Tenant" });

    try {
      const agreementRes = await request.post(restUrl("rental_agreements"), {
        headers: { ...serviceHeaders(), Prefer: "return=representation" },
        data: {
          owner_id: owner.id,
          tenant_id: tenant.id,
          agreement_number: `RA-E2E-${Date.now()}`,
          tenant_name: "Lease Tenant",
          tenant_phone: "+91 98472 63501",
          tenant_email: tenant.email,
          landlord_name: "Lease Owner",
          property_address: "E2E Property",
          monthly_rent: 15000,
          security_deposit: 30000,
          lease_start_date: new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10),
          lease_end_date: new Date(Date.now() + 200 * 864e5).toISOString().slice(0, 10),
        },
      });
      expect(agreementRes.ok()).toBeTruthy();
      const [agreement] = await agreementRes.json();

      const tenantToken = await signIn(request, tenant.email, tenant.password);

      // Running lease -> refused, so the owner isn't left with an
      // uncontactable counterparty mid-tenancy.
      const blocked = await request.post(`${SUPABASE_URL}/rest/v1/rpc/delete_my_account`, {
        headers: authHeaders(tenantToken),
        data: {},
      });
      expect(blocked.ok()).toBeFalsy();
      expect((await blocked.json()).message).toMatch(/rental agreement\(s\) running/i);

      // End the lease, then deletion proceeds.
      await request.patch(restUrl(`rental_agreements?id=eq.${agreement.id}`), {
        headers: serviceHeaders(),
        data: { lease_end_date: new Date(Date.now() - 864e5).toISOString().slice(0, 10) },
      });

      const allowed = await request.post(`${SUPABASE_URL}/rest/v1/rpc/delete_my_account`, {
        headers: authHeaders(tenantToken),
        data: {},
      });
      expect(allowed.status()).toBe(204);

      // Contact details are erased from the legal document; the name
      // stays, because it identifies a party to an executed agreement.
      const docRes = await request.get(
        restUrl(`rental_agreements?id=eq.${agreement.id}&select=tenant_name,tenant_phone,tenant_email`),
        { headers: serviceHeaders() }
      );
      const [doc] = await docRes.json();
      expect(doc.tenant_phone).toBeNull();
      expect(doc.tenant_email).toBeNull();
      expect(doc.tenant_name).toBe("Lease Tenant");

      await request.delete(restUrl(`rental_agreements?id=eq.${agreement.id}`), { headers: serviceHeaders() });
    } finally {
      await destroyUser(request, tenant.id);
      await destroyUser(request, owner.id);
    }
  });

  test("an admin cannot self-delete through this flow", async ({ request }) => {
    const admin = await createDisposableUser(request, { role: "admin" as "owner", name: "Admin Probe" });

    try {
      const token = await signIn(request, admin.email, admin.password);
      const res = await request.post(`${SUPABASE_URL}/rest/v1/rpc/delete_my_account`, {
        headers: authHeaders(token),
        data: {},
      });
      expect(res.ok()).toBeFalsy();
      expect((await res.json()).message).toMatch(/admin accounts can't be self-deleted/i);
    } finally {
      await destroyUser(request, admin.id);
    }
  });
});

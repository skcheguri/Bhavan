import type { APIRequestContext } from "@playwright/test";

// Shared helpers for the money/destructive-path specs. These talk to
// Supabase directly (auth + PostgREST + edge functions) rather than
// driving the UI, because the guards worth testing here are server-side:
// a regression in them costs real money or leaks real data, and no amount
// of clicking proves they hold.

export const SUPABASE_URL = process.env.VITE_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.VITE_PUBLIC_SUPABASE_ANON_KEY ?? "";

// Optional. Only the tests that must create or destroy a real account
// need it; everything else runs with the ordinary fixture logins.
export const SERVICE_ROLE_KEY = process.env.E2E_SERVICE_ROLE_KEY ?? "";

export const TENANT_EMAIL = process.env.E2E_TENANT_EMAIL;
export const TENANT_PASSWORD = process.env.E2E_TENANT_PASSWORD;
export const OWNER_EMAIL = process.env.E2E_OWNER_EMAIL;
export const OWNER_PASSWORD = process.env.E2E_OWNER_PASSWORD;

export const hasSupabase = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const hasTenant = Boolean(hasSupabase && TENANT_EMAIL && TENANT_PASSWORD);
export const hasOwner = Boolean(hasSupabase && OWNER_EMAIL && OWNER_PASSWORD);
export const hasServiceRole = Boolean(hasSupabase && SERVICE_ROLE_KEY);

export function fnUrl(name: string): string {
  return `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/${name}`;
}

export function restUrl(path: string): string {
  return `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${path}`;
}

/** Signs in and returns the access token, or throws with the real reason. */
export async function signIn(
  request: APIRequestContext,
  email: string,
  password: string
): Promise<string> {
  const res = await request.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    data: { email, password },
  });
  const body = await res.json();
  if (!res.ok() || !body.access_token) {
    throw new Error(`Could not sign in as ${email}: ${body.error_description || body.msg || res.status()}`);
  }
  return body.access_token as string;
}

export function authHeaders(token: string): Record<string, string> {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export function serviceHeaders(): Record<string, string> {
  return {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  };
}

/**
 * Creates a confirmed, disposable user via the Auth admin API and returns
 * its id + credentials. Used by the deletion spec, which by definition
 * cannot reuse a shared fixture: the account it tests is destroyed.
 */
export async function createDisposableUser(
  request: APIRequestContext,
  opts: { role: "tenant" | "owner"; name: string }
): Promise<{ id: string; email: string; password: string }> {
  const email = `e2e-disposable-${Date.now()}-${Math.floor(Math.random() * 1e6)}@mybhavan.test`;
  const password = "E2eDisposable!Pass8241";

  const res = await request.post(`${SUPABASE_URL}/auth/v1/admin/users`, {
    headers: serviceHeaders(),
    data: {
      email,
      password,
      email_confirm: true,
      user_metadata: { name: opts.name, role: opts.role },
    },
  });
  const body = await res.json();
  if (!res.ok() || !body.id) {
    throw new Error(`Could not create disposable user: ${JSON.stringify(body).slice(0, 300)}`);
  }
  return { id: body.id as string, email, password };
}

/** Best-effort teardown so a failed assertion can't leave an account behind. */
export async function destroyUser(request: APIRequestContext, userId: string): Promise<void> {
  await request.delete(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, { headers: serviceHeaders() });
  await request.delete(restUrl(`users?id=eq.${userId}`), { headers: serviceHeaders() });
}

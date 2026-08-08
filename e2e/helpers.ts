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

/**
 * Creates an ACTIVE society owned by the given user and returns its id and
 * join code.
 *
 * Activation is done with the service role because that is what Bhavan's
 * review does, and because the founder's admin membership is seeded by a
 * trigger on that transition -- there is no client path to a usable
 * society, by design.
 */
export async function createDisposableSociety(
  request: APIRequestContext,
  ownerId: string,
  opts: { name?: string; paid?: boolean } = {}
): Promise<{ id: string; joinCode: string }> {
  const name = opts.name ?? `E2E Society ${Date.now()}`;

  const created = await request.post(restUrl("communities"), {
    headers: { ...serviceHeaders(), Prefer: "return=representation" },
    data: {
      name,
      kind: "apartment",
      address: "E2E Road",
      city: "Hyderabad",
      created_by: ownerId,
      status: "pending",
    },
  });
  const rows = await created.json();
  if (!created.ok() || !rows?.[0]?.id) {
    throw new Error(`Could not create society: ${JSON.stringify(rows).slice(0, 300)}`);
  }
  const id = rows[0].id as string;

  const activated = await request.patch(restUrl(`communities?id=eq.${id}`), {
    headers: serviceHeaders(),
    data: { status: "active" },
  });
  if (!activated.ok()) {
    throw new Error(`Could not activate society: ${activated.status()}`);
  }

  if (opts.paid) {
    await request.post(restUrl("community_subscriptions"), {
      headers: serviceHeaders(),
      data: {
        community_id: id,
        plan: "standard",
        status: "active",
        purchased_by: ownerId,
        current_period_end: "2030-01-01T00:00:00Z",
      },
    });
  }

  return { id, joinCode: rows[0].join_code as string };
}

/**
 * Best-effort teardown. Deleting the society cascades to memberships,
 * tickets, notices, collections and contributions, so this one call is
 * enough -- and it is why migration 088 had to make that delete possible.
 */
export async function destroySociety(request: APIRequestContext, id: string): Promise<void> {
  await request.delete(restUrl(`billing_history?community_id=eq.${id}`), { headers: serviceHeaders() });
  await request.delete(restUrl(`communities?id=eq.${id}`), { headers: serviceHeaders() });
}

/** The signed-in user's id, for tests that need to post rows as themselves. */
export async function userIdFor(request: APIRequestContext, token: string): Promise<string> {
  const res = await request.get(`${SUPABASE_URL}/auth/v1/user`, { headers: authHeaders(token) });
  const body = await res.json();
  if (!res.ok() || !body.id) throw new Error(`Could not read user id: ${res.status()}`);
  return body.id as string;
}

/**
 * A society founded by someone else, where `memberId` is an ordinary
 * approved member.
 *
 * Needed because the fixture owner is otherwise the founder, and a founder
 * is an admin -- so every guard that exempts admins would be exempted, and
 * a test asserting "a member cannot do X" would pass for the wrong reason.
 * Migration 075's founder exemption makes this sharper still: the creator
 * of an active society with no admin is deliberately allowed to become
 * one, which is correct behaviour and useless for testing member limits.
 *
 * The founder is seeded through the service role, which bypasses the
 * verified-owner gate. That is fine here -- the gate itself is tested
 * separately, with a real token.
 */
export async function createSocietyWithPlainMember(
  request: APIRequestContext,
  founderId: string,
  memberId: string,
  opts: { paid?: boolean } = {}
): Promise<{ id: string; joinCode: string }> {
  const society = await createDisposableSociety(request, founderId, opts);

  await request.post(restUrl("community_members"), {
    headers: serviceHeaders(),
    data: {
      community_id: society.id,
      user_id: memberId,
      unit_numbers: ["A-402"],
      role: "member",
      status: "approved",
    },
  });

  return society;
}

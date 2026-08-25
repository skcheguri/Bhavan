import { useState, useEffect, useCallback, useRef } from 'react';
import { getSupabase } from '@/lib/supabase';

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: 'tenant' | 'owner' | 'admin' | string;
  verifiedEmail: boolean;
  verifiedPhone: boolean;
  verifiedAadhaar: boolean;
  suspended: boolean;
  suspendedReason: string | null;
  suspendedAt: string | null;
  createdAt: string;
}

function mapRow(r: Record<string, unknown>): AdminUserRow {
  return {
    id: String(r.id),
    name: String(r.name ?? ''),
    email: String(r.email ?? ''),
    phone: (r.phone as string | null) ?? null,
    role: String(r.role ?? ''),
    verifiedEmail: Boolean(r.verified_email),
    verifiedPhone: Boolean(r.verified_phone),
    verifiedAadhaar: Boolean(r.verified_aadhaar),
    suspended: Boolean(r.suspended),
    suspendedReason: (r.suspended_reason as string | null) ?? null,
    suspendedAt: (r.suspended_at as string | null) ?? null,
    createdAt: String(r.created_at ?? ''),
  };
}

export interface AdminUserStats {
  totalUsers: number;
  totalTenants: number;
  totalOwners: number;
  totalAdmins: number;
  suspendedCount: number;
}

// Single-user lookup for pages that only have an id + name (broker
// reports, etc), not the full row a list hook would already have.
export async function fetchAdminUserById(id: string): Promise<AdminUserRow | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('admin_get_user', { target_id: id });
  if (error) {
    console.warn('Supabase admin_get_user error:', error.message);
    return null;
  }
  const row = (data as Record<string, unknown>[] | null)?.[0];
  return row ? mapRow(row) : null;
}

// suspend=true suspends the account (real: blocks sign-in via Supabase
// Auth's ban_duration), suspend=false lifts it. Runs through the
// admin-suspend-user Edge Function since only the service role can
// call the Auth Admin API that actually enforces the ban. Standalone
// so pages that don't need the full user list (e.g. broker reports)
// can suspend without pulling in useAdminUsers' list-fetching state.
export async function setUserSuspended(
  targetUserId: string,
  suspend: boolean,
  reason?: string
): Promise<{ error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { error: 'Database connection unavailable' };

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) return { error: 'Not authenticated' };

  // Guard the env var the same way supabase.ts does -- an undefined base
  // would otherwise build a "undefined/functions/v1/..." URL that fails
  // with an opaque network error instead of a clear misconfiguration.
  const baseUrl =
    (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_PUBLIC_SUPABASE_URL) || '';
  if (!baseUrl) return { error: 'Supabase URL is not configured' };

  const functionsUrl = `${baseUrl}/functions/v1/admin-suspend-user`;
  const res = await fetch(functionsUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ targetUserId, suspend, reason }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { error: body.error ?? 'Failed to update account status' };
  return { error: null };
}

export function useAdminUsers() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const requestIdRef = useRef(0);

  const load = useCallback(async (searchQuery: string) => {
    const supabase = getSupabase();
    if (!supabase) {
      setLoading(false);
      return;
    }
    // Sequence tag: two rapid searches ("ra" then "raj") race, and without
    // this the slower response can land last and show results for the wrong
    // query. Only the newest request is allowed to write state.
    const reqId = ++requestIdRef.current;
    setLoading(true);
    const { data, error } = await supabase.rpc('admin_list_users', {
      search_query: searchQuery || null,
      result_limit: 100,
    });

    if (reqId !== requestIdRef.current) return;

    if (error) {
      console.warn('Supabase admin_list_users error:', error.message);
      setUsers([]);
    } else {
      setUsers(((data ?? []) as Record<string, unknown>[]).map(mapRow));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => load(search), 300);
    return () => clearTimeout(handle);
  }, [search, load]);

  const setSuspended = useCallback(
    async (targetUserId: string, suspend: boolean, reason?: string): Promise<{ error: string | null }> => {
      const result = await setUserSuspended(targetUserId, suspend, reason);
      if (!result.error) await load(search);
      return result;
    },
    [load, search]
  );

  return { users, loading, search, setSearch, setSuspended, refresh: () => load(search) };
}

export function useAdminUserStats() {
  const [stats, setStats] = useState<AdminUserStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const supabase = getSupabase();
      if (!supabase) {
        setLoading(false);
        return;
      }
      const { data, error } = await supabase.rpc('admin_user_stats');
      if (error) {
        console.warn('Supabase admin_user_stats error:', error.message);
      } else {
        const row = data?.[0];
        if (row) {
          setStats({
            totalUsers: Number(row.total_users ?? 0),
            totalTenants: Number(row.total_tenants ?? 0),
            totalOwners: Number(row.total_owners ?? 0),
            totalAdmins: Number(row.total_admins ?? 0),
            suspendedCount: Number(row.suspended_count ?? 0),
          });
        }
      }
      setLoading(false);
    })();
  }, []);

  return { stats, loading };
}

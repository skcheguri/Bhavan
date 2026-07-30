import { useState, useEffect, useCallback } from 'react';
import { getSupabase } from '@/lib/supabase';

export interface PurgedAccount {
  id: string;
  originalUserId: string;
  email: string | null;
  phone: string | null;
  name: string | null;
  role: string | null;
  accountCreatedAt: string | null;
  purgedAt: string;
}

export function useAdminPurgedAccounts() {
  const [accounts, setAccounts] = useState<PurgedAccount[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);

    const { data, error } = await supabase
      .from('purged_unconfirmed_accounts')
      .select('*')
      .order('purged_at', { ascending: false });

    if (error) {
      console.warn('Supabase purged_unconfirmed_accounts fetch error:', error.message);
      setAccounts([]);
      setLoading(false);
      return;
    }

    setAccounts(
      ((data ?? []) as Record<string, unknown>[]).map((row) => ({
        id: String(row.id),
        originalUserId: String(row.original_user_id),
        email: (row.email as string | null) ?? null,
        phone: (row.phone as string | null) ?? null,
        name: (row.name as string | null) ?? null,
        role: (row.role as string | null) ?? null,
        accountCreatedAt: (row.account_created_at as string | null) ?? null,
        purgedAt: String(row.purged_at),
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { accounts, loading, refresh: load };
}

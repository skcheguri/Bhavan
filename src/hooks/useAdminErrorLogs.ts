import { useState, useEffect, useCallback } from 'react';
import { getSupabase } from '@/lib/supabase';

export interface ClientErrorLog {
  id: string;
  message: string;
  stack: string | null;
  componentStack: string | null;
  source: 'error_boundary' | 'window_error' | 'unhandled_rejection';
  url: string | null;
  userAgent: string | null;
  userId: string | null;
  createdAt: string;
}

function mapRow(r: Record<string, unknown>): ClientErrorLog {
  return {
    id: String(r.id),
    message: String(r.message ?? ''),
    stack: (r.stack as string | null) ?? null,
    componentStack: (r.component_stack as string | null) ?? null,
    source: r.source as ClientErrorLog['source'],
    url: (r.url as string | null) ?? null,
    userAgent: (r.user_agent as string | null) ?? null,
    userId: (r.user_id as string | null) ?? null,
    createdAt: String(r.created_at ?? ''),
  };
}

export function useAdminErrorLogs() {
  const [logs, setLogs] = useState<ClientErrorLog[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('client_error_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      console.warn('Supabase client_error_logs fetch error:', error.message);
      setLogs([]);
    } else {
      setLogs(((data ?? []) as Record<string, unknown>[]).map(mapRow));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const dismiss = useCallback(async (id: string): Promise<boolean> => {
    const supabase = getSupabase();
    if (!supabase) return false;
    const { error } = await supabase.from('client_error_logs').delete().eq('id', id);
    if (error) return false;
    setLogs((prev) => prev.filter((l) => l.id !== id));
    return true;
  }, []);

  return { logs, loading, refresh: load, dismiss };
}

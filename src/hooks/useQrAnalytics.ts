import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';

export interface QrAnalyticsDay {
  id: string;
  listing_id: string;
  scan_date: string;
  scans_count: number;
  messages_sent: number;
}

async function bumpCounter(listingId: string, field: 'scans_count' | 'messages_sent'): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  // Direct insert/update on qr_analytics is no longer grantable to anon/
  // authenticated -- a plain UPDATE had no ownership check, letting anyone
  // set another listing's counters to an arbitrary value. This RPC does
  // the same upsert-and-increment atomically, server-side.
  const { error } = await supabase.rpc('increment_qr_counter', {
    p_listing_id: listingId,
    p_field: field,
    p_delta: 1,
  });
  if (error) console.warn('Supabase qr_analytics increment error:', error.message);
}

export async function recordScan(listingId: string): Promise<void> {
  return bumpCounter(listingId, 'scans_count');
}

export async function recordConversion(listingId: string): Promise<void> {
  return bumpCounter(listingId, 'messages_sent');
}

export function useListingQrAnalytics(listingId: string | undefined, days = 7) {
  const [analytics, setAnalytics] = useState<QrAnalyticsDay[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase || !listingId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('qr_analytics')
      .select('*')
      .eq('listing_id', listingId)
      .gte('scan_date', since)
      .order('scan_date', { ascending: true });

    if (error) {
      console.warn('Supabase qr_analytics fetch error:', error.message);
      setAnalytics([]);
    } else {
      setAnalytics((data ?? []) as QrAnalyticsDay[]);
    }
    setLoading(false);
  }, [listingId, days]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { analytics, loading, refresh };
}

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';

export interface QrAnalyticsDay {
  id: string;
  listing_id: string;
  scan_date: string;
  scans_count: number;
  messages_sent: number;
}

function todayDate(): string {
  return new Date().toISOString().split('T')[0];
}

async function bumpCounter(listingId: string, field: 'scans_count' | 'messages_sent'): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  const scanDate = todayDate();

  const { data: existing, error: fetchError } = await supabase
    .from('qr_analytics')
    .select('id, scans_count, messages_sent')
    .eq('listing_id', listingId)
    .eq('scan_date', scanDate)
    .maybeSingle();

  if (fetchError) {
    console.warn('Supabase qr_analytics fetch error:', fetchError.message);
    return;
  }

  if (existing) {
    const { error } = await supabase
      .from('qr_analytics')
      .update({ [field]: (existing[field] ?? 0) + 1 })
      .eq('id', existing.id);
    if (error) console.warn('Supabase qr_analytics update error:', error.message);
  } else {
    const { error } = await supabase.from('qr_analytics').insert({
      listing_id: listingId,
      scan_date: scanDate,
      scans_count: field === 'scans_count' ? 1 : 0,
      messages_sent: field === 'messages_sent' ? 1 : 0,
    });
    if (error) console.warn('Supabase qr_analytics insert error:', error.message);
  }
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

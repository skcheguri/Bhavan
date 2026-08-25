import { useState, useEffect, useCallback } from 'react';
import { getSupabase } from '@/lib/supabase';

export const LISTING_REPORT_REASONS = [
  { value: 'photos_dont_match', label: "Photos don't match the property" },
  { value: 'inaccurate_details', label: 'Price, size, or details are inaccurate' },
  { value: 'unavailable', label: 'Property is not actually available' },
  { value: 'other', label: 'Other' },
] as const;

export type ListingReportReason = (typeof LISTING_REPORT_REASONS)[number]['value'];
export type ListingReportStatus = 'pending' | 'reviewed' | 'resolved' | 'dismissed';

export async function submitListingReport(
  listingId: string,
  reporterId: string,
  reason: ListingReportReason,
  reasonText: string
): Promise<{ error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { error: 'Database connection unavailable' };

  const { error } = await supabase.from('listing_reports').insert({
    listing_id: listingId,
    reporter_id: reporterId,
    reason,
    reason_text: reasonText || null,
  });

  if (error) return { error: error.message };
  return { error: null };
}

export interface AdminListingReport {
  id: string;
  listing_id: string;
  listing_title: string;
  reporter_id: string;
  reporter_name: string;
  reason: ListingReportReason;
  reason_text: string | null;
  status: ListingReportStatus;
  admin_note: string | null;
  created_at: string;
}

export function useAdminListingReports() {
  const [reports, setReports] = useState<AdminListingReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);

    const { data, error } = await supabase
      .from('listing_reports')
      .select('*, listing:listings(title), reporter:users_public!listing_reports_reporter_id_fkey(name)')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Supabase listing_reports fetch error:', error.message);
      setError(error.message);
      setReports([]);
      setLoading(false);
      return;
    }

    setError(null);
    setReports(
      ((data ?? []) as Record<string, unknown>[]).map((row) => ({
        id: String(row.id),
        listing_id: String(row.listing_id),
        listing_title: (row.listing as { title?: string } | null)?.title ?? 'Untitled listing',
        reporter_id: String(row.reporter_id),
        reporter_name: (row.reporter as { name?: string } | null)?.name ?? 'Unknown user',
        reason: row.reason as ListingReportReason,
        reason_text: (row.reason_text as string | null) ?? null,
        status: row.status as ListingReportStatus,
        admin_note: (row.admin_note as string | null) ?? null,
        created_at: String(row.created_at),
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const updateStatus = useCallback(
    async (id: string, status: ListingReportStatus, adminNote?: string): Promise<boolean> => {
      const supabase = getSupabase();
      if (!supabase) return false;
      const { error } = await supabase
        .from('listing_reports')
        .update({ status, admin_note: adminNote, reviewed_at: new Date().toISOString() })
        .eq('id', id);
      if (error) {
        console.warn('Supabase listing_reports update error:', error.message);
        return false;
      }
      await load();
      return true;
    },
    [load]
  );

  return { reports, loading, error, updateStatus, refresh: load };
}

import { useState, useEffect } from 'react';
import { getSupabase } from '@/lib/supabase';

export interface AdminOverviewCounts {
  totalListings: number;
  activeListings: number;
  newInquiries: number;
  verifiedUsers: number;
}

export function useAdminOverviewCounts() {
  const [counts, setCounts] = useState<AdminOverviewCounts | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const supabase = getSupabase();
      if (!supabase) {
        setLoading(false);
        return;
      }

      const [{ count: totalListings }, { count: activeListings }, { count: newInquiries }, { count: verifiedUsers }] = await Promise.all([
        supabase.from('listings').select('id', { count: 'exact', head: true }),
        supabase.from('listings').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('contact_inquiries').select('id', { count: 'exact', head: true }).eq('status', 'new'),
        // Admins can read users (RLS); count Aadhaar-verified accounts.
        supabase.from('users').select('id', { count: 'exact', head: true }).eq('verified_aadhaar', true),
      ]);

      setCounts({
        totalListings: totalListings ?? 0,
        activeListings: activeListings ?? 0,
        newInquiries: newInquiries ?? 0,
        verifiedUsers: verifiedUsers ?? 0,
      });
      setLoading(false);
    })();
  }, []);

  return { counts, loading };
}

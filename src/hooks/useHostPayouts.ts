import { useState, useEffect, useCallback } from 'react';
import { getSupabase, isSupabaseConnected } from '@/lib/supabase';
import type { Tables } from '@/types/database.types';

// Stage 1 of host payouts (migration 128): hosts register where their
// booking earnings should go, and admins work a due-payouts queue that
// shows the owed amount next to the registered account. The transfer
// itself is manual (Razorpay dashboard / RazorpayX) until Razorpay Route
// is approved -- what this buys is that the host can SEE the money's
// state instead of trusting a void.

export type PayoutAccount = Tables<'host_payout_accounts'>;

export interface PayoutAccountInput {
  method: 'upi' | 'bank';
  upiId?: string;
  accountHolder?: string;
  accountNumber?: string;
  ifsc?: string;
}

export function usePayoutAccount(userId: string | undefined) {
  const [account, setAccount] = useState<PayoutAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (!isSupabaseConnected() || !userId) {
      setLoading(false);
      return;
    }
    const supabase = getSupabase();
    if (!supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('host_payout_accounts')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      console.warn('Supabase host_payout_accounts fetch error:', error.message);
      setAccount(null);
    } else {
      setAccount(data);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const save = useCallback(
    async (input: PayoutAccountInput): Promise<{ error: string | null }> => {
      const supabase = getSupabase();
      if (!supabase || !userId) return { error: 'Not available right now.' };
      setSaving(true);
      // Unused fields are nulled explicitly so switching UPI -> bank
      // doesn't leave a stale UPI id behind (and vice versa).
      const { error } = await supabase.from('host_payout_accounts').upsert({
        user_id: userId,
        method: input.method,
        upi_id: input.method === 'upi' ? input.upiId?.trim() || null : null,
        account_holder: input.method === 'bank' ? input.accountHolder?.trim() || null : null,
        account_number: input.method === 'bank' ? input.accountNumber?.trim() || null : null,
        ifsc: input.method === 'bank' ? input.ifsc?.trim().toUpperCase() || null : null,
      });
      setSaving(false);
      if (error) {
        // The CHECK constraints raise opaque names; translate the common one.
        if (error.message.includes('check')) {
          return { error: 'Those payout details look invalid. Check the UPI id / account number / IFSC format.' };
        }
        return { error: error.message };
      }
      await refresh();
      return { error: null };
    },
    [userId, refresh]
  );

  return { account, loading, saving, save, refresh };
}

export interface DuePayoutRow extends Tables<'vacation_bookings'> {
  listing?: { title: string | null; location: string | null } | null;
  owner?: { name: string | null } | null;
}

export function hostPayoutAmount(b: Pick<DuePayoutRow, 'base_amount' | 'total_price'>): number {
  return b.base_amount ?? b.total_price;
}

// True when this row is a late-cancel forfeit awaiting the platform's
// call rather than an automatic debt to the host.
export function isForfeitDecision(b: Pick<DuePayoutRow, 'status'>): boolean {
  return b.status === 'cancelled';
}

// Admin: every booking whose money the platform has retained and not
// yet resolved -- automatic dues (stay completed / no-show) plus
// forfeits awaiting a release-or-keep decision. Mirrors
// vacation_booking_payout_due() in migration 128 -- the RPCs re-check
// server-side, so drift here can annoy but never mispay.
export function useAdminDuePayouts() {
  const [payouts, setPayouts] = useState<DuePayoutRow[]>([]);
  const [accounts, setAccounts] = useState<Record<string, PayoutAccount>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from('vacation_bookings')
      .select('*, listing:listings(title, location), owner:users_public!vacation_bookings_owner_id_fkey(name)')
      .eq('payment_status', 'paid')
      .eq('payout_status', 'unpaid')
      .or(`and(status.eq.confirmed,check_out.lte.${today}),status.eq.no_show,status.eq.cancelled`)
      .order('check_out', { ascending: true });

    if (error) {
      console.warn('Supabase due payouts fetch error:', error.message);
      setError(error.message);
      setPayouts([]);
      setAccounts({});
      setLoading(false);
      return;
    }

    setError(null);
    const rows = (data ?? []) as unknown as DuePayoutRow[];
    setPayouts(rows);

    const ownerIds = Array.from(new Set(rows.map((r) => r.owner_id)));
    if (ownerIds.length > 0) {
      const { data: accountRows } = await supabase
        .from('host_payout_accounts')
        .select('*')
        .in('user_id', ownerIds);
      const map: Record<string, PayoutAccount> = {};
      for (const a of (accountRows ?? []) as PayoutAccount[]) map[a.user_id] = a;
      setAccounts(map);
    } else {
      setAccounts({});
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const markPaid = useCallback(
    async (bookingId: string, reference: string): Promise<{ error: string | null }> => {
      const supabase = getSupabase();
      if (!supabase) return { error: 'Not available right now.' };
      const { error } = await supabase.rpc('admin_mark_payout_paid', {
        p_booking: bookingId,
        p_reference: reference || undefined,
      });
      if (error) return { error: error.message };
      await refresh();
      return { error: null };
    },
    [refresh]
  );

  // The platform keeps a forfeit. Server-side the RPC only accepts
  // undecided late-cancel forfeits.
  const withhold = useCallback(
    async (bookingId: string): Promise<{ error: string | null }> => {
      const supabase = getSupabase();
      if (!supabase) return { error: 'Not available right now.' };
      const { error } = await supabase.rpc('admin_withhold_payout', { p_booking: bookingId });
      if (error) return { error: error.message };
      await refresh();
      return { error: null };
    },
    [refresh]
  );

  return { payouts, accounts, loading, error, refresh, markPaid, withhold };
}

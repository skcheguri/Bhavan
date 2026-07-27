import { useState, useEffect, useCallback } from 'react';
import { getSupabase, isSupabaseConnected } from '@/lib/supabase';

export interface ReservedRange {
  from: string;
  to: string;
}

// Public-safe: confirmed bookings' date ranges only, no tenant identity.
// Used to gray out unavailable dates on the booking calendar for any
// visitor, including logged-out ones.
export function useListingReservedDates(listingId: string | undefined) {
  const [reservedDates, setReservedDates] = useState<ReservedRange[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!isSupabaseConnected() || !listingId) {
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
      .from('vacation_bookings_public')
      .select('check_in, check_out')
      .eq('listing_id', listingId);

    if (error) {
      console.warn('Supabase vacation_bookings_public fetch error:', error.message);
      setReservedDates([]);
    } else {
      setReservedDates(
        ((data ?? []) as Record<string, unknown>[]).map((r) => ({
          from: String(r.check_in),
          to: String(r.check_out),
        }))
      );
    }
    setLoading(false);
  }, [listingId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { reservedDates, loading, refresh };
}

export interface CreateVacationBookingInput {
  listingId: string;
  tenantId: string;
  ownerId: string;
  checkIn: string;
  checkOut: string;
  guestCount: number;
  totalPrice: number;
}

export function useCreateVacationBooking() {
  const [creating, setCreating] = useState(false);

  const create = useCallback(
    async (input: CreateVacationBookingInput): Promise<{ success: boolean; error: string | null }> => {
      const supabase = getSupabase();
      if (!supabase) return { success: false, error: 'Supabase not connected' };

      setCreating(true);
      const { error } = await supabase.from('vacation_bookings').insert({
        listing_id: input.listingId,
        tenant_id: input.tenantId,
        owner_id: input.ownerId,
        check_in: input.checkIn,
        check_out: input.checkOut,
        guest_count: input.guestCount,
        total_price: input.totalPrice,
      });
      setCreating(false);

      if (error) {
        // 23P01 = exclusion_violation -- another confirmed booking
        // already covers these dates (caught a real race, not just our
        // own client-side pre-check).
        if (error.code === '23P01') {
          return { success: false, error: 'Those dates were just booked by someone else. Please choose different dates.' };
        }
        return { success: false, error: error.message };
      }
      return { success: true, error: null };
    },
    []
  );

  return { create, creating };
}

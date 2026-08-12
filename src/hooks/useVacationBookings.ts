import { useState, useEffect, useCallback } from 'react';
import { getSupabase, isSupabaseConnected, functionErrorMessage } from '@/lib/supabase';
import { loadRazorpayScript } from '@/lib/razorpay';
import type { Tables } from '@/types/database.types';

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

export interface BookVacationStayInput {
  listingId: string;
  checkIn: string;
  checkOut: string;
  guestCount: number;
}

export type BookingPayStatus = 'idle' | 'opening' | 'verifying';

// Upfront payment: create-booking-order derives the amount server-side
// (nights x nightly price + 5% platform fee) and returns a Razorpay
// order; the booking only becomes a real `pending` request once
// verify-booking-payment has checked the payment signature. Closing the
// Checkout window abandons an unpaid `awaiting_payment` row that the
// server cleans up on the next attempt.
export function useBookVacationStay() {
  const [payStatus, setPayStatus] = useState<BookingPayStatus>('idle');

  const book = useCallback(
    (input: BookVacationStayInput): Promise<{ success: boolean; error: string | null }> =>
      new Promise((resolve) => {
        void (async () => {
          const supabase = getSupabase();
          if (!supabase) return resolve({ success: false, error: 'Payments are not available right now.' });

          setPayStatus('opening');
          const { data: orderData, error: orderError } = await supabase.functions.invoke('create-booking-order', {
            body: {
              listingId: input.listingId,
              checkIn: input.checkIn,
              checkOut: input.checkOut,
              guestCount: input.guestCount,
            },
          });

          if (orderError || !orderData?.orderId) {
            setPayStatus('idle');
            return resolve({
              success: false,
              error: (await functionErrorMessage(orderError)) || 'Could not start this booking. Please try again.',
            });
          }

          const scriptLoaded = await loadRazorpayScript();
          if (!scriptLoaded || !window.Razorpay) {
            setPayStatus('idle');
            return resolve({ success: false, error: 'Could not load the payment window. Check your connection and try again.' });
          }

          const razorpay = new window.Razorpay({
            key: orderData.keyId,
            amount: orderData.amount,
            currency: orderData.currency,
            order_id: orderData.orderId,
            name: 'Bhavan',
            description: `Stay - ${input.checkIn} to ${input.checkOut}`,
            prefill: {
              name: orderData.tenantName,
              email: orderData.tenantEmail,
            },
            theme: { color: '#f59e0b' },
            handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
              setPayStatus('verifying');
              const { data: verifyData, error: verifyError } = await supabase.functions.invoke('verify-booking-payment', {
                body: {
                  bookingId: orderData.bookingId,
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                },
              });
              setPayStatus('idle');
              if (verifyError || !verifyData?.success) {
                return resolve({
                  success: false,
                  error:
                    (await functionErrorMessage(verifyError)) ||
                    'We could not confirm this payment. If money was deducted it will reconcile shortly - contact support if it does not.',
                });
              }
              resolve({ success: true, error: null });
            },
            modal: {
              ondismiss: () => {
                setPayStatus('idle');
                resolve({ success: false, error: null });
              },
            },
          });
          razorpay.open();
        })();
      }),
    []
  );

  return { book, payStatus };
}

export type VacationBookingStatus = 'awaiting_payment' | 'pending' | 'confirmed' | 'declined' | 'cancelled' | 'no_show';

export interface VacationBookingRow extends Tables<'vacation_bookings'> {
  listing?: {
    title: string | null;
    location: string | null;
    images: string[] | null;
  } | null;
  tenant?: {
    name: string | null;
    avatar_url: string | null;
    verified_aadhaar: boolean | null;
    created_at: string | null;
  } | null;
  owner?: {
    name: string | null;
    avatar_url: string | null;
    verified_aadhaar: boolean | null;
  } | null;
}

function useBookingsQuery(userId: string | undefined, column: 'tenant_id' | 'owner_id', select: string) {
  const [bookings, setBookings] = useState<VacationBookingRow[]>([]);
  const [loading, setLoading] = useState(true);

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
      .from('vacation_bookings')
      .select(select)
      .eq(column, userId)
      // awaiting_payment rows are abandoned checkouts, not bookings.
      .neq('status', 'awaiting_payment')
      .order('created_at', { ascending: false });
    if (error) {
      console.warn('Supabase vacation_bookings fetch error:', error.message);
      setBookings([]);
    } else {
      setBookings((data ?? []) as unknown as VacationBookingRow[]);
    }
    setLoading(false);
  }, [userId, column, select]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { bookings, loading, refresh };
}

// The guest's own bookings, newest first, with the host attached so the
// booking card can open their profile.
export function useTenantBookings(userId: string | undefined) {
  return useBookingsQuery(
    userId,
    'tenant_id',
    '*, listing:listings(title, location, images), owner:users_public!vacation_bookings_owner_id_fkey(name, avatar_url, verified_aadhaar)'
  );
}

// Requests on the host's listings. users_public carries the guest's
// verification badges so the host can screen who they confirm.
export function useOwnerBookings(userId: string | undefined) {
  return useBookingsQuery(
    userId,
    'owner_id',
    '*, listing:listings(title, location, images), tenant:users_public!vacation_bookings_tenant_id_fkey(name, avatar_url, verified_aadhaar, created_at)'
  );
}

export type OwnerBookingAction = 'confirm' | 'decline' | 'cancel' | 'no_show';

// All status changes go through edge functions: three of the four
// actions move money (refunds), and confirming refunds the losing
// overlapping requests. There is deliberately no client-side write path.
//
// On confirm the server also reports how the overlapping requests fared:
// `declinedOverlapping` were refunded, `refundFailures` could not be
// refunded and remain pending-and-paid for a retry. The caller surfaces
// the failure count so the host isn't told "all refunded" when some
// weren't.
export async function respondToBooking(
  bookingId: string,
  action: OwnerBookingAction
): Promise<{ error: string | null; declinedOverlapping: number; refundFailures: number }> {
  const supabase = getSupabase();
  if (!supabase) return { error: 'Not available right now.', declinedOverlapping: 0, refundFailures: 0 };
  const { data, error } = await supabase.functions.invoke('respond-booking', {
    body: { bookingId, action },
  });
  if (error || !data?.success) {
    return {
      error: (await functionErrorMessage(error)) || 'Could not update this booking. Please try again.',
      declinedOverlapping: 0,
      refundFailures: 0,
    };
  }
  return {
    error: null,
    declinedOverlapping: Number(data.declinedOverlapping ?? 0),
    refundFailures: Number(data.refundFailures ?? 0),
  };
}

export async function cancelBooking(
  bookingId: string
): Promise<{ refunded: boolean; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { refunded: false, error: 'Not available right now.' };
  const { data, error } = await supabase.functions.invoke('cancel-booking', {
    body: { bookingId },
  });
  if (error || !data?.success) {
    return { refunded: false, error: (await functionErrorMessage(error)) || 'Could not cancel this booking. Please try again.' };
  }
  return { refunded: Boolean(data.refunded), error: null };
}

// Full refund while a request is unconfirmed; for confirmed stays, until
// 24 hours before check-in (midnight IST). Mirrors cancel-booking's rule
// so the UI never promises a refund the server will refuse.
export function isRefundEligible(booking: Pick<VacationBookingRow, 'status' | 'payment_status' | 'check_in'>): boolean {
  if (booking.payment_status !== 'paid') return false;
  if (booking.status === 'pending') return true;
  if (booking.status !== 'confirmed') return false;
  return new Date(`${booking.check_in}T00:00:00+05:30`).getTime() - Date.now() > 24 * 60 * 60 * 1000;
}

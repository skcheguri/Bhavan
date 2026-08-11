import { useState } from 'react';
import { Link } from 'react-router';
import {
  useTenantBookings,
  cancelBooking,
  isRefundEligible,
  type VacationBookingRow,
} from '@/hooks/useVacationBookings';
import { ConfirmInline } from '@/components/feature/ConfirmInline';
import UserProfileModal from '@/components/feature/UserProfileModal';
import { useToast } from '@/hooks/useToast';

interface BookingsTabProps {
  tenantId: string | undefined;
  /** Opens the Messages tab on the chat thread for this host+listing. */
  onMessageHost?: (ownerId: string, listingId: string) => void;
}

const STATUS_CHIP: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Waiting for host', cls: 'bg-amber-50 text-amber-600' },
  confirmed: { label: 'Confirmed', cls: 'bg-emerald-50 text-emerald-600' },
  declined: { label: 'Declined — refunded', cls: 'bg-lightgray text-charcoal/50' },
  cancelled: { label: 'Cancelled', cls: 'bg-lightgray text-charcoal/50' },
  no_show: { label: 'Marked no-show', cls: 'bg-red-50 text-red-500' },
};

function formatDate(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// The guest's paid stay requests. Cancelling routes through the
// cancel-booking edge function, which applies the refund policy: full
// refund while unconfirmed, and for confirmed stays until 24 hours
// before check-in.
export default function BookingsTab({ tenantId, onMessageHost }: BookingsTabProps) {
  const { bookings, loading, refresh } = useTenantBookings(tenantId);
  const { addToast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);

  const handleCancel = async (b: VacationBookingRow) => {
    setBusyId(b.id);
    setConfirmingId(null);
    const { refunded, error } = await cancelBooking(b.id);
    setBusyId(null);
    if (error) {
      addToast(error, 'error');
    } else {
      addToast(refunded ? 'Booking cancelled — your payment is being refunded in full.' : 'Booking cancelled.', 'success');
      await refresh();
    }
  };

  const renderCard = (b: VacationBookingRow) => {
    const chip = STATUS_CHIP[b.status ?? ''] ?? { label: b.status ?? '', cls: 'bg-lightgray text-charcoal/50' };
    const cancellable = b.status === 'pending' || (b.status === 'confirmed' && new Date(b.check_in + 'T00:00:00') > new Date());
    const refundable = isRefundEligible(b);
    const isBusy = busyId === b.id;
    const cover = b.listing?.images?.[0];
    return (
      <div key={b.id} className="bg-white rounded-2xl border border-black/5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-14 h-11 rounded-xl bg-lightgray flex-shrink-0 overflow-hidden">
              {cover ? (
                <img src={cover} alt={b.listing?.title ?? 'Property'} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center"><i className="ri-home-4-line text-charcoal/30" /></div>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-charcoal truncate">{b.listing?.title ?? 'Property'}</p>
              <p className="text-xs text-charcoal/50 truncate">
                {b.listing?.location ?? ''} · {b.guest_count} guest{b.guest_count > 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${chip.cls}`}>{chip.label}</span>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-charcoal/60">
          <span className="flex items-center gap-1"><i className="ri-calendar-line" /> {formatDate(b.check_in)} → {formatDate(b.check_out)}</span>
          <span className="flex items-center gap-1 font-semibold text-charcoal">
            <i className="ri-money-rupee-circle-line" /> ₹{b.total_price.toLocaleString('en-IN')}
            {b.payment_status === 'paid' && <span className="text-emerald-600 font-semibold ml-1">· Paid</span>}
            {b.payment_status === 'refunded' && <span className="text-charcoal/40 font-normal ml-1">· Refunded</span>}
          </span>
          {b.owner?.name && (
            <button
              type="button"
              onClick={() => setProfileUserId(b.owner_id)}
              className="flex items-center gap-1 text-charcoal/60 hover:text-brand transition-colors cursor-pointer"
            >
              <i className="ri-user-3-line" /> Host: {b.owner.name}
              {b.owner.verified_aadhaar && <i className="ri-shield-check-fill text-green-500" />}
            </button>
          )}
        </div>

        {b.status === 'confirmed' && b.payment_status === 'paid' && (
          <p className="mt-2 text-[11px] text-charcoal/40">
            {refundable
              ? 'Free cancellation until 24 hours before check-in.'
              : 'Check-in is under 24 hours away — cancelling now forfeits the payment.'}
          </p>
        )}

        {confirmingId === b.id ? (
          <div className="mt-4">
            <ConfirmInline
              message={
                refundable
                  ? `Cancel this ${b.status === 'pending' ? 'request' : 'stay'}? Your ₹${b.total_price.toLocaleString('en-IN')} payment is refunded in full.`
                  : `Cancel this stay? Check-in is under 24 hours away, so your ₹${b.total_price.toLocaleString('en-IN')} payment will NOT be refunded.`
              }
              confirmLabel={refundable ? 'Cancel & refund' : 'Cancel anyway'}
              busy={isBusy}
              onConfirm={() => handleCancel(b)}
              onCancel={() => setConfirmingId(null)}
            />
          </div>
        ) : (
          (cancellable || b.status === 'confirmed') && (
            <div className="mt-4 flex flex-wrap gap-2">
              {b.status === 'confirmed' && onMessageHost && (
                <button
                  onClick={() => onMessageHost(b.owner_id, b.listing_id)}
                  className="flex items-center gap-1.5 bg-brand text-white text-xs font-semibold px-4 py-2 rounded-full hover:bg-brand-dark transition-colors cursor-pointer"
                >
                  <i className="ri-chat-3-line" /> Message host
                </button>
              )}
              {cancellable && (
                <button
                  onClick={() => setConfirmingId(b.id)}
                  disabled={isBusy}
                  className="flex items-center gap-1.5 bg-white border border-black/10 text-charcoal/70 text-xs font-semibold px-4 py-2 rounded-full hover:border-red-200 hover:text-red-600 transition-colors cursor-pointer disabled:opacity-40"
                >
                  {isBusy ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-close-circle-line" />} Cancel {b.status === 'pending' ? 'request' : 'stay'}
                </button>
              )}
            </div>
          )
        )}
      </div>
    );
  };

  const active = bookings.filter((b) => b.status === 'pending' || b.status === 'confirmed');
  const past = bookings.filter((b) => b.status !== 'pending' && b.status !== 'confirmed');

  return (
    <div className="space-y-6">
      {loading ? (
        <div className="bg-white rounded-2xl border border-black/5 p-10 text-center text-sm text-charcoal/40">Loading bookings…</div>
      ) : bookings.length === 0 ? (
        <div className="bg-white rounded-2xl border border-black/5 p-10 text-center">
          <div className="w-14 h-14 rounded-full bg-lightgray flex items-center justify-center mx-auto">
            <i className="ri-suitcase-line text-charcoal/30 text-2xl" />
          </div>
          <p className="mt-4 text-charcoal/60 text-sm">No stays booked yet.</p>
          <Link to="/listings?category=vacation" className="inline-block mt-3 text-sm text-brand font-semibold hover:text-brand-dark">
            Browse vacation rentals
          </Link>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-charcoal">Upcoming &amp; pending</h3>
              {active.map(renderCard)}
            </div>
          )}
          {past.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-charcoal">Past &amp; closed</h3>
              {past.map(renderCard)}
            </div>
          )}
        </>
      )}

      {profileUserId && (
        <UserProfileModal
          userId={profileUserId}
          roleLabel="Host"
          canReview={false}
          onClose={() => setProfileUserId(null)}
        />
      )}
    </div>
  );
}

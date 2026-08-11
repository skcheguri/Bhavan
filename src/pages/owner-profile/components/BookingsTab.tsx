import { useState } from 'react';
import {
  useOwnerBookings,
  respondToBooking,
  type OwnerBookingAction,
  type VacationBookingRow,
} from '@/hooks/useVacationBookings';
import { ConfirmInline } from '@/components/feature/ConfirmInline';
import UserProfileModal from '@/components/feature/UserProfileModal';
import { hostPayoutAmount } from '@/hooks/useHostPayouts';
import { useToast } from '@/hooks/useToast';

interface BookingsTabProps {
  ownerId: string | undefined;
  /**
   * Opens the Messages tab on the chat thread for this guest+listing.
   * The thread exists from the moment a booking is confirmed (migration
   * 127 guarantees an approved connection request behind it).
   */
  onMessageGuest?: (tenantId: string, listingId: string) => void;
}

const STATUS_CHIP: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Awaiting your response', cls: 'bg-amber-50 text-amber-600' },
  confirmed: { label: 'Confirmed', cls: 'bg-emerald-50 text-emerald-600' },
  declined: { label: 'Declined — refunded', cls: 'bg-lightgray text-charcoal/50' },
  cancelled: { label: 'Cancelled', cls: 'bg-lightgray text-charcoal/50' },
  no_show: { label: 'No-show', cls: 'bg-red-50 text-red-500' },
};

function formatDate(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function nights(b: VacationBookingRow): number {
  return Math.max(1, Math.round((new Date(b.check_out).getTime() - new Date(b.check_in).getTime()) / 86_400_000));
}

// The host's side of vacation bookings. Guests have already PAID when a
// request lands here, so every action routes through respond-booking:
// decline and cancel trigger automatic full refunds, and confirming one
// request declines-and-refunds the overlapping ones.
export default function BookingsTab({ ownerId, onMessageGuest }: BookingsTabProps) {
  const { bookings, loading, refresh } = useOwnerBookings(ownerId);
  const { addToast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  // Confirm-before-acting for the destructive/irreversible ones.
  const [confirming, setConfirming] = useState<{ id: string; action: OwnerBookingAction } | null>(null);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);

  const act = async (bookingId: string, action: OwnerBookingAction) => {
    setBusyId(bookingId);
    setConfirming(null);
    const { error } = await respondToBooking(bookingId, action);
    setBusyId(null);
    if (error) {
      addToast(error, 'error');
    } else {
      addToast(
        action === 'confirm'
          ? 'Booking confirmed. Overlapping requests were declined and refunded.'
          : action === 'decline'
            ? 'Request declined. The guest gets a full refund.'
            : action === 'cancel'
              ? 'Booking cancelled. The guest gets a full refund.'
              : 'Marked as no-show.',
        'success'
      );
      await refresh();
    }
  };

  const upcoming = bookings.filter((b) => b.status === 'pending' || b.status === 'confirmed');
  const past = bookings.filter((b) => b.status !== 'pending' && b.status !== 'confirmed');

  const renderCard = (b: VacationBookingRow) => {
    const chip = STATUS_CHIP[b.status ?? ''] ?? { label: b.status ?? '', cls: 'bg-lightgray text-charcoal/50' };
    const checkInPassed = new Date(b.check_in + 'T00:00:00') <= new Date();
    const isBusy = busyId === b.id;
    return (
      <div key={b.id} className="bg-white rounded-2xl border border-black/5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <button
            type="button"
            onClick={() => setProfileUserId(b.tenant_id)}
            className="flex items-center gap-3 min-w-0 text-left cursor-pointer group"
          >
            <div className="w-11 h-11 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
              {b.tenant?.avatar_url ? (
                <img src={b.tenant.avatar_url} alt={b.tenant?.name ?? 'Guest'} className="w-full h-full object-cover" />
              ) : (
                <span className="text-sm font-bold text-amber-600">{(b.tenant?.name ?? 'G')[0]}</span>
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-charcoal truncate group-hover:text-brand transition-colors">{b.tenant?.name ?? 'Guest'}</p>
                {b.tenant?.verified_aadhaar && (
                  <span className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-50 text-green-600">
                    <i className="ri-shield-check-fill" /> Aadhaar Verified
                  </span>
                )}
              </div>
              <p className="text-xs text-charcoal/50 truncate">
                {b.listing?.title ?? 'Listing'} · {b.guest_count} guest{b.guest_count > 1 ? 's' : ''}
                {b.tenant?.created_at && (
                  <> · member since {new Date(b.tenant.created_at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</>
                )}
              </p>
            </div>
          </button>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${chip.cls}`}>{chip.label}</span>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-charcoal/60">
          <span className="flex items-center gap-1"><i className="ri-calendar-line" /> {formatDate(b.check_in)} → {formatDate(b.check_out)} ({nights(b)} night{nights(b) > 1 ? 's' : ''})</span>
          <span className="flex items-center gap-1 font-semibold text-charcoal">
            <i className="ri-money-rupee-circle-line" /> ₹{b.total_price.toLocaleString('en-IN')}
            {b.payment_status === 'paid' && <span className="text-emerald-600 font-semibold ml-1">· Paid</span>}
            {b.payment_status === 'refunded' && <span className="text-charcoal/40 font-normal ml-1">· Refunded</span>}
          </span>
        </div>

        {/* Payout transparency: the host always knows where their money
            is. The platform retains the 5% fee; the nightly total is
            theirs once the stay completes or the guest no-shows.
            Late-cancel forfeits default to the platform and are decided
            case by case, so a cancelled booking shows a payout line only
            if an admin actually released it. */}
        {b.payment_status === 'paid' &&
          (['confirmed', 'no_show'].includes(b.status ?? '') ||
            (b.status === 'cancelled' && b.payout_status === 'paid')) && (
          <p className="mt-2 text-[11px] flex items-center gap-1.5">
            {b.payout_status === 'paid' ? (
              <>
                <i className="ri-checkbox-circle-fill text-emerald-500" />
                <span className="text-emerald-600 font-semibold">
                  Payout of ₹{hostPayoutAmount(b).toLocaleString('en-IN')} sent
                  {b.payout_at && <> on {new Date(b.payout_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</>}
                  {b.payout_reference && <span className="font-normal text-charcoal/40"> · ref {b.payout_reference}</span>}
                </span>
              </>
            ) : b.status === 'confirmed' && new Date(b.check_out + 'T00:00:00') > new Date() ? (
              <>
                <i className="ri-time-line text-charcoal/40" />
                <span className="text-charcoal/50">₹{hostPayoutAmount(b).toLocaleString('en-IN')} payout to your account after check-out</span>
              </>
            ) : (
              <>
                <i className="ri-loader-4-line text-amber-500" />
                <span className="text-amber-600 font-semibold">Payout of ₹{hostPayoutAmount(b).toLocaleString('en-IN')} on the way to your account</span>
              </>
            )}
          </p>
        )}

        {confirming?.id === b.id ? (
          <div className="mt-4">
            <ConfirmInline
              message={
                confirming.action === 'decline'
                  ? `Decline ${b.tenant?.name ?? 'this guest'}'s request? Their ₹${b.total_price.toLocaleString('en-IN')} payment is refunded in full.`
                  : confirming.action === 'cancel'
                    ? `Cancel this confirmed stay? The guest is refunded in full, however close to check-in this is.`
                    : `Mark this stay as a no-show? The guest is notified; their payment is not refunded.`
              }
              confirmLabel={confirming.action === 'decline' ? 'Decline & refund' : confirming.action === 'cancel' ? 'Cancel & refund' : 'Mark no-show'}
              busy={isBusy}
              onConfirm={() => act(b.id, confirming.action)}
              onCancel={() => setConfirming(null)}
            />
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            {b.status === 'pending' && (
              <>
                <button
                  onClick={() => act(b.id, 'confirm')}
                  disabled={isBusy}
                  className="flex items-center gap-1.5 bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-full hover:bg-emerald-600 transition-colors cursor-pointer disabled:opacity-40"
                >
                  {isBusy ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-check-line" />} Confirm stay
                </button>
                <button
                  onClick={() => setConfirming({ id: b.id, action: 'decline' })}
                  disabled={isBusy}
                  className="flex items-center gap-1.5 bg-white border border-black/10 text-charcoal/70 text-xs font-semibold px-4 py-2 rounded-full hover:border-red-200 hover:text-red-600 transition-colors cursor-pointer disabled:opacity-40"
                >
                  <i className="ri-close-line" /> Decline
                </button>
              </>
            )}
            {b.status === 'confirmed' && onMessageGuest && (
              <button
                onClick={() => onMessageGuest(b.tenant_id, b.listing_id)}
                className="flex items-center gap-1.5 bg-brand text-white text-xs font-semibold px-4 py-2 rounded-full hover:bg-brand-dark transition-colors cursor-pointer"
              >
                <i className="ri-chat-3-line" /> Message guest
              </button>
            )}
            {b.status === 'confirmed' && !checkInPassed && (
              <button
                onClick={() => setConfirming({ id: b.id, action: 'cancel' })}
                disabled={isBusy}
                className="flex items-center gap-1.5 bg-white border border-black/10 text-charcoal/70 text-xs font-semibold px-4 py-2 rounded-full hover:border-red-200 hover:text-red-600 transition-colors cursor-pointer disabled:opacity-40"
              >
                <i className="ri-close-circle-line" /> Cancel stay
              </button>
            )}
            {b.status === 'confirmed' && checkInPassed && (
              <button
                onClick={() => setConfirming({ id: b.id, action: 'no_show' })}
                disabled={isBusy}
                className="flex items-center gap-1.5 bg-white border border-black/10 text-charcoal/70 text-xs font-semibold px-4 py-2 rounded-full hover:border-red-200 hover:text-red-600 transition-colors cursor-pointer disabled:opacity-40"
              >
                <i className="ri-user-unfollow-line" /> Guest didn&apos;t arrive
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-2 text-xs text-charcoal/60 bg-lightgray rounded-xl px-4 py-3">
        <i className="ri-information-line text-charcoal/40 mt-px" />
        <span>
          Guests pay upfront when they request a stay. Confirming one request automatically declines and refunds
          any overlapping ones; declining always refunds in full.
        </span>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-black/5 p-10 text-center text-sm text-charcoal/40">Loading bookings…</div>
      ) : bookings.length === 0 ? (
        <div className="bg-white rounded-2xl border border-black/5 p-10 text-center">
          <div className="w-14 h-14 rounded-full bg-lightgray flex items-center justify-center mx-auto">
            <i className="ri-calendar-2-line text-charcoal/30 text-2xl" />
          </div>
          <p className="mt-4 text-charcoal/60 text-sm">No booking requests yet.</p>
          <p className="mt-1 text-charcoal/40 text-xs">Requests for your vacation listings appear here the moment a guest pays.</p>
        </div>
      ) : (
        <>
          {upcoming.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-charcoal">Needs attention &amp; upcoming</h3>
              {upcoming.map(renderCard)}
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
          roleLabel="Guest"
          canReview={false}
          onClose={() => setProfileUserId(null)}
        />
      )}
    </div>
  );
}

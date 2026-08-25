import { useState } from 'react';
import { Link } from 'react-router';
import { useAdminDuePayouts, hostPayoutAmount, isForfeitDecision } from '@/hooks/useHostPayouts';
import { useToast } from '@/hooks/useToast';

// The manual half of host payouts, stage 1: every booking whose money
// the platform has retained and not yet forwarded, next to the host's
// registered payout account. Execute the transfer in the bank /
// Razorpay dashboard, then mark it paid here -- that stamps the
// reference on the booking and notifies the host.
export default function AdminPayouts() {
  const { payouts, accounts, loading, error, refresh, markPaid, withhold } = useAdminDuePayouts();
  const { addToast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [referenceById, setReferenceById] = useState<Record<string, string>>({});

  const handleMarkPaid = async (bookingId: string, isForfeit: boolean) => {
    setBusyId(bookingId);
    const { error } = await markPaid(bookingId, referenceById[bookingId] ?? '');
    setBusyId(null);
    if (error) {
      addToast(error, 'error');
    } else {
      addToast(isForfeit ? 'Forfeit released to the host — they have been notified.' : 'Payout recorded — the host has been notified.', 'success');
    }
  };

  const handleWithhold = async (bookingId: string) => {
    setBusyId(bookingId);
    const { error } = await withhold(bookingId);
    setBusyId(null);
    if (error) {
      addToast(error, 'error');
    } else {
      addToast('Forfeit kept by the platform.', 'success');
    }
  };

  // Forfeits are decisions, not debts -- keep them out of the owed sum.
  const totalDue = payouts.filter((p) => !isForfeitDecision(p)).reduce((sum, p) => sum + hostPayoutAmount(p), 0);

  return (
    <div className="min-h-screen bg-offwhite pb-16">
      <div className="max-w-5xl mx-auto px-4 md:px-8 pt-8">
        <div className="mb-6">
          <Link to="/admin" className="text-sm text-charcoal/40 hover:text-brand transition-colors">
            <i className="ri-arrow-left-line mr-1" />Admin Dashboard
          </Link>
          <div className="flex items-center justify-between gap-4 mt-2">
            <h1 className="text-2xl font-bold text-charcoal">Host Payouts</h1>
            {payouts.length > 0 && (
              <span className="text-sm font-semibold text-charcoal bg-amber-50 border border-amber-200 rounded-full px-4 py-1.5">
                ₹{totalDue.toLocaleString('en-IN')} due across {payouts.length} booking{payouts.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <p className="text-sm text-charcoal/60 mt-1">
            Completed stays and no-shows are owed to the host: transfer the amount to the account shown, then mark
            paid. Late-cancel forfeits default to the platform — release or keep each one based on the call with
            the host.
          </p>
        </div>

        {loading ? (
          <div className="bg-white rounded-2xl border border-black/5 p-10 text-center text-sm text-charcoal/40">Loading…</div>
        ) : error ? (
          <div className="bg-white rounded-2xl border border-red-200 p-10 text-center">
            <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto">
              <i className="ri-error-warning-line text-red-500 text-2xl" />
            </div>
            <p className="mt-4 text-charcoal/80 text-sm font-semibold">Couldn't load the payouts queue.</p>
            <p className="mt-1 text-charcoal/50 text-xs">{error}</p>
            <button
              onClick={() => void refresh()}
              className="mt-4 px-4 py-2 rounded-full text-xs font-semibold bg-charcoal text-white hover:bg-black transition-colors cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : payouts.length === 0 ? (
          <div className="bg-white rounded-2xl border border-black/5 p-10 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mx-auto">
              <i className="ri-checkbox-circle-line text-emerald-500 text-2xl" />
            </div>
            <p className="mt-4 text-charcoal/60 text-sm">No payouts due. Every host has been paid.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {payouts.map((p) => {
              const account = accounts[p.owner_id];
              const isBusy = busyId === p.id;
              const isForfeit = isForfeitDecision(p);
              return (
                <div key={p.id} className={`bg-white rounded-2xl border p-5 ${isForfeit ? 'border-amber-200' : 'border-black/5'}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-charcoal">
                        {p.owner?.name ?? 'Host'} — ₹{hostPayoutAmount(p).toLocaleString('en-IN')}
                        {isForfeit && (
                          <span className="ml-2 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 align-middle">
                            Forfeit — your call
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-charcoal/50 mt-0.5">
                        {p.listing?.title ?? 'Listing'} · {p.check_in} → {p.check_out} ·{' '}
                        {p.status === 'confirmed' ? 'stay completed' : p.status === 'no_show' ? 'guest no-show' : 'guest forfeited (cancelled inside 24h)'}
                      </p>
                      <p className="text-xs text-charcoal/40 mt-0.5">
                        Guest paid ₹{p.total_price.toLocaleString('en-IN')} · platform fee ₹{(p.service_fee ?? 0).toLocaleString('en-IN')}
                      </p>
                    </div>
                    <div className="text-right">
                      {account ? (
                        <div className="text-xs bg-offwhite rounded-xl px-3 py-2">
                          <p className="font-semibold text-charcoal">{account.method === 'upi' ? 'UPI' : 'Bank'}</p>
                          <p className="text-charcoal/60">
                            {account.method === 'upi'
                              ? account.upi_id
                              : `${account.account_holder} · ${account.account_number} · ${account.ifsc}`}
                          </p>
                        </div>
                      ) : (
                        <span className="text-xs font-semibold text-red-500 bg-red-50 rounded-full px-3 py-1.5">
                          No payout account on file
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      value={referenceById[p.id] ?? ''}
                      onChange={(e) => setReferenceById((prev) => ({ ...prev, [p.id]: e.target.value }))}
                      placeholder="Transfer reference / UTR (optional)"
                      className="flex-1 min-w-[220px] px-4 py-2 bg-offwhite rounded-full text-xs focus:outline-none focus:ring-2 focus:ring-amber-300"
                    />
                    <button
                      onClick={() => handleMarkPaid(p.id, isForfeit)}
                      disabled={isBusy}
                      className="flex items-center gap-1.5 bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-full hover:bg-emerald-600 transition-colors cursor-pointer disabled:opacity-40"
                    >
                      {isBusy ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-check-line" />}
                      {isForfeit ? 'Release to host' : 'Mark paid & notify host'}
                    </button>
                    {isForfeit && (
                      <button
                        onClick={() => handleWithhold(p.id)}
                        disabled={isBusy}
                        className="flex items-center gap-1.5 bg-white border border-black/10 text-charcoal/70 text-xs font-semibold px-4 py-2 rounded-full hover:border-amber-300 hover:text-amber-700 transition-colors cursor-pointer disabled:opacity-40"
                      >
                        <i className="ri-safe-2-line" /> Keep for platform
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

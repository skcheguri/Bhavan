import { useDismissableLayer } from '@/hooks/useDismissableLayer';
import { useCallback, useEffect, useState } from 'react';
import { getSupabase, functionErrorMessage } from '@/lib/supabase';
import { rentUnitLabel } from '@/lib/listingPricing';
import { useBrokerReport } from '@/hooks/useBrokerReport';
import { useSubjectReviews } from '@/hooks/useReviews';
import { useToast } from '@/hooks/useToast';
import { ConfirmInline } from '@/components/feature/ConfirmInline';
import type { AdminUserRow } from '@/hooks/useAdminUsers';

interface RefundablePayment {
  kind: 'pro' | 'rent';
  id: string;
  label: string;
  sublabel: string;
  amountPaise: number;
  status: string;
  refundable: boolean;
}

// A user's Razorpay payments the admin can refund: Pro/society invoices
// (billing_history) and rent paid through Razorpay. Cash/offline rent has
// no Razorpay reference and so can't be refunded here.
function useUserPayments(userId: string) {
  const [payments, setPayments] = useState<RefundablePayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const [{ data: invoices, error: invoicesError }, { data: rents, error: rentsError }] = await Promise.all([
      supabase
        .from('billing_history')
        .select('id, plan, total_amount, status, razorpay_payment_id, created_at')
        .eq('owner_id', userId)
        .in('status', ['paid', 'refunded'])
        .order('created_at', { ascending: false }),
      supabase
        .from('rent_payments')
        .select('id, amount, month, status, razorpay_payment_id, payment_mode, created_at')
        .or(`owner_id.eq.${userId},tenant_id.eq.${userId}`)
        .in('status', ['paid', 'refunded'])
        .order('created_at', { ascending: false }),
    ]);

    // A failed fetch must not read as "no payments on file" -- that would
    // hide refundable payments behind a reassuring empty state.
    if (invoicesError || rentsError) {
      console.warn('Supabase user payments fetch error:', (invoicesError ?? rentsError)?.message);
      setError((invoicesError ?? rentsError)?.message ?? 'Failed to load payments');
      setPayments([]);
      setLoading(false);
      return;
    }
    setError(null);

    const rows: RefundablePayment[] = [];
    for (const inv of (invoices ?? []) as Record<string, unknown>[]) {
      rows.push({
        kind: 'pro',
        id: String(inv.id),
        label: inv.plan === 'pro_annual' ? 'Pro Annual' : inv.plan === 'pro_monthly' ? 'Pro Monthly' : String(inv.plan),
        sublabel: new Date(String(inv.created_at)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
        amountPaise: Number(inv.total_amount ?? 0),
        status: String(inv.status),
        refundable: inv.status === 'paid' && Boolean(inv.razorpay_payment_id),
      });
    }
    for (const rp of (rents ?? []) as Record<string, unknown>[]) {
      rows.push({
        kind: 'rent',
        id: String(rp.id),
        label: `Rent · ${String(rp.month)}`,
        sublabel: rp.payment_mode === 'razorpay' ? 'Razorpay' : String(rp.payment_mode),
        amountPaise: Number(rp.amount ?? 0),
        status: String(rp.status),
        refundable: rp.status === 'paid' && rp.payment_mode === 'razorpay' && Boolean(rp.razorpay_payment_id),
      });
    }
    setPayments(rows);
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);
  return { payments, loading, error, refresh: load };
}

interface OwnerListingRow {
  id: string;
  title: string;
  status: string;
  verified: boolean;
  price: number;
  category: string | null;
}

const reasonLabels: Record<string, string> = {
  broker_agent: 'Broker / Agent',
  asked_commission: 'Asked Commission',
  shared_competing_listing: 'Shared Competing Listing',
  refused_identity: 'Refused Identity',
  other: 'Other',
};

const listingStatusBadge: Record<string, string> = {
  active: 'bg-green-50 text-green-600',
  inactive: 'bg-lightgray text-charcoal/60',
  draft: 'bg-amber-50 text-amber-600',
};

function useOwnerListings(ownerId: string | undefined) {
  const [listings, setListings] = useState<OwnerListingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ownerId) {
      setLoading(false);
      return;
    }
    const supabase = getSupabase();
    if (!supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error: dbError } = await supabase
      .from('listings')
      .select('id, title, status, verified, price, category')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false });
    // Don't let an RLS/network failure render as "no listings posted".
    if (dbError) {
      console.warn('Supabase owner listings fetch error:', dbError.message);
      setError(dbError.message);
      setListings([]);
      setLoading(false);
      return;
    }
    setError(null);
    setListings((data as OwnerListingRow[]) ?? []);
    setLoading(false);
  }, [ownerId]);

  useEffect(() => { load(); }, [load]);

  return { listings, loading, error, refresh: load };
}

interface AdminUserDetailModalProps {
  user: AdminUserRow;
  onClose: () => void;
  onSuspend: (reason: string) => Promise<void>;
  onReactivate: () => Promise<void>;
  busy: boolean;
}

export default function AdminUserDetailModal({ user, onClose, onSuspend, onReactivate, busy }: AdminUserDetailModalProps) {
  useDismissableLayer(onClose);
  const { addToast } = useToast();
  const [reasonDraft, setReasonDraft] = useState('');

  const brokerStatus = useBrokerReport(user.role === 'tenant' ? user.id : undefined);
  const { listings: ownerListings, loading: listingsLoading, error: listingsError, refresh: refreshOwnerListings } = useOwnerListings(user.role === 'owner' ? user.id : undefined);
  const { reviews, loading: reviewsLoading } = useSubjectReviews(user.id);
  const { payments, loading: paymentsLoading, error: paymentsError, refresh: refreshPayments } = useUserPayments(user.id);
  const [refundingId, setRefundingId] = useState<string | null>(null);
  const [confirmingRefund, setConfirmingRefund] = useState<RefundablePayment | null>(null);

  const doRefund = async (p: RefundablePayment) => {
    const supabase = getSupabase();
    if (!supabase) return;
    setRefundingId(p.id);
    setConfirmingRefund(null);
    const { data, error } = await supabase.functions.invoke('refund-payment', {
      body: { kind: p.kind, id: p.id },
    });
    setRefundingId(null);
    if (error || !data?.success) {
      addToast((await functionErrorMessage(error)) || data?.error || 'Refund failed.', 'error');
    } else {
      addToast('Refund issued. The user has been notified.', 'success');
      await refreshPayments();
    }
  };

  const avgRating = reviews.length > 0 ? reviews.reduce((s, r) => s + r.overall_rating, 0) / reviews.length : 0;
  const initials = user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="p-6 border-b border-black/5 flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-100 flex items-center justify-center flex-shrink-0">
              <span className="text-lg font-bold text-amber-600">{initials}</span>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-charcoal">{user.name}</h2>
                {user.suspended && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-600">Suspended</span>
                )}
                {!user.verifiedEmail && (
                  <span
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-lightgray text-charcoal/50"
                    title="Never confirmed their email -- likely an abandoned or unreachable signup"
                  >
                    Unconfirmed
                  </span>
                )}
                {user.verifiedAadhaar && (
                  <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-600">
                    <i className="ri-shield-check-fill text-xs" /> Aadhaar
                  </span>
                )}
              </div>
              <p className="text-xs text-charcoal/60 mt-0.5 capitalize">{user.role}</p>
              <p className="text-xs text-charcoal/40 mt-0.5">
                Member since {user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : 'unknown'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-lightgray transition-colors cursor-pointer flex-shrink-0">
            <i className="ri-close-line text-charcoal/60" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Contact */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-charcoal/70 bg-offwhite rounded-xl p-4">
            <p className="flex items-center gap-1.5"><i className="ri-mail-line text-charcoal/40" /> {user.email || 'No email on file'}</p>
            <p className="flex items-center gap-1.5"><i className="ri-phone-line text-charcoal/40" /> {user.phone || 'No phone on file'}</p>
          </div>

          {user.suspended && user.suspendedReason && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-4">
              <p className="text-xs font-semibold text-red-700">Suspension reason</p>
              <p className="text-xs text-red-600 mt-0.5">{user.suspendedReason}</p>
            </div>
          )}

          {/* Trust & Safety: role-specific */}
          {user.role === 'tenant' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-charcoal">Broker Reports Filed Against This Tenant</h3>
                {brokerStatus.isSoftBlocked && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-600">Soft-Blocked</span>
                )}
              </div>
              {brokerStatus.loading ? (
                <p className="text-xs text-charcoal/40">Loading…</p>
              ) : brokerStatus.reports.length === 0 ? (
                <p className="text-xs text-charcoal/40">No broker reports filed against this tenant.</p>
              ) : (
                <div className="space-y-2">
                  {brokerStatus.reports.map((r) => (
                    <div key={r.id} className="border border-black/5 rounded-xl p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-charcoal">{reasonLabels[r.reason] ?? r.reason}</span>
                        <span className="text-[10px] text-charcoal/40">{new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                      </div>
                      {r.reason_text && <p className="text-xs text-charcoal/60 mt-1">{r.reason_text}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {user.role === 'owner' && (
            <div>
              <h3 className="text-sm font-bold text-charcoal mb-2">Listings Posted</h3>
              {listingsLoading ? (
                <p className="text-xs text-charcoal/40">Loading…</p>
              ) : listingsError ? (
                <p className="text-xs text-red-500">
                  Couldn&apos;t load listings.{' '}
                  <button onClick={() => void refreshOwnerListings()} className="font-semibold underline cursor-pointer">Retry</button>
                </p>
              ) : ownerListings.length === 0 ? (
                <p className="text-xs text-charcoal/40">No listings posted by this owner.</p>
              ) : (
                <div className="space-y-2">
                  {ownerListings.map((l) => (
                    <div key={l.id} className="flex items-center justify-between gap-3 border border-black/5 rounded-xl p-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-charcoal truncate">{l.title}</p>
                        <p className="text-[10px] text-charcoal/40 mt-0.5">₹{l.price.toLocaleString('en-IN')}{rentUnitLabel(l.category)}{l.verified ? ' · Verified' : ''}</p>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${listingStatusBadge[l.status] ?? 'bg-lightgray text-charcoal/60'}`}>
                        {l.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Payments & refunds */}
          <div>
            <h3 className="text-sm font-bold text-charcoal mb-2">Payments &amp; Refunds</h3>
            {paymentsLoading ? (
              <p className="text-xs text-charcoal/40">Loading…</p>
            ) : paymentsError ? (
              <p className="text-xs text-red-500">
                Couldn&apos;t load payments.{' '}
                <button onClick={() => void refreshPayments()} className="font-semibold underline cursor-pointer">Retry</button>
              </p>
            ) : payments.length === 0 ? (
              <p className="text-xs text-charcoal/40">No Razorpay payments on file.</p>
            ) : (
              <div className="space-y-2">
                {payments.map((p) => (
                  <div key={`${p.kind}-${p.id}`} className="border border-black/5 rounded-xl p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-charcoal truncate">{p.label}</p>
                        <p className="text-[10px] text-charcoal/40 mt-0.5">{p.sublabel} · ₹{(p.amountPaise / 100).toLocaleString('en-IN')}</p>
                      </div>
                      {p.status === 'refunded' ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 flex-shrink-0">Refunded</span>
                      ) : p.refundable ? (
                        <button
                          onClick={() => setConfirmingRefund(p)}
                          disabled={refundingId === p.id}
                          className="text-[11px] font-semibold px-3 py-1.5 rounded-full bg-white border border-black/10 text-charcoal/70 hover:border-red-200 hover:text-red-600 transition-colors cursor-pointer disabled:opacity-40 flex-shrink-0 whitespace-nowrap"
                        >
                          {refundingId === p.id ? 'Refunding…' : 'Refund'}
                        </button>
                      ) : (
                        <span className="text-[10px] text-charcoal/40 flex-shrink-0">Not refundable</span>
                      )}
                    </div>
                    {confirmingRefund?.id === p.id && (
                      <div className="mt-3">
                        <ConfirmInline
                          message={`Refund ₹${(p.amountPaise / 100).toLocaleString('en-IN')} for "${p.label}" to the user's original payment method? ${p.kind === 'pro' ? 'Their Pro plan will be revoked.' : ''} This cannot be undone.`}
                          confirmLabel="Refund"
                          busy={refundingId === p.id}
                          onConfirm={() => doRefund(p)}
                          onCancel={() => setConfirmingRefund(null)}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Reviews received */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-charcoal">Reviews Received</h3>
              {reviews.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold text-charcoal">{avgRating.toFixed(1)}</span>
                  <i className="ri-star-fill text-amber-400 text-sm" />
                  <span className="text-xs text-charcoal/40">({reviews.length})</span>
                </div>
              )}
            </div>
            {reviewsLoading ? (
              <p className="text-xs text-charcoal/40">Loading…</p>
            ) : reviews.length === 0 ? (
              <p className="text-xs text-charcoal/40">No reviews yet.</p>
            ) : (
              <div className="space-y-2">
                {reviews.map((r) => (
                  <div key={r.id} className="border border-black/5 rounded-xl p-3">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="text-xs font-semibold text-charcoal">{r.reviewer_name}</p>
                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <i key={n} className={`text-xs ${n <= r.overall_rating ? 'ri-star-fill text-amber-400' : 'ri-star-line text-charcoal/30'}`} />
                        ))}
                      </div>
                    </div>
                    {r.comment && <p className="text-xs text-charcoal/70">{r.comment}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Suspend / reactivate action */}
        {user.role !== 'admin' && (
          <div className="p-6 pt-0">
            {user.suspended ? (
              <button
                onClick={onReactivate}
                disabled={busy}
                className="w-full px-4 py-2.5 rounded-full text-sm font-semibold bg-green-500 text-white hover:bg-green-600 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60"
              >
                {busy ? 'Reactivating…' : 'Reactivate Account'}
              </button>
            ) : (
              <div className="space-y-2">
                <label htmlFor="suspend-reason" className="block text-xs font-semibold text-charcoal/60">Reason for suspension</label>
                <div className="flex gap-2">
                  <input
                    id="suspend-reason"
                    type="text"
                    value={reasonDraft}
                    onChange={(e) => setReasonDraft(e.target.value)}
                    placeholder="e.g. Repeated broker reports, fake listing documents…"
                    className="flex-1 px-4 py-2.5 rounded-full text-sm border border-black/10 focus:outline-none focus:border-red-400"
                  />
                  <button
                    onClick={() => onSuspend(reasonDraft)}
                    disabled={busy}
                    className="px-5 py-2.5 rounded-full text-sm font-semibold bg-red-500 text-white hover:bg-red-600 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60"
                  >
                    {busy ? 'Suspending…' : 'Suspend'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

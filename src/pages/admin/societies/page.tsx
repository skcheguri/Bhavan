import { useState } from 'react';
import { Link } from 'react-router';
import {
  useAdminSocieties,
  type SocietyReviewStatus,
  type SocietyReviewRow,
  type DeletionSummary,
} from '@/hooks/useAdminSocieties';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';

type StatusFilter = 'all' | SocietyReviewStatus;

const QUICK_REASONS = [
  'We could not confirm this building exists at the address given.',
  'This society is already registered on Bhavan.',
  'The address is incomplete — please resubmit with the full address and PIN.',
];

/**
 * Review queue for societies awaiting approval.
 *
 * Approving is what makes a society real: its join code starts resolving,
 * and the founder becomes its first admin. Both happen in the database on
 * the status change, so this screen only has to make the decision.
 */
export default function AdminSocietiesPage() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { societies, loading, error, approve, reject, destroy, declineDeletion, summaryFor } =
    useAdminSocieties();
  const [filter, setFilter] = useState<StatusFilter>('pending');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reasonDraft, setReasonDraft] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = societies.filter((s) => (filter === 'all' ? true : s.status === filter));
  const countFor = (s: StatusFilter) =>
    s === 'all' ? societies.length : societies.filter((x) => x.status === s).length;

  const handleApprove = async (id: string) => {
    if (!user) return;
    setBusyId(id);
    const err = await approve(id, user.id);
    setBusyId(null);
    setExpandedId(null);
    if (err) addToast(err, 'error');
    else addToast('Society approved — the founder is now its admin.', 'success');
  };

  const handleReject = async (id: string) => {
    if (!user) return;
    if (!reasonDraft.trim()) {
      addToast('Please give a reason — the owner sees it.', 'error');
      return;
    }
    setBusyId(id);
    const err = await reject(id, user.id, reasonDraft.trim());
    setBusyId(null);
    setExpandedId(null);
    setReasonDraft('');
    if (err) addToast(err, 'error');
    else addToast('Society rejected.', 'success');
  };

  const statusBadge: Record<SocietyReviewStatus, string> = {
    pending: 'bg-amber-50 text-amber-600',
    active: 'bg-green-50 text-green-600',
    rejected: 'bg-red-50 text-red-600',
    closed: 'bg-lightgray text-charcoal/50',
  };

  return (
    <div className="min-h-screen bg-offwhite pt-20 pb-16">
      <div className="max-w-5xl mx-auto px-4 md:px-8">
        <div className="mb-6 pt-4">
          <Link to="/admin" className="text-xs text-charcoal/40 hover:text-charcoal transition-colors">
            ← Admin Dashboard
          </Link>
          <h1 className="text-2xl md:text-3xl font-bold text-charcoal mt-1">Society Approvals</h1>
          <p className="text-sm text-charcoal/60 mt-1">
            Apartment complexes and villa communities awaiting review. Approving one activates its
            join code and makes the owner who registered it the first admin.
          </p>
        </div>

        <div className="flex gap-1 p-1 bg-white rounded-xl border border-black/5 mb-6 sm:inline-flex">
          {(['pending', 'active', 'closed', 'rejected', 'all'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold capitalize transition-colors ${
                filter === f ? 'bg-charcoal text-white' : 'text-charcoal/50 hover:text-charcoal'
              }`}
            >
              {f} ({countFor(f)})
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <div key={i} className="h-28 bg-white rounded-xl animate-pulse border border-black/5" />
            ))}
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-100 text-red-900 rounded-xl p-5 text-sm">
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-black/5 p-8 text-center">
            <i className="ri-building-2-line text-3xl text-charcoal/20" />
            <p className="text-sm text-charcoal/50 mt-2">
              {filter === 'pending' ? 'Nothing waiting for review.' : `No ${filter} societies.`}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((s) => (
              <div key={s.id} className="bg-white rounded-xl border border-black/5 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="font-bold text-charcoal">{s.name}</h2>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize ${statusBadge[s.status]}`}
                      >
                        {s.status}
                      </span>
                    </div>
                    <p className="text-sm text-charcoal/60 mt-1 capitalize">
                      {s.kind} · {s.address}
                      {s.city ? `, ${s.city}` : ''}
                      {s.state ? `, ${s.state}` : ''}
                    </p>
                    <p className="text-xs text-charcoal/40 mt-1.5">
                      Registered by {s.createdByName} ·{' '}
                      {new Date(s.createdAt).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                      {s.status === 'active' && ` · code ${s.joinCode} · ${s.memberCount} member${s.memberCount === 1 ? '' : 's'}`}
                    </p>
                    {s.status === 'rejected' && s.rejectionReason && (
                      <p className="text-xs text-red-600 mt-1.5">Reason: {s.rejectionReason}</p>
                    )}
                  </div>

                  {s.status === 'pending' && (
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => void handleApprove(s.id)}
                        disabled={busyId === s.id}
                        className="px-3 py-1.5 bg-brand text-white rounded-lg text-xs font-semibold disabled:opacity-40"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => {
                          setExpandedId(expandedId === s.id ? null : s.id);
                          setReasonDraft('');
                        }}
                        disabled={busyId === s.id}
                        className="px-3 py-1.5 border border-gray-200 text-charcoal rounded-lg text-xs font-semibold disabled:opacity-40"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>

                {s.deletionRequestedAt && (
                  <DeletionRequest
                    society={s}
                    loadSummary={() => summaryFor(s.id)}
                    onDelete={async () => {
                      const err = await destroy(s.id);
                      if (err) addToast(err, 'error');
                      else addToast(`${s.name} deleted.`, 'success');
                    }}
                    onDecline={async () => {
                      const err = await declineDeletion(s.id);
                      if (err) addToast(err, 'error');
                      else addToast('Request declined. The society is untouched.', 'success');
                    }}
                  />
                )}

                {expandedId === s.id && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <label className="block text-xs font-semibold text-charcoal mb-2">
                      Why? The owner sees this.
                    </label>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {QUICK_REASONS.map((r) => (
                        <button
                          key={r}
                          onClick={() => setReasonDraft(r)}
                          className="px-2.5 py-1 bg-lightgray rounded-lg text-[11px] text-charcoal/70 hover:bg-gray-200"
                        >
                          {r.slice(0, 42)}…
                        </button>
                      ))}
                    </div>
                    <textarea
                      value={reasonDraft}
                      onChange={(e) => setReasonDraft(e.target.value)}
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                      placeholder="Explain what was wrong so they can fix it."
                    />
                    <button
                      onClick={() => void handleReject(s.id)}
                      disabled={busyId === s.id}
                      className="mt-2 px-4 py-2 bg-red-600 text-white rounded-lg text-xs font-semibold disabled:opacity-40"
                    >
                      Confirm rejection
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


/**
 * A society asking to be deleted, with the facts that should decide it.
 *
 * "Is the group inactive" is the wrong question on its own: a forty-flat
 * society that moved to another app legitimately wants out, and refusing
 * them means they abandon the group instead -- so Bhavan keeps their data
 * forever AND they keep getting notified. Confirmed contributions are the
 * thing that should actually stop a reviewer, because that is the record
 * somebody will come back asking for.
 */
function DeletionRequest({
  society: s,
  loadSummary,
  onDelete,
  onDecline,
}: {
  society: SocietyReviewRow;
  loadSummary: () => Promise<DeletionSummary | null>;
  onDelete: () => Promise<void>;
  onDecline: () => Promise<void>;
}) {
  const [summary, setSummary] = useState<DeletionSummary | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const review = async () => {
    setOpen(true);
    if (!summary) setSummary(await loadSummary());
  };

  const money = summary ? summary.confirmed_contribution_count > 0 : false;

  return (
    <div className="mt-4 p-4 bg-red-50 rounded-xl">
      <p className="text-sm font-bold text-red-900">
        <i className="ri-delete-bin-line mr-1" />
        Deletion requested
      </p>
      <p className="text-xs text-red-900/70 mt-0.5">
        {new Date(s.deletionRequestedAt!).toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })}
        {s.deletionReason ? ` — "${s.deletionReason}"` : ''}
      </p>

      {!open ? (
        <button
          onClick={() => void review()}
          className="mt-3 px-4 py-2 bg-white border border-red-200 text-red-700 rounded-lg text-xs font-semibold"
        >
          Review
        </button>
      ) : (
        <>
          {summary === null ? (
            <div className="mt-3 h-16 bg-white/60 rounded-lg animate-pulse" />
          ) : (
            <>
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                {[
                  ['Members', summary.member_count],
                  ['Issues', summary.ticket_count],
                  ['Notices', summary.notice_count],
                  ['Collections', summary.collection_count],
                  ['Confirmed payments', summary.confirmed_contribution_count],
                  [
                    'Money recorded',
                    `₹${Number(summary.confirmed_contribution_rupees).toLocaleString('en-IN')}`,
                  ],
                ].map(([label, value]) => (
                  <div key={String(label)} className="bg-white rounded-lg px-3 py-2">
                    <p className="text-charcoal/50">{label}</p>
                    <p className="font-bold text-charcoal">{String(value)}</p>
                  </div>
                ))}
              </div>

              {summary.plan_status === 'active' && (
                <p className="mt-2 text-xs text-red-900">
                  A paid plan is still running
                  {summary.plan_ends
                    ? ` until ${new Date(summary.plan_ends).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}`
                    : ''}
                  . Closing instead would leave it intact.
                </p>
              )}

              {money && (
                <p className="mt-2 text-xs font-semibold text-red-900">
                  This society has confirmed payment records. Deleting destroys them for every
                  member — export them first if there is any doubt.
                </p>
              )}
            </>
          )}

          <div className="flex gap-2 mt-3 flex-wrap">
            <button
              onClick={async () => {
                if (
                  !window.confirm(
                    `Permanently delete ${s.name}? This removes every member, issue, notice, collection and payment record. It cannot be undone.`
                  )
                ) {
                  return;
                }
                setBusy(true);
                await onDelete();
                setBusy(false);
              }}
              disabled={busy || summary === null}
              className="px-4 py-2 bg-red-600 text-white rounded-lg text-xs font-semibold disabled:opacity-40"
            >
              Delete permanently
            </button>
            <button
              onClick={async () => {
                setBusy(true);
                await onDecline();
                setBusy(false);
              }}
              disabled={busy}
              className="px-4 py-2 bg-white border border-gray-200 text-charcoal rounded-lg text-xs font-semibold disabled:opacity-40"
            >
              Decline
            </button>
          </div>
        </>
      )}
    </div>
  );
}

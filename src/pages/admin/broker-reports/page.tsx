import { useState } from 'react';
import { Link } from 'react-router';
import { useAdminBrokerReports, type AdminBrokerReport } from '@/hooks/useBrokerReport';
import { fetchAdminUserById, setUserSuspended, type AdminUserRow } from '@/hooks/useAdminUsers';
import { useToast } from '@/hooks/useToast';
import AdminUserDetailModal from '../users/components/AdminUserDetailModal';

type StatusFilter = 'all' | 'pending' | 'reviewed' | 'resolved' | 'dismissed';

const reasonLabels: Record<AdminBrokerReport['reason'], string> = {
  broker_agent: 'Broker / Agent',
  asked_commission: 'Asked Commission',
  shared_competing_listing: 'Shared Competing Listing',
  refused_identity: 'Refused Identity',
  other: 'Other',
};

const statusBadge: Record<AdminBrokerReport['status'], string> = {
  pending: 'bg-amber-50 text-amber-600',
  reviewed: 'bg-blue-50 text-blue-600',
  resolved: 'bg-green-50 text-green-600',
  dismissed: 'bg-lightgray text-charcoal/60',
};

export default function AdminBrokerReportsPage() {
  const { addToast } = useToast();
  const { reports, activeSoftBlockCount, loading, error, updateReportStatus, refresh } = useAdminBrokerReports();
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [selectedUser, setSelectedUser] = useState<AdminUserRow | null>(null);
  const [loadingUserId, setLoadingUserId] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const filtered = reports.filter((r) => (filter === 'all' ? true : r.status === filter));

  const updateStatus = async (id: string, status: AdminBrokerReport['status']) => {
    const ok = await updateReportStatus(id, status, noteDraft || undefined);
    setExpandedId(null);
    setNoteDraft('');
    if (ok) addToast(`Report marked as ${status}`, 'success');
    else addToast('Failed to update report', 'error');
  };

  const openUser = async (id: string) => {
    setLoadingUserId(id);
    const row = await fetchAdminUserById(id);
    setLoadingUserId(null);
    if (!row) {
      addToast('Could not load user', 'error');
      return;
    }
    setSelectedUser(row);
  };

  const handleSuspend = async (reason: string) => {
    if (!selectedUser || !reason.trim()) {
      addToast('Please provide a reason for suspension', 'error');
      return;
    }
    setBusyUserId(selectedUser.id);
    const { error } = await setUserSuspended(selectedUser.id, true, reason.trim());
    setBusyUserId(null);
    setSelectedUser(null);
    if (error) addToast(error, 'error');
    else addToast('Account suspended', 'success');
  };

  const handleReactivate = async () => {
    if (!selectedUser) return;
    setBusyUserId(selectedUser.id);
    const { error } = await setUserSuspended(selectedUser.id, false);
    setBusyUserId(null);
    setSelectedUser(null);
    if (error) addToast(error, 'error');
    else addToast('Account reactivated', 'success');
  };

  return (
    <div className="min-h-screen bg-offwhite pt-20 pb-16">
      <div className="max-w-5xl mx-auto px-4 md:px-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pt-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link to="/admin" className="text-xs text-charcoal/40 hover:text-charcoal transition-colors">← Admin Dashboard</Link>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-charcoal">Broker Reports</h1>
            <p className="text-sm text-charcoal/60 mt-1">Review, investigate and resolve landlord-reported broker activity.</p>
          </div>
        </div>

        {/* Soft block summary */}
        <div className="bg-white rounded-3xl border border-black/5 p-5 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-purple-50">
              <i className="ri-lock-line text-purple-600 text-lg" />
            </div>
            <div>
              <p className="text-sm font-bold text-charcoal">{activeSoftBlockCount} Active Soft Block{activeSoftBlockCount !== 1 ? 's' : ''}</p>
              <p className="text-xs text-charcoal/60">Tenants currently restricted from sending inquiries.</p>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
          {(['all', 'pending', 'reviewed', 'resolved', 'dismissed'] as StatusFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-full text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap flex-shrink-0 ${
                filter === f ? 'bg-amber-500 text-white' : 'bg-white text-charcoal/60 hover:text-charcoal border border-black/5'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
              {f !== 'all' && (
                <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-bold ${filter === f ? 'bg-white/20 text-white' : 'bg-lightgray text-charcoal/40'}`}>
                  {reports.filter((r) => r.status === f).length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Reports list */}
        <div className="space-y-4">
          {loading ? (
            <div className="bg-white rounded-3xl border border-black/5 p-12 text-center text-sm text-charcoal/40">
              Loading reports…
            </div>
          ) : error ? (
            // A failed fetch must never read as "all handled" on a
            // moderation queue -- say so and offer a retry.
            <div className="bg-white rounded-3xl border border-red-100 p-12 text-center">
              <div className="w-14 h-14 flex items-center justify-center mx-auto mb-4 bg-red-50 rounded-full">
                <i className="ri-error-warning-line text-2xl text-red-500" />
              </div>
              <h3 className="text-base font-bold text-charcoal mb-2">Couldn't load broker reports</h3>
              <p className="text-sm text-charcoal/60 mb-5">This queue may be incomplete. Retry before assuming it's clear.</p>
              <button onClick={() => refresh()} className="bg-charcoal text-white px-6 py-2.5 rounded-full text-sm font-medium hover:bg-black transition-colors whitespace-nowrap cursor-pointer">Retry</button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-3xl border border-black/5 p-12 text-center">
              <div className="w-14 h-14 flex items-center justify-center mx-auto mb-4 bg-lightgray rounded-full">
                <i className="ri-flag-line text-2xl text-charcoal/40" />
              </div>
              <h3 className="text-base font-bold text-charcoal mb-2">No reports found</h3>
              <p className="text-sm text-charcoal/60">All broker reports have been handled for this filter.</p>
            </div>
          ) : (
            filtered.map((r) => (
              <div key={r.id} className="bg-white rounded-3xl border border-black/5 overflow-hidden">
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${statusBadge[r.status]}`}>
                          {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                        </span>
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-lightgray text-charcoal/60">
                          {reasonLabels[r.reason]}
                        </span>
                      </div>
                      <p className="text-sm font-bold text-charcoal mb-1">
                        Tenant:{' '}
                        <button
                          onClick={() => openUser(r.tenant_id)}
                          disabled={loadingUserId === r.tenant_id}
                          className="font-semibold text-charcoal hover:text-amber-600 underline decoration-transparent hover:decoration-current underline-offset-2 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {loadingUserId === r.tenant_id ? 'Loading…' : r.tenant_name}
                        </button>{' '}
                        · Reported by{' '}
                        <button
                          onClick={() => openUser(r.owner_id)}
                          disabled={loadingUserId === r.owner_id}
                          className="font-semibold text-charcoal hover:text-amber-600 underline decoration-transparent hover:decoration-current underline-offset-2 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {loadingUserId === r.owner_id ? 'Loading…' : r.owner_name}
                        </button>
                      </p>
                      <p className="text-xs text-charcoal/60 mb-2">
                        Listing: {r.listing_title ?? 'N/A'} · {new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                      <p className="text-sm text-charcoal/70 leading-relaxed">{r.reason_text}</p>
                    </div>
                    <button
                      onClick={() => { setExpandedId(expandedId === r.id ? null : r.id); setNoteDraft(r.admin_note ?? ''); }}
                      className="flex-shrink-0 text-xs font-semibold text-amber-600 hover:text-amber-700 cursor-pointer whitespace-nowrap"
                    >
                      {expandedId === r.id ? 'Close' : 'Review'}
                    </button>
                  </div>

                  {/* Admin action panel */}
                  {expandedId === r.id && (
                    <div className="mt-4 pt-4 border-t border-black/5">
                      <label className="block text-xs font-semibold text-charcoal/60 uppercase tracking-wide mb-1.5">Admin Note</label>
                      <textarea
                        value={noteDraft}
                        onChange={(e) => setNoteDraft(e.target.value)}
                        maxLength={500}
                        placeholder="Add investigation notes, evidence links, or resolution rationale..."
                        className="w-full px-3 py-2.5 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none"
                        rows={3}
                      />
                      <p className="text-[10px] text-charcoal/40 mt-1 text-right">{noteDraft.length}/500</p>

                      <div className="flex flex-wrap gap-2 mt-3">
                        {(['reviewed', 'resolved', 'dismissed'] as AdminBrokerReport['status'][]).map((s) => (
                          <button
                            key={s}
                            onClick={() => updateStatus(r.id, s)}
                            disabled={r.status === s}
                            className={`px-4 py-2 rounded-full text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                              r.status === s
                                ? 'bg-lightgray text-charcoal/40 cursor-not-allowed'
                                : s === 'resolved'
                                ? 'bg-green-500 text-white hover:bg-green-600'
                                : s === 'dismissed'
                                ? 'bg-gray-200 text-charcoal/70 hover:bg-gray-300'
                                : 'bg-blue-500 text-white hover:bg-blue-600'
                            }`}
                          >
                            Mark {s.charAt(0).toUpperCase() + s.slice(1)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {r.admin_note && expandedId !== r.id && (
                    <div className="mt-3 bg-lightgray rounded-lg px-3 py-2">
                      <p className="text-xs text-charcoal/60">
                        <span className="font-semibold">Admin note:</span> {r.admin_note}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {selectedUser && (
        <AdminUserDetailModal
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
          onSuspend={handleSuspend}
          onReactivate={handleReactivate}
          busy={busyUserId === selectedUser.id}
        />
      )}
    </div>
  );
}
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminPropertyVerification, type PropertyVerificationStatus } from '@/hooks/useAdminPropertyVerification';
import { useToast } from '@/hooks/useToast';

type StatusFilter = 'all' | PropertyVerificationStatus;

const QUICK_REASONS = [
  'Document is blurry or unreadable.',
  'Document does not match property address.',
  'Document type not accepted — please upload a sale deed, tax receipt, or utility bill.',
];

export default function AdminPropertyVerificationPage() {
  const { addToast } = useToast();
  const { requests, loading, approve, reject, getDocumentUrl } = useAdminPropertyVerification();
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reasonDraft, setReasonDraft] = useState('');
  const [viewingId, setViewingId] = useState<string | null>(null);

  const filtered = requests.filter((r) => (filter === 'all' ? true : r.status === filter));

  const handleApprove = async (id: string) => {
    const ok = await approve(id);
    setExpandedId(null);
    if (ok) addToast('Property verified', 'success');
    else addToast('Failed to approve property', 'error');
  };

  const handleReject = async (id: string, reason: string) => {
    if (!reason.trim()) {
      addToast('Please provide a rejection reason', 'error');
      return;
    }
    const ok = await reject(id, reason.trim());
    setExpandedId(null);
    setReasonDraft('');
    if (ok) addToast('Property verification rejected', 'success');
    else addToast('Failed to reject property', 'error');
  };

  const handleViewDocument = async (id: string, path: string) => {
    setViewingId(id);
    const url = await getDocumentUrl(path);
    setViewingId(null);
    if (!url) {
      addToast('Could not load document', 'error');
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const statusBadge = {
    pending: 'bg-amber-50 text-amber-600',
    approved: 'bg-green-50 text-green-600',
    rejected: 'bg-red-50 text-red-600',
  };

  return (
    <div className="min-h-screen bg-offwhite pt-20 pb-16">
      <div className="max-w-5xl mx-auto px-4 md:px-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pt-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link to="/admin" className="text-xs text-charcoal/40 hover:text-charcoal transition-colors">← Admin Dashboard</Link>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-charcoal">Property Ownership Verification</h1>
            <p className="text-sm text-charcoal/60 mt-1">Review ownership documents submitted by landlords listing a property.</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
          {(['all', 'pending', 'approved', 'rejected'] as StatusFilter[]).map((f) => (
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
                  {requests.filter((r) => r.status === f).length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Requests list */}
        <div className="space-y-4">
          {loading ? (
            <div className="bg-white rounded-3xl border border-black/5 p-12 text-center text-sm text-charcoal/40">
              Loading requests…
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-3xl border border-black/5 p-12 text-center">
              <div className="w-14 h-14 flex items-center justify-center mx-auto mb-4 bg-lightgray rounded-full">
                <i className="ri-file-shield-2-line text-2xl text-charcoal/40" />
              </div>
              <h3 className="text-base font-bold text-charcoal mb-2">No requests</h3>
              <p className="text-sm text-charcoal/60">All ownership document submissions have been processed.</p>
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
                      </div>
                      <p className="text-sm font-bold text-charcoal mb-1">{r.propertyName || 'Untitled property'}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs text-charcoal/60 mt-2">
                        <p>Owner: <span className="font-medium text-charcoal">{r.ownerName}</span></p>
                        <p>Location: <span className="font-medium text-charcoal">{r.address}{r.city ? `, ${r.city}` : ''}</span></p>
                        <p>Submitted: <span className="font-medium text-charcoal">{new Date(r.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span></p>
                        {r.reviewedAt && (
                          <p>Reviewed: <span className="font-medium text-charcoal">{new Date(r.reviewedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span></p>
                        )}
                      </div>
                      {r.rejectionReason && (
                        <p className="text-xs text-red-500 mt-2">Reason: {r.rejectionReason}</p>
                      )}
                      <button
                        onClick={() => handleViewDocument(r.id, r.verificationDocPath)}
                        disabled={viewingId === r.id}
                        className="mt-3 text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {viewingId === r.id ? 'Loading document…' : 'View submitted document ↗'}
                      </button>

                      {/* Listing photos -- spot-check that they plausibly
                          match the property, not just that ownership docs
                          check out. No automated detection, just surfacing
                          them where an admin is already reviewing. */}
                      {r.listingImages.length > 0 && (
                        <div className="mt-3">
                          <p className="text-[10px] font-semibold text-charcoal/40 uppercase tracking-wide mb-1.5">Listing Photos</p>
                          <div className="flex gap-2 overflow-x-auto">
                            {r.listingImages.map((url, i) => (
                              <a
                                key={i}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-black/10 hover:border-amber-400 transition-colors"
                              >
                                <img src={url} alt={`Listing photo ${i + 1}`} className="w-full h-full object-cover" />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setExpandedId(expandedId === r.id ? null : r.id);
                        setReasonDraft('');
                      }}
                      className="flex-shrink-0 text-xs font-semibold text-amber-600 hover:text-amber-700 cursor-pointer whitespace-nowrap"
                    >
                      {expandedId === r.id ? 'Close' : 'Review'}
                    </button>
                  </div>

                  {expandedId === r.id && r.status === 'pending' && (
                    <div className="mt-4 pt-4 border-t border-black/5">
                      <button
                        onClick={() => handleApprove(r.id)}
                        className="px-4 py-2 rounded-full text-xs font-semibold bg-green-500 text-white hover:bg-green-600 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        Approve Verification
                      </button>

                      <div className="mt-4">
                        <p className="text-xs font-semibold text-charcoal/60 mb-2">Reject with reason:</p>
                        <div className="flex flex-wrap gap-2 mb-2">
                          {QUICK_REASONS.map((reason) => (
                            <button
                              key={reason}
                              onClick={() => setReasonDraft(reason)}
                              className="px-3 py-1.5 rounded-full text-[11px] font-medium bg-lightgray text-charcoal/70 hover:bg-red-100 hover:text-red-600 transition-colors cursor-pointer whitespace-nowrap"
                            >
                              {reason}
                            </button>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={reasonDraft}
                            onChange={(e) => setReasonDraft(e.target.value)}
                            placeholder="Rejection reason shown to the owner"
                            aria-label="Rejection reason"
                            className="flex-1 px-4 py-2 rounded-full text-xs border border-black/10 focus:outline-none focus:border-amber-500"
                          />
                          <button
                            onClick={() => handleReject(r.id, reasonDraft)}
                            className="px-4 py-2 rounded-full text-xs font-semibold bg-red-500 text-white hover:bg-red-600 transition-colors cursor-pointer whitespace-nowrap"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

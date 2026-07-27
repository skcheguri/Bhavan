import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminContactInquiries, type ContactInquiryStatus } from '@/hooks/useContactInquiries';
import { useToast } from '@/hooks/useToast';

type StatusFilter = 'all' | ContactInquiryStatus;

export default function AdminSupportPage() {
  const { addToast } = useToast();
  const { inquiries, loading, updateStatus } = useAdminContactInquiries();
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');

  const filtered = inquiries.filter((i) => (filter === 'all' ? true : i.status === filter));

  const handleUpdate = async (id: string, status: ContactInquiryStatus) => {
    const ok = await updateStatus(id, status, noteDraft || undefined);
    setExpandedId(null);
    setNoteDraft('');
    if (ok) addToast('Inquiry updated', 'success');
    else addToast('Failed to update inquiry', 'error');
  };

  const statusBadge: Record<ContactInquiryStatus, string> = {
    new: 'bg-amber-50 text-amber-600',
    in_progress: 'bg-blue-50 text-blue-600',
    resolved: 'bg-green-50 text-green-600',
  };

  return (
    <div className="min-h-screen bg-offwhite pt-20 pb-16">
      <div className="max-w-5xl mx-auto px-4 md:px-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pt-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link to="/admin" className="text-xs text-charcoal/40 hover:text-charcoal transition-colors">← Admin Dashboard</Link>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-charcoal">Support Inquiries</h1>
            <p className="text-sm text-charcoal/60 mt-1">Messages submitted through the public Contact Us form.</p>
          </div>
        </div>

        <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
          {(['all', 'new', 'in_progress', 'resolved'] as StatusFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-full text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap flex-shrink-0 ${
                filter === f ? 'bg-amber-500 text-white' : 'bg-white text-charcoal/60 hover:text-charcoal border border-black/5'
              }`}
            >
              {f === 'in_progress' ? 'In Progress' : f.charAt(0).toUpperCase() + f.slice(1)}
              {f !== 'all' && (
                <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-bold ${filter === f ? 'bg-white/20 text-white' : 'bg-lightgray text-charcoal/40'}`}>
                  {inquiries.filter((i) => i.status === f).length}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {loading ? (
            <div className="bg-white rounded-3xl border border-black/5 p-12 text-center text-sm text-charcoal/40">Loading inquiries…</div>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-3xl border border-black/5 p-12 text-center">
              <div className="w-14 h-14 flex items-center justify-center mx-auto mb-4 bg-lightgray rounded-full">
                <i className="ri-mail-line text-2xl text-charcoal/40" />
              </div>
              <h3 className="text-base font-bold text-charcoal mb-2">No inquiries</h3>
              <p className="text-sm text-charcoal/60">Nothing has come through the Contact Us form yet.</p>
            </div>
          ) : (
            filtered.map((i) => (
              <div key={i.id} className="bg-white rounded-3xl border border-black/5 overflow-hidden">
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${statusBadge[i.status]}`}>
                          {i.status === 'in_progress' ? 'In Progress' : i.status.charAt(0).toUpperCase() + i.status.slice(1)}
                        </span>
                        <span className="text-xs font-semibold text-charcoal">{i.subject}</span>
                      </div>
                      <p className="text-sm font-bold text-charcoal mb-0.5">{i.name}</p>
                      <p className="text-xs text-charcoal/60 mb-2">{i.email}</p>
                      <p className="text-sm text-charcoal/80 leading-relaxed">{i.message}</p>
                      <p className="text-xs text-charcoal/40 mt-2">
                        {new Date(i.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                      {i.adminNotes && <p className="text-xs text-charcoal/60 mt-2">Notes: {i.adminNotes}</p>}
                    </div>
                    <button
                      onClick={() => {
                        setExpandedId(expandedId === i.id ? null : i.id);
                        setNoteDraft(i.adminNotes ?? '');
                      }}
                      className="flex-shrink-0 text-xs font-semibold text-amber-600 hover:text-amber-700 cursor-pointer whitespace-nowrap"
                    >
                      {expandedId === i.id ? 'Close' : 'Manage'}
                    </button>
                  </div>

                  {expandedId === i.id && (
                    <div className="mt-4 pt-4 border-t border-black/5 space-y-3">
                      <input
                        type="text"
                        value={noteDraft}
                        onChange={(e) => setNoteDraft(e.target.value)}
                        placeholder="Internal note (optional)"
                        aria-label="Internal note"
                        className="w-full px-4 py-2 rounded-full text-xs border border-black/10 focus:outline-none focus:border-amber-500"
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => handleUpdate(i.id, 'in_progress')}
                          className="px-4 py-2 rounded-full text-xs font-semibold bg-blue-500 text-white hover:bg-blue-600 transition-colors cursor-pointer whitespace-nowrap"
                        >
                          Mark In Progress
                        </button>
                        <button
                          onClick={() => handleUpdate(i.id, 'resolved')}
                          className="px-4 py-2 rounded-full text-xs font-semibold bg-green-500 text-white hover:bg-green-600 transition-colors cursor-pointer whitespace-nowrap"
                        >
                          Mark Resolved
                        </button>
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

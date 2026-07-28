import { useState } from 'react';
import { useMaintenanceRequests, useCreateMaintenanceRequest } from '@/hooks/useMaintenanceRequests';
import { useTenantRentalAgreements } from '@/hooks/useRentalAgreements';

const maintenanceCategories = [
  { id: 'plumbing', label: 'Plumbing', icon: 'ri-drop-line', color: 'bg-brand/10 text-brand' },
  { id: 'electrical', label: 'Electrical', icon: 'ri-flashlight-line', color: 'bg-amber-50 text-amber-600' },
  { id: 'water', label: 'Water Supply', icon: 'ri-water-flash-line', color: 'bg-teal-50 text-teal-600' },
  { id: 'elevator', label: 'Elevator', icon: 'ri-arrow-up-down-line', color: 'bg-red-50 text-red-600' },
  { id: 'carpentry', label: 'Carpentry', icon: 'ri-hammer-line', color: 'bg-orange-50 text-orange-600' },
  { id: 'painting', label: 'Painting', icon: 'ri-brush-line', color: 'bg-pink-50 text-pink-600' },
  { id: 'ac', label: 'AC & Appliances', icon: 'ri-temp-cold-line', color: 'bg-sky-50 text-sky-600' },
  { id: 'security', label: 'Security', icon: 'ri-shield-keyhole-line', color: 'bg-indigo-50 text-indigo-600' },
  { id: 'housekeeping', label: 'Housekeeping', icon: 'ri-service-line', color: 'bg-green-50 text-green-600' },
  { id: 'other', label: 'Other', icon: 'ri-more-line', color: 'bg-lightgray text-charcoal/70' },
];

function getCategoryIcon(category: string): string {
  const cat = maintenanceCategories.find((c) => c.id === category.toLowerCase());
  return cat?.icon ?? 'ri-tools-line';
}

const issuePlaceholders: Record<string, string> = {
  plumbing: 'e.g. Kitchen tap is leaking',
  electrical: 'e.g. Living room switch not working',
  water: 'e.g. No water supply since morning',
  elevator: 'e.g. Elevator stuck between floors',
  carpentry: 'e.g. Bedroom door hinge is broken',
  painting: 'e.g. Wall paint peeling near the window',
  ac: 'e.g. AC not cooling properly',
  security: 'e.g. Main gate lock is broken',
  housekeeping: 'e.g. Common area needs cleaning',
  other: 'Briefly describe the issue',
};

const statusConfig: Record<string, { label: string; color: string; dot: string }> = {
  pending: { label: 'Pending', color: 'bg-lightgray text-charcoal/70', dot: 'bg-gray-400' },
  acknowledged: { label: 'Acknowledged', color: 'bg-amber-100 text-amber-700', dot: 'bg-amber-400' },
  in_progress: { label: 'In Progress', color: 'bg-brand/10 text-brand', dot: 'bg-brand' },
  resolved: { label: 'Resolved', color: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
};

const urgencyConfig: Record<string, { color: string; dot: string }> = {
  high: { color: 'text-red-600', dot: 'bg-red-500' },
  medium: { color: 'text-amber-600', dot: 'bg-amber-400' },
  low: { color: 'text-green-600', dot: 'bg-green-500' },
};

function timeAgo(isoDate: string) {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatDate(isoDate: string) {
  return new Date(isoDate).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function buildTimeline(req: { status: string; created_at: string; updated_at: string; resolved_at: string | null }) {
  const steps = [
    { status: 'Submitted', note: 'Request received and logged.', key: 'submitted' },
    { status: 'Acknowledged', note: 'Property manager reviewed your request.', key: 'acknowledged' },
    { status: 'In Progress', note: 'Technician assigned and working on the issue.', key: 'in_progress' },
    { status: 'Resolved', note: 'Issue fixed and verified.', key: 'resolved' },
  ];

  const statusOrder: Record<string, number> = {
    pending: 0,
    acknowledged: 1,
    in_progress: 2,
    resolved: 3,
  };

  const current = statusOrder[req.status] ?? 0;

  return steps.map((step, idx) => {
    const done = idx <= current;
    let date: string | null = null;
    if (done) {
      if (idx === 0) date = formatDate(req.created_at);
      else if (idx === 3 && req.resolved_at) date = formatDate(req.resolved_at);
      else date = formatDate(req.updated_at);
    }
    return { ...step, done, date };
  });
}

interface Props {
  tenantId: string;
}

export default function RequestsTab({ tenantId }: Props) {
  const [maintFilter, setMaintFilter] = useState<'all' | 'in_progress' | 'pending' | 'resolved'>('all');

  const { requests: maintRequests, loading: maintLoading, refresh: refreshMaint } = useMaintenanceRequests(tenantId);
  const { create: createMaint, creating: creatingMaint } = useCreateMaintenanceRequest();

  // A request must be tied to a real rental agreement -- that's what
  // tells us which owner to notify. A tenant can have more than one
  // (multiple properties), so when there's more than one they pick
  // which property the issue is for; with exactly one it's just used
  // directly.
  const { agreements } = useTenantRentalAgreements(tenantId);
  const [selectedAgreementId, setSelectedAgreementId] = useState<string | null>(null);
  const selectedAgreement = agreements.find((a) => a.id === selectedAgreementId) ?? null;

  const [selectedMaintId, setSelectedMaintId] = useState<string | null>(null);
  const [showNewRequest, setShowNewRequest] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [requestForm, setRequestForm] = useState<{ issue: string; description: string; urgency: 'low' | 'medium' | 'high'; preferredTime: string }>({ issue: '', description: '', urgency: 'medium', preferredTime: '' });
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmitRequest = async () => {
    if (!selectedCategory || !requestForm.issue.trim() || !selectedAgreement) return;
    setSubmitError(null);

    const { error } = await createMaint({
      tenant_id: tenantId,
      agreement_id: selectedAgreement.id,
      category: selectedCategory,
      title: requestForm.issue,
      description: requestForm.description,
      priority: requestForm.urgency,
      unit: selectedAgreement.flatNumber || '',
      preferred_time: requestForm.preferredTime,
    });

    if (error) {
      setSubmitError(error);
      return;
    }

    setSubmitted(true);
    refreshMaint();
    setTimeout(() => {
      setSubmitted(false);
      setShowNewRequest(false);
      setSelectedCategory(null);
      setRequestForm({ issue: '', description: '', urgency: 'medium', preferredTime: '' });
    }, 2500);
  };

  const maintFiltered = maintFilter === 'all'
    ? maintRequests
    : maintRequests.filter((r) => r.status === maintFilter);

  const selectedMaint = maintRequests.find((r) => r.id === selectedMaintId) || null;

  const maintCounts = {
    all: maintRequests.length,
    in_progress: maintRequests.filter((r) => r.status === 'in_progress').length,
    pending: maintRequests.filter((r) => r.status === 'pending').length,
    resolved: maintRequests.filter((r) => r.status === 'resolved').length,
  };

  // Auto-select first on load
  if (maintRequests.length > 0 && !selectedMaintId) {
    setSelectedMaintId(maintRequests[0].id);
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-charcoal">Maintenance Requests</h2>
          <p className="text-sm text-charcoal/60 mt-0.5">Report issues and track their resolution</p>
        </div>
        <button
          onClick={() => {
            setShowNewRequest(true);
            setSelectedCategory(null);
            setSubmitted(false);
            setSubmitError(null);
            setSelectedAgreementId(agreements.length === 1 ? agreements[0].id : null);
          }}
          className="flex items-center justify-center gap-2 bg-brand text-white font-semibold px-5 py-2.5 rounded-full hover:bg-brand-dark transition-colors cursor-pointer whitespace-nowrap"
        >
          <i className="ri-add-line" /> New Request
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {([
          { key: 'all' as const, label: 'Total', icon: 'ri-list-check-2', color: 'text-charcoal' },
          { key: 'in_progress' as const, label: 'In Progress', icon: 'ri-loader-4-line', color: 'text-blue-600' },
          { key: 'pending' as const, label: 'Pending', icon: 'ri-time-line', color: 'text-charcoal/60' },
          { key: 'resolved' as const, label: 'Resolved', icon: 'ri-checkbox-circle-line', color: 'text-green-600' },
        ]).map((s) => (
          <button
            key={s.key}
            onClick={() => setMaintFilter(s.key)}
            className={`text-left p-4 rounded-xl border transition-all cursor-pointer ${
              maintFilter === s.key ? 'border-brand bg-brand/5' : 'border-black/5 bg-white hover:border-brand/30'
            }`}
          >
            <div className={`w-5 h-5 flex items-center justify-center mb-2 ${s.color}`}>
              <i className={`${s.icon} text-lg`} />
            </div>
            <p className="text-2xl font-bold text-charcoal">{maintCounts[s.key]}</p>
            <p className="text-xs text-charcoal/60 mt-0.5">{s.label}</p>
          </button>
        ))}
      </div>

      {maintLoading ? (
        <div className="bg-white rounded-3xl border border-black/5 p-12 text-center">
          <div className="w-12 h-12 flex items-center justify-center mx-auto mb-4">
            <i className="ri-loader-4-line animate-spin text-brand text-3xl" />
          </div>
          <p className="text-charcoal/60 text-sm">Loading maintenance requests...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Request list */}
          <div className="lg:col-span-2 space-y-3">
            {maintFiltered.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center border border-black/5">
                <div className="w-12 h-12 mx-auto flex items-center justify-center rounded-full bg-lightgray mb-3">
                  <i className="ri-inbox-line text-charcoal/40 text-2xl" />
                </div>
                <p className="text-sm text-charcoal/60">No requests found</p>
              </div>
            ) : (
              maintFiltered.map((req) => {
                const sc = statusConfig[req.status] || statusConfig.pending;
                const uc = urgencyConfig[req.priority] || urgencyConfig.low;
                const icon = getCategoryIcon(req.category);
                return (
                  <button
                    key={req.id}
                    onClick={() => setSelectedMaintId(req.id)}
                    className={`w-full text-left bg-white rounded-2xl p-4 border transition-all cursor-pointer ${
                      selectedMaintId === req.id ? 'border-brand ring-1 ring-brand/20' : 'border-black/5 hover:border-brand/30'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-brand/10 flex-shrink-0">
                          <i className={`${icon} text-brand text-lg`} />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-charcoal">{req.category}</p>
                          <p className="text-xs text-charcoal/60">{req.title}</p>
                        </div>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap ${sc.color}`}>
                        {sc.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-3 flex-wrap">
                      <span className="text-[11px] text-charcoal/40">{req.id.slice(0, 8)}</span>
                      <span className="text-[11px] text-charcoal/40">{req.unit || 'N/A'}</span>
                      <span className="text-[11px] text-charcoal/40">{timeAgo(req.created_at)}</span>
                      <span className={`text-[11px] font-semibold capitalize ${uc.color}`}>{req.priority}</span>
                    </div>
                    <div className="mt-3">
                      <div className="h-1.5 bg-lightgray rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            req.status === 'resolved' ? 'bg-green-500 w-full' :
                            req.status === 'in_progress' ? 'bg-brand w-3/4' :
                            req.status === 'acknowledged' ? 'bg-amber-400 w-2/5' :
                            'bg-gray-300 w-1/5'
                          }`}
                        />
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Detail panel */}
          <div className="lg:col-span-3">
            {selectedMaint ? (
              <div className="bg-white rounded-3xl border border-black/5 overflow-hidden">
                <div className="px-6 py-5 border-b border-black/5 flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 flex items-center justify-center rounded-xl bg-brand/10 flex-shrink-0">
                      <i className={`${getCategoryIcon(selectedMaint.category)} text-brand text-2xl`} />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-charcoal">{selectedMaint.category} — {selectedMaint.title}</h2>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className="text-xs text-charcoal/40">{selectedMaint.id.slice(0, 12)}</span>
                        <span className="text-xs text-charcoal/40">{selectedMaint.unit || 'N/A'}</span>
                        <span className={`text-xs font-semibold capitalize ${urgencyConfig[selectedMaint.priority]?.color || 'text-charcoal/60'}`}>{selectedMaint.priority} urgency</span>
                      </div>
                    </div>
                  </div>
                  <span className={`text-xs font-bold px-3 py-1.5 rounded-full whitespace-nowrap ${statusConfig[selectedMaint.status]?.color}`}>
                    {statusConfig[selectedMaint.status]?.label}
                  </span>
                </div>

                <div className="px-6 py-5 space-y-6">
                  {selectedMaint.description && (
                    <div>
                      <p className="text-xs font-bold text-charcoal uppercase tracking-wide mb-2">Description</p>
                      <p className="text-sm text-charcoal/70 leading-relaxed">{selectedMaint.description}</p>
                    </div>
                  )}
                  {selectedMaint.landlord_notes && (
                    <div className="bg-brand/5 rounded-xl p-4 border border-brand/10">
                      <p className="text-xs font-bold text-charcoal uppercase tracking-wide mb-1">Landlord Notes</p>
                      <p className="text-sm text-charcoal/70 leading-relaxed">{selectedMaint.landlord_notes}</p>
                    </div>
                  )}
                  {selectedMaint.images.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-charcoal uppercase tracking-wide mb-2">Attached Photos</p>
                      <div className="flex gap-2 flex-wrap">
                        {selectedMaint.images.map((url, i) => (
                          <div key={i} className="w-24 h-20 rounded-xl overflow-hidden border border-black/5">
                            <img src={url} alt={`photo-${i}`} className="w-full h-full object-cover" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-bold text-charcoal uppercase tracking-wide mb-4">Progress Timeline</p>
                    <div className="space-y-0">
                      {buildTimeline(selectedMaint).map((step, idx, arr) => (
                        <div key={idx} className="flex gap-4">
                          <div className="flex flex-col items-center">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border-2 transition-all ${step.done ? 'bg-brand border-brand' : 'bg-white border-black/10'}`}>
                              {step.done ? <i className="ri-check-line text-white text-sm" /> : <div className="w-2 h-2 rounded-full bg-gray-300" />}
                            </div>
                            {idx < arr.length - 1 && (
                              <div className={`w-0.5 h-10 mt-1 ${step.done ? 'bg-brand/30' : 'bg-lightgray'}`} />
                            )}
                          </div>
                          <div className="pb-8">
                            <p className={`text-sm font-semibold ${step.done ? 'text-charcoal' : 'text-charcoal/40'}`}>{step.status}</p>
                            {step.date && <p className="text-xs text-charcoal/40 mt-0.5">{step.date}</p>}
                            <p className={`text-xs mt-1 leading-relaxed ${step.done ? 'text-charcoal/60' : 'text-charcoal/30'}`}>{step.note}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-black/5">
                    <div>
                      <p className="text-xs text-charcoal/40">Submitted</p>
                      <p className="text-sm font-medium text-charcoal mt-0.5">{formatDate(selectedMaint.created_at)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-charcoal/40">Preferred Time</p>
                      <p className="text-sm font-medium text-charcoal mt-0.5">{selectedMaint.preferred_time || 'Any time'}</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-3xl border border-black/5 p-12 text-center">
                <div className="w-14 h-14 mx-auto flex items-center justify-center rounded-full bg-lightgray mb-4">
                  <i className="ri-file-search-line text-charcoal/40 text-2xl" />
                </div>
                <p className="text-sm text-charcoal/60">Select a request to view details</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* New Request Modal */}
      {showNewRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-5 border-b border-black/5">
              <div>
                <h2 className="text-lg font-bold text-charcoal">Request Maintenance</h2>
                <p className="text-xs text-charcoal/60 mt-0.5">Your property manager gets notified instantly.</p>
              </div>
              <button onClick={() => { setShowNewRequest(false); setSelectedCategory(null); setSubmitted(false); }} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-lightgray transition-colors cursor-pointer">
                <i className="ri-close-line text-charcoal/60" />
              </button>
            </div>
            <div className="px-6 py-5">
              {submitted ? (
                <div className="flex flex-col items-center justify-center py-12 gap-4">
                  <div className="w-16 h-16 flex items-center justify-center rounded-full bg-green-100">
                    <i className="ri-checkbox-circle-fill text-green-500 text-3xl" />
                  </div>
                  <h3 className="text-lg font-bold text-charcoal">Request Submitted!</h3>
                  <p className="text-sm text-charcoal/60 text-center">Your maintenance request has been raised.</p>
                </div>
              ) : agreements.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
                  <div className="w-16 h-16 flex items-center justify-center rounded-full bg-amber-100">
                    <i className="ri-home-4-line text-amber-600 text-3xl" />
                  </div>
                  <h3 className="text-lg font-bold text-charcoal">No property on file yet</h3>
                  <p className="text-sm text-charcoal/60 max-w-xs">
                    You need a rental agreement shared by your landlord before you can submit a maintenance request.
                  </p>
                </div>
              ) : !selectedAgreement ? (
                <div>
                  <p className="text-sm font-semibold text-charcoal mb-4">Which property is this for?</p>
                  <div className="space-y-2">
                    {agreements.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => setSelectedAgreementId(a.id)}
                        className="w-full flex items-center gap-3 p-4 rounded-xl border border-black/5 hover:border-brand/40 hover:bg-brand/5 transition-all cursor-pointer text-left"
                      >
                        <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-brand/10 flex-shrink-0">
                          <i className="ri-home-4-line text-brand" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-charcoal truncate">{a.propertyAddress || a.flatNumber || 'Property'}</p>
                          <p className="text-xs text-charcoal/40 mt-0.5">{a.landlordName ? `Landlord: ${a.landlordName}` : a.agreementNumber}</p>
                        </div>
                        <i className="ri-arrow-right-s-line text-charcoal/30" />
                      </button>
                    ))}
                  </div>
                </div>
              ) : !selectedCategory ? (
                <div>
                  <p className="text-sm font-semibold text-charcoal mb-4">Select a category</p>
                  <div className="grid grid-cols-2 gap-3">
                    {maintenanceCategories.map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => setSelectedCategory(cat.id)}
                        className="flex items-start gap-3 p-4 rounded-xl border border-black/5 hover:border-brand/40 hover:bg-brand/5 transition-all cursor-pointer text-left group"
                      >
                        <div className={`w-10 h-10 flex items-center justify-center rounded-xl flex-shrink-0 ${cat.color}`}>
                          <i className={`${cat.icon} text-lg`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-semibold text-charcoal">{cat.label}</span>
                          <p className="text-xs text-charcoal/40 mt-0.5">Maintenance issue</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="flex items-center gap-3">
                    <button onClick={() => setSelectedCategory(null)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-lightgray transition-colors cursor-pointer">
                      <i className="ri-arrow-left-line text-charcoal/60" />
                    </button>
                    {(() => {
                      const cat = maintenanceCategories.find((c) => c.id === selectedCategory);
                      return cat ? (
                        <div className="flex items-center gap-2">
                          <div className={`w-8 h-8 flex items-center justify-center rounded-lg ${cat.color}`}>
                            <i className={`${cat.icon} text-sm`} />
                          </div>
                          <span className="text-sm font-bold text-charcoal">{cat.label}</span>
                        </div>
                      ) : null;
                    })()}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-charcoal/60 uppercase tracking-wide mb-1.5">Issue Summary <span className="text-red-400">*</span></label>
                    <input
                      value={requestForm.issue}
                      onChange={(e) => setRequestForm({ ...requestForm, issue: e.target.value })}
                      placeholder={issuePlaceholders[selectedCategory] ?? issuePlaceholders.other}
                      className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-charcoal/60 uppercase tracking-wide mb-1.5">Description</label>
                    <textarea
                      value={requestForm.description}
                      onChange={(e) => setRequestForm({ ...requestForm, description: e.target.value })}
                      placeholder="Describe the issue in detail..."
                      rows={3}
                      maxLength={500}
                      className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 resize-none"
                    />
                    <p className="text-xs text-charcoal/40 text-right mt-1">{requestForm.description.length}/500</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-charcoal/60 uppercase tracking-wide mb-1.5">Urgency</label>
                      <select
                        value={requestForm.urgency}
                        onChange={(e) => setRequestForm({ ...requestForm, urgency: e.target.value as 'low' | 'medium' | 'high' })}
                        className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 cursor-pointer"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-charcoal/60 uppercase tracking-wide mb-1.5">Preferred Time</label>
                      <input
                        value={requestForm.preferredTime}
                        onChange={(e) => setRequestForm({ ...requestForm, preferredTime: e.target.value })}
                        placeholder="e.g. Weekday mornings"
                        className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                      />
                    </div>
                  </div>
                  {submitError && (
                    <p className="text-xs text-red-500">{submitError}</p>
                  )}
                  <div className="flex items-center gap-3 pt-2">
                    <button
                      onClick={() => { setShowNewRequest(false); setSelectedCategory(null); }}
                      className="flex-1 py-3 rounded-xl border border-black/10 text-sm font-medium text-charcoal/60 hover:bg-lightgray transition-colors cursor-pointer whitespace-nowrap"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSubmitRequest}
                      disabled={!requestForm.issue.trim() || creatingMaint}
                      className="flex-1 py-3 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-dark transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
                    >
                      {creatingMaint ? 'Submitting...' : 'Submit Request'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

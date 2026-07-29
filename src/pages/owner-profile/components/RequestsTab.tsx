import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useOwnerMaintenanceRequests } from '@/hooks/useMaintenanceRequests';

type FilterStatus = 'all' | 'pending' | 'acknowledged' | 'in_progress' | 'resolved';

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Pending', color: 'text-charcoal/70', bg: 'bg-lightgray' },
  acknowledged: { label: 'Acknowledged', color: 'text-amber-700', bg: 'bg-amber-100' },
  in_progress: { label: 'In Progress', color: 'text-blue-700', bg: 'bg-blue-100' },
  resolved: { label: 'Resolved', color: 'text-green-700', bg: 'bg-green-100' },
};

const priorityConfig: Record<string, { label: string; color: string; dot: string }> = {
  high: { label: 'High', color: 'text-red-600', dot: 'bg-red-500' },
  medium: { label: 'Medium', color: 'text-amber-600', dot: 'bg-amber-400' },
  low: { label: 'Low', color: 'text-green-600', dot: 'bg-green-500' },
};

const categoryIcons: Record<string, string> = {
  plumbing: 'ri-drop-line',
  electrical: 'ri-flashlight-line',
  water: 'ri-water-flash-line',
  elevator: 'ri-arrow-up-down-line',
  carpentry: 'ri-hammer-line',
  painting: 'ri-brush-line',
  ac: 'ri-temp-cold-line',
  security: 'ri-shield-keyhole-line',
  housekeeping: 'ri-service-line',
};

function getCategoryIcon(category: string): string {
  return categoryIcons[category.toLowerCase()] ?? 'ri-tools-line';
}

function timeAgo(isoDate: string) {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function RequestsTab() {
  const { user } = useAuth();
  const { requests, loading, error, updateStatus } = useOwnerMaintenanceRequests(user?.id);
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [sortBy, setSortBy] = useState<'date' | 'priority'>('priority');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const handleStatusChange = async (id: string, status: 'acknowledged' | 'in_progress' | 'resolved') => {
    setUpdatingId(id);
    await updateStatus(id, status);
    setUpdatingId(null);
  };

  const filtered = requests
    .filter((r) => filter === 'all' || r.status === filter)
    .sort((a, b) => {
      if (sortBy === 'priority') {
        const order = { high: 0, medium: 1, low: 2 };
        return (order[a.priority as keyof typeof order] ?? 2) - (order[b.priority as keyof typeof order] ?? 2);
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  const counts = {
    all: requests.length,
    pending: requests.filter((r) => r.status === 'pending').length,
    acknowledged: requests.filter((r) => r.status === 'acknowledged').length,
    in_progress: requests.filter((r) => r.status === 'in_progress').length,
    resolved: requests.filter((r) => r.status === 'resolved').length,
  };

  const urgentCount = requests.filter((r) => r.priority === 'high' && r.status !== 'resolved').length;

  if (loading) {
    return (
      <div className="min-h-[300px] flex items-center justify-center">
        <div className="flex items-center gap-3">
          <i className="ri-loader-4-line animate-spin text-amber-500 text-xl" />
          <span className="text-sm text-charcoal/60">Loading maintenance requests...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-3xl border border-black/5 p-12 text-center">
        <div className="w-14 h-14 mx-auto flex items-center justify-center rounded-full bg-red-50 mb-4">
          <i className="ri-error-warning-line text-red-500 text-2xl" />
        </div>
        <p className="text-sm text-charcoal/60">Couldn't load maintenance requests: {error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {([
          { key: 'all' as const, label: 'All Requests', icon: 'ri-list-check-2', color: 'text-charcoal', bg: 'bg-lightgray' },
          { key: 'pending' as const, label: 'Pending', icon: 'ri-time-line', color: 'text-charcoal/70', bg: 'bg-lightgray' },
          { key: 'acknowledged' as const, label: 'Acknowledged', icon: 'ri-eye-line', color: 'text-amber-600', bg: 'bg-amber-100' },
          { key: 'in_progress' as const, label: 'In Progress', icon: 'ri-loader-4-line', color: 'text-blue-600', bg: 'bg-blue-100' },
          { key: 'resolved' as const, label: 'Resolved', icon: 'ri-checkbox-circle-line', color: 'text-green-600', bg: 'bg-green-100' },
        ]).map((s) => (
          <button
            key={s.key}
            onClick={() => setFilter(s.key)}
            className={`text-left p-4 rounded-xl border transition cursor-pointer ${filter === s.key ? 'border-amber-500 bg-amber-50/50' : 'border-black/5 bg-white hover:border-amber-300/50'}`}
          >
            <div className={`w-8 h-8 flex items-center justify-center rounded-lg mb-2 ${s.bg}`}>
              <i className={`${s.icon} ${s.color}`} />
            </div>
            <p className="text-xl font-bold text-charcoal">{counts[s.key]}</p>
            <p className="text-xs text-charcoal/60 mt-0.5">{s.label}</p>
          </button>
        ))}
      </div>

      {/* Urgent alert */}
      {urgentCount > 0 && (
        <div className="bg-red-50 border border-red-100 rounded-2xl px-5 py-4 flex items-center gap-3">
          <div className="w-8 h-8 flex items-center justify-center rounded-full bg-red-100 flex-shrink-0">
            <i className="ri-alarm-warning-line text-red-500 text-lg" />
          </div>
          <div>
            <p className="text-sm font-bold text-red-700">{urgentCount} urgent request{urgentCount > 1 ? 's' : ''} need{urgentCount === 1 ? 's' : ''} immediate attention</p>
            <p className="text-xs text-red-500 mt-0.5">High-priority issues affecting tenants&apos; daily life. Respond within 2 hours.</p>
          </div>
        </div>
      )}

      {/* Filter + Sort bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <p className="text-sm font-semibold text-charcoal">
          {filtered.length} request{filtered.length !== 1 ? 's' : ''}
          {filter !== 'all' && <span className="text-charcoal/40 font-normal"> · {statusConfig[filter]?.label || 'All'}</span>}
        </p>
        <div className="flex gap-2 flex-wrap">
          {(['all', 'pending', 'in_progress', 'resolved'] as FilterStatus[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition cursor-pointer whitespace-nowrap ${
                filter === f ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-charcoal/60 border-black/10 hover:border-amber-300'
              }`}
            >
              {f === 'all' ? 'All' : f === 'in_progress' ? 'In Progress' : f.charAt(0).toUpperCase() + f.slice(1)}
              {f !== 'all' && <span className="ml-1 opacity-70">({counts[f]})</span>}
            </button>
          ))}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'date' | 'priority')}
            className="border border-black/10 rounded-full px-3 py-1.5 text-xs text-charcoal focus:outline-none focus:border-amber-400 cursor-pointer"
          >
            <option value="priority">Sort by Priority</option>
            <option value="date">Sort by Date</option>
          </select>
        </div>
      </div>

      {/* Cards grid */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-3xl border border-black/5 p-12 text-center">
          <div className="w-14 h-14 mx-auto flex items-center justify-center rounded-full bg-lightgray mb-4">
            <i className="ri-inbox-line text-charcoal/40 text-2xl" />
          </div>
          <p className="text-sm text-charcoal/60">No requests in this category</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((req) => {
            const sc = statusConfig[req.status] || statusConfig.pending;
            const pc = priorityConfig[req.priority] || priorityConfig.low;
            const icon = getCategoryIcon(req.category);
            return (
              <div key={req.id} className={`bg-white rounded-2xl border p-5 transition ${req.priority === 'high' && req.status !== 'resolved' ? 'border-red-100' : 'border-black/5'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 flex items-center justify-center rounded-xl flex-shrink-0 ${req.priority === 'high' ? 'bg-red-50' : 'bg-amber-50'}`}>
                      <i className={`${icon} text-xl ${req.priority === 'high' ? 'text-red-500' : 'text-amber-600'}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-charcoal capitalize">{req.category} — {req.title}</p>
                        {req.priority === 'high' && req.status !== 'resolved' && (
                          <span className="text-[10px] font-bold bg-red-100 text-red-600 px-2 py-0.5 rounded-full">URGENT</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className="text-xs text-charcoal/40">{req.id.slice(0, 8)}</span>
                        <span className="text-xs text-charcoal/60 font-medium">{req.property_name}{req.unit ? ` · ${req.unit}` : ''}</span>
                        <span className="text-xs text-charcoal/40">{req.tenant_name}</span>
                        <span className="text-xs text-charcoal/40">{timeAgo(req.created_at)}</span>
                      </div>
                    </div>
                  </div>
                  <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${sc.bg} ${sc.color}`}>
                    {sc.label}
                  </span>
                </div>

                {req.description && (
                  <p className="mt-3 text-xs text-charcoal/60 leading-relaxed line-clamp-2">{req.description}</p>
                )}

                <div className="flex items-center gap-3 mt-3 flex-wrap">
                  <span className={`text-xs font-semibold flex items-center gap-1 ${pc.color}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${pc.dot}`} />
                    {pc.label} Priority
                  </span>
                  {req.images.length > 0 && (
                    <span className="text-xs text-charcoal/40 flex items-center gap-1">
                      <i className="ri-image-line text-sm" />{req.images.length} photo{req.images.length > 1 ? 's' : ''}
                    </span>
                  )}
                  {req.preferred_time && (
                    <span className="text-xs text-charcoal/40 flex items-center gap-1">
                      <i className="ri-time-line text-sm" />{req.preferred_time}
                    </span>
                  )}
                </div>

                {req.landlord_notes && (
                  <div className="mt-3 flex items-start gap-2 bg-amber-50/50 rounded-xl px-3 py-2 border border-amber-100">
                    <i className="ri-sticky-note-line text-amber-600 text-sm mt-0.5" />
                    <span className="text-xs text-charcoal">{req.landlord_notes}</span>
                  </div>
                )}

                <div className="mt-4 flex items-center gap-2 flex-wrap">
                  {req.status !== 'resolved' ? (
                    <>
                      {req.status === 'pending' && (
                        <button
                          onClick={() => handleStatusChange(req.id, 'acknowledged')}
                          disabled={updatingId === req.id}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
                        >
                          Acknowledge
                        </button>
                      )}
                      {(req.status === 'acknowledged' || req.status === 'pending') && (
                        <button
                          onClick={() => handleStatusChange(req.id, 'in_progress')}
                          disabled={updatingId === req.id}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
                        >
                          Mark In Progress
                        </button>
                      )}
                      {req.status === 'in_progress' && (
                        <button
                          onClick={() => handleStatusChange(req.id, 'resolved')}
                          disabled={updatingId === req.id}
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
                        >
                          Mark Resolved
                        </button>
                      )}
                      {updatingId === req.id && <i className="ri-loader-4-line animate-spin text-charcoal/40 text-sm" />}
                    </>
                  ) : (
                    <span className="text-xs text-green-600 flex items-center gap-1 font-medium">
                      <i className="ri-checkbox-circle-line" /> Resolved
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

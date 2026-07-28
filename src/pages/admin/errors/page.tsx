import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAdminErrorLogs, type ClientErrorLog } from '@/hooks/useAdminErrorLogs';
import { useToast } from '@/hooks/useToast';

type SourceFilter = 'all' | ClientErrorLog['source'];

const sourceLabel: Record<ClientErrorLog['source'], string> = {
  error_boundary: 'React crash',
  window_error: 'Uncaught error',
  unhandled_rejection: 'Unhandled promise',
};

const sourceBadge: Record<ClientErrorLog['source'], string> = {
  error_boundary: 'bg-red-50 text-red-600',
  window_error: 'bg-amber-50 text-amber-600',
  unhandled_rejection: 'bg-blue-50 text-blue-600',
};

export default function AdminErrorsPage() {
  const { addToast } = useToast();
  const { logs, loading, dismiss } = useAdminErrorLogs();
  const [filter, setFilter] = useState<SourceFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = logs.filter((l) => (filter === 'all' ? true : l.source === filter));

  const handleDismiss = async (id: string) => {
    const ok = await dismiss(id);
    if (ok) addToast('Log entry dismissed', 'success');
    else addToast('Failed to dismiss log entry', 'error');
  };

  return (
    <div className="min-h-screen bg-offwhite pt-20 pb-16">
      <div className="max-w-5xl mx-auto px-4 md:px-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pt-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link to="/admin" className="text-xs text-charcoal/40 hover:text-charcoal transition-colors">← Admin Dashboard</Link>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-charcoal">Client Error Logs</h1>
            <p className="text-sm text-charcoal/60 mt-1">Crashes and uncaught errors reported by real browser sessions, most recent 200.</p>
          </div>
        </div>

        <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
          {(['all', 'error_boundary', 'window_error', 'unhandled_rejection'] as SourceFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-full text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap flex-shrink-0 ${
                filter === f ? 'bg-amber-500 text-white' : 'bg-white text-charcoal/60 hover:text-charcoal border border-black/5'
              }`}
            >
              {f === 'all' ? 'All' : sourceLabel[f]}
              {f !== 'all' && (
                <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-bold ${filter === f ? 'bg-white/20 text-white' : 'bg-lightgray text-charcoal/40'}`}>
                  {logs.filter((l) => l.source === f).length}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {loading ? (
            <div className="bg-white rounded-3xl border border-black/5 p-12 text-center text-sm text-charcoal/40">Loading error logs…</div>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-3xl border border-black/5 p-12 text-center">
              <div className="w-14 h-14 flex items-center justify-center mx-auto mb-4 bg-lightgray rounded-full">
                <i className="ri-checkbox-circle-line text-2xl text-charcoal/40" />
              </div>
              <h3 className="text-base font-bold text-charcoal mb-2">No errors logged</h3>
              <p className="text-sm text-charcoal/60">Nothing has crashed for a real user recently.</p>
            </div>
          ) : (
            filtered.map((log) => (
              <div key={log.id} className="bg-white rounded-3xl border border-black/5 overflow-hidden">
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${sourceBadge[log.source]}`}>
                          {sourceLabel[log.source]}
                        </span>
                        <span className="text-xs text-charcoal/40">
                          {new Date(log.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-charcoal break-words">{log.message}</p>
                      {log.url && <p className="text-xs text-charcoal/50 mt-1 break-all">{log.url}</p>}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                        className="text-xs font-semibold text-amber-600 hover:text-amber-700 cursor-pointer whitespace-nowrap"
                      >
                        {expandedId === log.id ? 'Hide' : 'Details'}
                      </button>
                      <button
                        onClick={() => handleDismiss(log.id)}
                        className="text-xs font-semibold text-charcoal/40 hover:text-red-500 cursor-pointer whitespace-nowrap"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>

                  {expandedId === log.id && (
                    <div className="mt-4 pt-4 border-t border-black/5 space-y-3 text-xs text-charcoal/70">
                      {log.stack && (
                        <div>
                          <p className="font-semibold text-charcoal/50 uppercase tracking-wide mb-1">Stack</p>
                          <pre className="whitespace-pre-wrap break-all bg-offwhite rounded-lg p-3 max-h-60 overflow-y-auto">{log.stack}</pre>
                        </div>
                      )}
                      {log.componentStack && (
                        <div>
                          <p className="font-semibold text-charcoal/50 uppercase tracking-wide mb-1">Component stack</p>
                          <pre className="whitespace-pre-wrap break-all bg-offwhite rounded-lg p-3 max-h-60 overflow-y-auto">{log.componentStack}</pre>
                        </div>
                      )}
                      {log.userAgent && <p><span className="font-semibold text-charcoal/50">User agent:</span> {log.userAgent}</p>}
                      {log.userId && <p><span className="font-semibold text-charcoal/50">User ID:</span> {log.userId}</p>}
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

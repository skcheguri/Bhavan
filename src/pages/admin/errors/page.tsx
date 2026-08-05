import { useState } from 'react';
import { Link } from 'react-router';
import { useAdminErrorLogs, type ClientErrorLog } from '@/hooks/useAdminErrorLogs';
import { useErrorRateAlerts, describeAlert } from '@/hooks/useErrorRateAlerts';
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
  const { activeAlerts, settings, acknowledge, updateSettings } = useErrorRateAlerts();
  const [filter, setFilter] = useState<SourceFilter>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [thresholdInput, setThresholdInput] = useState('');
  const [windowInput, setWindowInput] = useState('');
  const [webhookInput, setWebhookInput] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  const filtered = logs.filter((l) => (filter === 'all' ? true : l.source === filter));

  const handleDismiss = async (id: string) => {
    const ok = await dismiss(id);
    if (ok) addToast('Log entry dismissed', 'success');
    else addToast('Failed to dismiss log entry', 'error');
  };

  const handleAcknowledge = async (id: string) => {
    const ok = await acknowledge(id);
    if (ok) addToast('Alert acknowledged', 'success');
    else addToast('Failed to acknowledge alert', 'error');
  };

  const openSettings = () => {
    setThresholdInput(String(settings?.thresholdCount ?? 10));
    setWindowInput(String(settings?.windowMinutes ?? 15));
    setWebhookInput(settings?.webhookUrl ?? '');
    setShowSettings(true);
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    const { error } = await updateSettings({
      thresholdCount: Number(thresholdInput) || 10,
      windowMinutes: Number(windowInput) || 15,
      webhookUrl: webhookInput.trim(),
    });
    setSavingSettings(false);
    if (error) addToast(error, 'error');
    else {
      addToast('Alert settings saved', 'success');
      setShowSettings(false);
    }
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
          <button
            onClick={openSettings}
            className="text-xs font-semibold text-charcoal/50 hover:text-charcoal cursor-pointer whitespace-nowrap flex items-center gap-1"
          >
            <i className="ri-settings-3-line" /> Alert settings
          </button>
        </div>

        {activeAlerts.length > 0 && (
          <div className="space-y-3 mb-6">
            {activeAlerts.map((alert) => (
              <div key={alert.id} className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <i className="ri-alarm-warning-line text-red-500 text-lg mt-0.5" />
                  <div>
                    <p className="text-sm font-bold text-red-700">
                      {describeAlert(alert).headline}
                    </p>
                    <p className="text-xs text-red-600/80 mt-0.5">
                      {/* window_end is the freshness marker -- an ignored alert is
                          refreshed in place daily (migration 063), so this timestamp
                          updates while created_at keeps the incident's first raise. */}
                      {describeAlert(alert).context} — {describeAlert(alert).timeLabel} {new Date(alert.windowEnd).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      {new Date(alert.windowEnd).getTime() - new Date(alert.createdAt).getTime() > 24 * 60 * 60 * 1000
                        ? `, ongoing since ${new Date(alert.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short' })}`
                        : ''}
                      {alert.webhookNotified ? ', webhook notified' : alert.webhookError ? ', webhook failed' : ''}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleAcknowledge(alert.id)}
                  className="text-xs font-semibold text-red-700 bg-white border border-red-200 rounded-full px-3 py-1.5 hover:bg-red-100 cursor-pointer whitespace-nowrap"
                >
                  Acknowledge
                </button>
              </div>
            ))}
          </div>
        )}

        {showSettings && (
          <div className="bg-white rounded-2xl border border-black/5 p-5 mb-6 space-y-3">
            <h3 className="text-sm font-bold text-charcoal">Error rate alert settings</h3>
            <p className="text-xs text-charcoal/50">
              A background job checks every 5 minutes and raises an alert above when the error count in the trailing
              window crosses the threshold.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-charcoal mb-1">Threshold (errors)</label>
                <input
                  type="number"
                  min={1}
                  value={thresholdInput}
                  onChange={(e) => setThresholdInput(e.target.value)}
                  className="w-full px-3 py-2 bg-lightgray rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-charcoal mb-1">Window (minutes)</label>
                <input
                  type="number"
                  min={1}
                  value={windowInput}
                  onChange={(e) => setWindowInput(e.target.value)}
                  className="w-full px-3 py-2 bg-lightgray rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-charcoal mb-1">Webhook URL (optional)</label>
              <input
                type="url"
                placeholder="https://hooks.slack.com/services/…"
                value={webhookInput}
                onChange={(e) => setWebhookInput(e.target.value)}
                className="w-full px-3 py-2 bg-lightgray rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              <p className="text-[11px] text-charcoal/40 mt-1">
                Posts a JSON payload with a "text" field -- compatible with Slack/Discord incoming webhooks. Leave blank until one is set up.
              </p>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSaveSettings}
                disabled={savingSettings}
                className="bg-charcoal text-white text-xs font-semibold px-4 py-2 rounded-full hover:bg-black transition-colors disabled:opacity-60 cursor-pointer"
              >
                {savingSettings ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={() => setShowSettings(false)}
                className="text-xs font-semibold text-charcoal/50 px-4 py-2 hover:text-charcoal cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

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

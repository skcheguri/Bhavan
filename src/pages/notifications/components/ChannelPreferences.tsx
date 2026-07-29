import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useNotificationPreferences, type NotificationChannel } from '@/hooks/useNotificationPreferences';

const channelMeta: Record<NotificationChannel, { label: string; icon: string; desc: string; color: string }> = {
  push_enabled: { label: 'Push', icon: 'ri-smartphone-line', desc: 'Instant device alerts', color: 'text-green-600' },
  sms_enabled: { label: 'SMS', icon: 'ri-message-2-line', desc: 'Critical fallback via text', color: 'text-amber-600' },
  email_enabled: { label: 'Email', icon: 'ri-mail-line', desc: 'Detailed summaries', color: 'text-blue-600' },
};

const channelOrder: NotificationChannel[] = ['push_enabled', 'sms_enabled', 'email_enabled'];

export default function ChannelPreferences() {
  const { user } = useAuth();
  const { preferences, loading, toggle } = useNotificationPreferences(user?.id);
  const [expanded, setExpanded] = useState<string | null>(null);

  if (loading) {
    return <div className="text-sm text-charcoal/40 py-6 text-center">Loading preferences...</div>;
  }

  return (
    <div className="space-y-3">
      {preferences.map((pref) => {
        const isOpen = expanded === pref.category;
        const activeCount = channelOrder.filter((ch) => pref[ch]).length;

        return (
          <div
            key={pref.category}
            className={`bg-white rounded-2xl border transition overflow-hidden ${isOpen ? 'border-amber-200' : 'border-black/5 hover:border-black/10'}`}
          >
            {/* Header row */}
            <button
              onClick={() => setExpanded(isOpen ? null : pref.category)}
              className="w-full flex items-center justify-between p-4 sm:p-5 text-left cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-amber-50">
                  <i className="ri-notification-3-line text-sm text-amber-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-charcoal">{pref.label}</p>
                  <p className="text-xs text-charcoal/40 mt-0.5">
                    {activeCount} of {channelOrder.length} channels active
                    {pref.criticalOnly && ' · SMS for critical only'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">
                  {activeCount} active
                </span>
                <div className="w-5 h-5 flex items-center justify-center">
                  <i className={isOpen ? 'ri-arrow-up-s-line text-charcoal/40 text-sm' : 'ri-arrow-down-s-line text-charcoal/40 text-sm'} />
                </div>
              </div>
            </button>

            {/* Expanded toggles */}
            {isOpen && (
              <div className="px-4 sm:px-5 pb-5 space-y-3">
                <div className="h-px bg-lightgray" />
                {channelOrder.map((ch) => {
                  const meta = channelMeta[ch];
                  const enabled = pref[ch];
                  const isCriticalOnly = ch === 'sms_enabled' && pref.criticalOnly && enabled;

                  return (
                    <div key={ch} className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-lightgray">
                          <i className={`${meta.icon} text-sm ${enabled ? meta.color : 'text-charcoal/40'}`} />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-charcoal">{meta.label}</p>
                          <p className="text-xs text-charcoal/40">{meta.desc}</p>
                          {isCriticalOnly && (
                            <p className="text-[10px] text-amber-600 font-semibold mt-0.5">Only critical events</p>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => toggle(pref.category, ch)}
                        aria-label={`${enabled ? 'Disable' : 'Enable'} ${meta.label} for ${pref.label}`}
                        aria-pressed={enabled}
                        className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer flex-shrink-0 ${enabled ? 'bg-amber-500' : 'bg-gray-200'}`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0'}`}
                        />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

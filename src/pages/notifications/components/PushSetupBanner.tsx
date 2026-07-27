import { useState } from 'react';
import { usePushNotifications } from '@/hooks/usePushNotifications';

export default function PushSetupBanner() {
  const { permission, subscribed, requestPermission, isSupported, unsubscribe } = usePushNotifications();
  const [loading, setLoading] = useState(false);

  if (!isSupported) {
    return (
      <div className="bg-lightgray border border-black/5 rounded-2xl p-4 mb-6 flex items-center gap-3">
        <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-lightgray flex-shrink-0">
          <i className="ri-notification-off-line text-charcoal/40" />
        </div>
        <div>
          <p className="text-sm font-semibold text-charcoal/60">Push notifications not supported</p>
          <p className="text-xs text-charcoal/40">Your browser does not support push notifications. SMS and email fallbacks are active.</p>
        </div>
      </div>
    );
  }

  if (permission === 'denied') {
    return (
      <div className="bg-red-50 border border-red-100 rounded-2xl p-4 mb-6 flex items-center gap-3">
        <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-red-100 flex-shrink-0">
          <i className="ri-notification-off-line text-red-500" />
        </div>
        <div>
          <p className="text-sm font-semibold text-red-700">Push notifications blocked</p>
          <p className="text-xs text-red-600/80">You denied notification permissions. Enable them in browser settings, or rely on SMS and email fallbacks.</p>
        </div>
      </div>
    );
  }

  if (subscribed) {
    return (
      <div className="bg-green-50 border border-green-100 rounded-2xl p-4 mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-green-100 flex-shrink-0">
            <i className="ri-notification-3-line text-green-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-green-700">Push notifications enabled</p>
            <p className="text-xs text-green-600/80">You'll receive push alerts. SMS and email fallbacks stay active for critical events.</p>
          </div>
        </div>
        <button
          onClick={unsubscribe}
          className="flex-shrink-0 text-xs font-semibold text-green-700 hover:text-green-800 transition-colors cursor-pointer whitespace-nowrap px-3 py-1.5 rounded-lg hover:bg-green-100"
        >
          Disable
        </button>
      </div>
    );
  }

  return (
    <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 mb-6 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-amber-100 flex-shrink-0">
          <i className="ri-notification-3-line text-amber-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-amber-800">Enable push notifications</p>
          <p className="text-xs text-amber-700/80">Get instant alerts on your device. If push fails, SMS and email fallbacks kick in automatically.</p>
        </div>
      </div>
      <button
        onClick={async () => {
          setLoading(true);
          await requestPermission();
          setLoading(false);
        }}
        disabled={loading}
        className="flex-shrink-0 px-4 py-2 rounded-full bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60"
      >
        {loading ? 'Enabling...' : 'Enable'}
      </button>
    </div>
  );
}
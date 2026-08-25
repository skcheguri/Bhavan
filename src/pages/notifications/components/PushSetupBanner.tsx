import { useState } from 'react';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';

export default function PushSetupBanner() {
  const { user } = useAuth();
  const { permission, subscribed, requestPermission, isSupported, unsubscribe, sendTestPush, error } =
    usePushNotifications();
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);

  if (!isSupported) {
    return (
      <div className="bg-lightgray border border-black/5 rounded-2xl p-4 mb-6 flex items-center gap-3">
        <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-lightgray flex-shrink-0">
          <i className="ri-notification-off-line text-charcoal/40" />
        </div>
        <div>
          <p className="text-sm font-semibold text-charcoal/60">Push notifications not supported</p>
          <p className="text-xs text-charcoal/40">
            This browser can't receive push notifications. Try a different browser or device to turn them on.
          </p>
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
          <p className="text-xs text-red-600/80">
            You denied notification permission for this site. Re-enable it in your browser settings to turn push back on.
          </p>
        </div>
      </div>
    );
  }

  if (subscribed) {
    return (
      <div className="bg-green-50 border border-green-100 rounded-2xl p-4 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-green-100 flex-shrink-0">
            <i className="ri-notification-3-line text-green-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-green-700">Push notifications enabled on this device</p>
            <p className="text-xs text-green-600/80">
              You'll get alerts for the categories you've enabled below.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={async () => {
              setTesting(true);
              const { error: testError } = await sendTestPush();
              setTesting(false);
              if (testError) addToast(testError, 'error');
              else addToast('Test notification sent to this device.', 'success');
            }}
            disabled={testing}
            className="text-xs font-semibold text-green-700 hover:text-green-800 transition-colors cursor-pointer whitespace-nowrap px-3 py-1.5 rounded-lg hover:bg-green-100 disabled:opacity-60"
          >
            {testing ? 'Sending…' : 'Send test'}
          </button>
          <button
            onClick={unsubscribe}
            className="text-xs font-semibold text-charcoal/50 hover:text-charcoal transition-colors cursor-pointer whitespace-nowrap px-3 py-1.5 rounded-lg hover:bg-green-100"
          >
            Disable
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-amber-100 flex-shrink-0">
          <i className="ri-notification-3-line text-amber-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-amber-800">Enable push notifications</p>
          <p className="text-xs text-amber-700/80">
            {user
              ? 'Get instant alerts on this device when someone messages you, responds to an inquiry, a payment lands, or an agreement is shared.'
              : 'Sign in to enable push notifications on this device.'}
          </p>
          {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
        </div>
      </div>
      <button
        onClick={async () => {
          setLoading(true);
          await requestPermission();
          setLoading(false);
        }}
        disabled={loading || !user}
        className="flex-shrink-0 px-4 py-2 rounded-full bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {loading ? 'Enabling…' : 'Enable'}
      </button>
    </div>
  );
}

import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Capacitor } from '@capacitor/core';

/**
 * App-wide handling for pushes that arrive on a native device.
 *
 * Two things were missing, both invisible until a real push hit a real
 * device:
 *
 * 1. A push arriving while the app is OPEN was dropped on the floor.
 *    Android does not raise a notification for a message delivered to a
 *    foregrounded app -- it hands it to the app instead, and with no
 *    listener Capacitor logged "No listeners found for event
 *    pushNotificationReceived" and that was that. Confirmed on device.
 *
 * 2. Tapping a notification did nothing beyond opening the app. The
 *    action_url that every notification carries -- the whole reason a
 *    chat push can open the right conversation -- was never read.
 *
 * Mounted app-wide rather than on the notifications screen, which is
 * where the registration listeners live. A tap that launches the app from
 * cold has to find its handler already bound; if it only binds when the
 * notifications page mounts, the tap that opened the app is the one tap
 * guaranteed to be missed.
 */
export function useNativePushRouting(): void {
  const navigate = useNavigate();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let cancelled = false;
    const removers: Array<() => void> = [];

    (async () => {
      const { PushNotifications } = await import('@capacitor/push-notifications');

      // Foreground arrival: no OS notification is shown, so at minimum
      // refresh the in-app bell. This is the same event the web path
      // raises from onMessage, so the listeners stay shared.
      const received = await PushNotifications.addListener('pushNotificationReceived', () => {
        window.dispatchEvent(new CustomEvent('bhavan:push-received'));
      });

      // Tap: go where the notification points.
      const tapped = await PushNotifications.addListener(
        'pushNotificationActionPerformed',
        (action) => {
          window.dispatchEvent(new CustomEvent('bhavan:push-received'));
          const target = action.notification?.data?.actionUrl;
          // Only in-app paths. A notification is attacker-influenced data
          // in the general case, and navigate() would happily take an
          // absolute URL somewhere else.
          if (typeof target === 'string' && target.startsWith('/')) {
            navigate(target);
          } else {
            navigate('/notifications');
          }
        }
      );

      if (cancelled) {
        received.remove();
        tapped.remove();
        return;
      }
      removers.push(() => received.remove(), () => tapped.remove());
    })();

    return () => {
      cancelled = true;
      removers.forEach((remove) => remove());
    };
  }, [navigate]);
}

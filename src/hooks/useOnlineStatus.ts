import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';

/**
 * Whether the device currently has a network connection.
 *
 * navigator.onLine alone is not enough on a phone. Android reports online
 * for a connection that cannot reach anything -- a captive portal, a
 * hotel wifi that has not been accepted, a train tunnel where the radio
 * says "connected" for another twenty seconds. @capacitor/network reads
 * the OS connectivity state, which changes when the connection actually
 * does.
 *
 * Web keeps the browser events, which are accurate enough there and cost
 * nothing.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  );

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    let cancelled = false;

    if (Capacitor.isNativePlatform()) {
      (async () => {
        const { Network } = await import('@capacitor/network');
        const status = await Network.getStatus();
        if (!cancelled) setOnline(status.connected);

        const handle = await Network.addListener('networkStatusChange', (s) => {
          setOnline(s.connected);
        });
        if (cancelled) {
          handle.remove();
          return;
        }
        cleanup = () => handle.remove();
      })();
    } else {
      const goOnline = () => setOnline(true);
      const goOffline = () => setOnline(false);
      window.addEventListener('online', goOnline);
      window.addEventListener('offline', goOffline);
      cleanup = () => {
        window.removeEventListener('online', goOnline);
        window.removeEventListener('offline', goOffline);
      };
    }

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return online;
}

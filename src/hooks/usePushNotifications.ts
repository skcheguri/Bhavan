import { useState, useEffect, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { getToken, onMessage, deleteToken } from 'firebase/messaging';
import { getFirebaseMessaging, VAPID_PUBLIC_KEY } from '@/lib/firebase';
import { getSupabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

export type PushPermission = 'default' | 'granted' | 'denied' | 'unsupported';

interface PushState {
  permission: PushPermission;
  token: string | null;
  subscribed: boolean;
  error: string | null;
}

// Human-readable enough to tell "Chrome on my laptop" from "my phone" in
// a future device list; deliberately not a fingerprint.
function describeDevice(): string {
  if (Capacitor.isNativePlatform()) return `${Capacitor.getPlatform()} app`;
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari'
    : /Firefox\//.test(ua) ? 'Firefox'
    : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows'
    : /Android/.test(ua) ? 'Android'
    : /iPhone|iPad/.test(ua) ? 'iOS'
    : /Mac OS X/.test(ua) ? 'macOS'
    : /Linux/.test(ua) ? 'Linux'
    : 'device';
  return `${browser} on ${os}`;
}

/**
 * Registers the FCM service worker and resolves only once it is genuinely
 * active.
 *
 * `register()` resolves as soon as the registration object exists -- the
 * worker itself is usually still `installing` at that point. getToken()
 * calls PushManager.subscribe(), which throws "Subscription failed - no
 * active Service Worker" against a registration that has no active worker.
 * On a first visit losing that race is the normal case, not the rare one,
 * which is why no device ever managed to register a token.
 */
async function registerActiveServiceWorker(): Promise<ServiceWorkerRegistration> {
  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  if (registration.active) return registration;

  const pending = registration.installing ?? registration.waiting;
  if (!pending) {
    // Nothing in flight and nothing active: fall back to the browser's own
    // "some worker controls this scope" signal.
    await navigator.serviceWorker.ready;
    return registration;
  }

  await new Promise<void>((resolve, reject) => {
    const settle = (fn: () => void) => {
      clearTimeout(timer);
      pending.removeEventListener('statechange', onStateChange);
      fn();
    };
    const onStateChange = () => {
      if (pending.state === 'activated') settle(resolve);
      // 'redundant' means the install failed outright -- surfacing that
      // beats hanging until the timeout.
      else if (pending.state === 'redundant') {
        settle(() => reject(new Error('The notification service worker failed to install.')));
      }
    };
    const timer = setTimeout(
      () => settle(() => reject(new Error('The notification service worker took too long to start.'))),
      10_000
    );
    pending.addEventListener('statechange', onStateChange);
    // It can activate between the checks above and the listener attaching.
    onStateChange();
  });

  return registration;
}

export function usePushNotifications() {
  const { user } = useAuth();
  const [state, setState] = useState<PushState>({
    permission: 'default',
    token: null,
    subscribed: false,
    error: null,
  });
  // Guards against double-registering the native listeners under React
  // StrictMode's double-invoked effects.
  const nativeListenersBound = useRef(false);

  const isNative = Capacitor.isNativePlatform();

  const persistToken = useCallback(
    async (token: string): Promise<string | null> => {
      const supabase = getSupabase();
      if (!supabase || !user) return 'Not signed in';
      // Via RPC, not a direct upsert: RLS on user_push_tokens evaluates
      // the UPDATE against the EXISTING row, so an upsert conflicting on
      // a token still owned by a previously signed-in user is rejected.
      // register_push_token (migration 068) reassigns it server-side,
      // scoped to auth.uid(). The error is returned rather than
      // swallowed -- silently failing here is what made the previous
      // user keep receiving this device's notifications.
      const { error } = await supabase.rpc('register_push_token', {
        p_token: token,
        p_device_name: describeDevice(),
      });
      return error ? error.message : null;
    },
    [user]
  );

  // Reflect the browser's current permission, and re-attach the token if
  // this device already granted push in a previous session.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (isNative) {
        const { PushNotifications } = await import('@capacitor/push-notifications');
        const status = await PushNotifications.checkPermissions();
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          permission: status.receive === 'granted' ? 'granted' : status.receive === 'denied' ? 'denied' : 'default',
          subscribed: status.receive === 'granted',
        }));
        return;
      }

      if (!('Notification' in window) || !('serviceWorker' in navigator)) {
        setState((prev) => ({ ...prev, permission: 'unsupported' }));
        return;
      }
      const messaging = await getFirebaseMessaging();
      if (cancelled) return;
      if (!messaging) {
        setState((prev) => ({ ...prev, permission: 'unsupported' }));
        return;
      }

      const current = Notification.permission as PushPermission;
      setState((prev) => ({ ...prev, permission: current }));

      if (current === 'granted' && user) {
        try {
          const registration = await registerActiveServiceWorker();
          const token = await getToken(messaging, {
            vapidKey: VAPID_PUBLIC_KEY,
            serviceWorkerRegistration: registration,
          });
          if (cancelled || !token) return;
          await persistToken(token);
          setState((prev) => ({ ...prev, token, subscribed: true }));
        } catch {
          // Token refresh can fail transiently (offline, SW not ready) --
          // the banner just stays in its un-subscribed state.
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isNative, user, persistToken]);

  // Foreground messages don't raise an OS notification on their own; the
  // service worker only handles background ones. Surfacing them is left
  // to the in-app notification bell, which already polls.
  useEffect(() => {
    if (isNative) return;
    let unsubscribeFn: (() => void) | undefined;
    (async () => {
      const messaging = await getFirebaseMessaging();
      if (!messaging) return;
      unsubscribeFn = onMessage(messaging, () => {
        window.dispatchEvent(new CustomEvent('bhavan:push-received'));
      });
    })();
    return () => unsubscribeFn?.();
  }, [isNative]);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!user) {
      setState((prev) => ({ ...prev, error: 'Sign in first to enable notifications on this device.' }));
      return false;
    }

    try {
      if (isNative) {
        const { PushNotifications } = await import('@capacitor/push-notifications');
        const status = await PushNotifications.requestPermissions();
        if (status.receive !== 'granted') {
          setState((prev) => ({ ...prev, permission: 'denied', subscribed: false, error: 'Permission denied' }));
          return false;
        }

        if (!nativeListenersBound.current) {
          nativeListenersBound.current = true;
          // The APNs/FCM token arrives asynchronously via this event --
          // register() itself resolves before the token exists.
          await PushNotifications.addListener('registration', async (t) => {
            const persistError = await persistToken(t.value);
            if (persistError) {
              setState((prev) => ({ ...prev, subscribed: false, error: persistError }));
              return;
            }
            setState((prev) => ({ ...prev, token: t.value, subscribed: true, error: null }));
          });
          await PushNotifications.addListener('registrationError', (err) => {
            setState((prev) => ({ ...prev, error: String(err?.error ?? 'Device registration failed'), subscribed: false }));
          });
        }

        await PushNotifications.register();
        setState((prev) => ({ ...prev, permission: 'granted' }));
        return true;
      }

      if (!('Notification' in window) || !('serviceWorker' in navigator)) {
        setState((prev) => ({ ...prev, permission: 'unsupported' }));
        return false;
      }

      const messaging = await getFirebaseMessaging();
      if (!messaging) {
        setState((prev) => ({ ...prev, permission: 'unsupported' }));
        return false;
      }

      const result = await Notification.requestPermission();
      if (result !== 'granted') {
        setState((prev) => ({
          ...prev,
          permission: result as PushPermission,
          subscribed: false,
          error: 'Permission denied by user',
        }));
        return false;
      }

      const registration = await registerActiveServiceWorker();
      const token = await getToken(messaging, {
        vapidKey: VAPID_PUBLIC_KEY,
        serviceWorkerRegistration: registration,
      });
      if (!token) {
        setState((prev) => ({ ...prev, permission: 'granted', subscribed: false, error: 'Could not register this device for push.' }));
        return false;
      }

      const persistError = await persistToken(token);
      if (persistError) {
        setState({ permission: 'granted', token: null, subscribed: false, error: persistError });
        return false;
      }
      setState({ permission: 'granted', token, subscribed: true, error: null });
      return true;
    } catch (err) {
      // Keep the DOMException name, not just the message. "Registration
      // failed - push service error" alone is ambiguous -- AbortError
      // points at the browser's push service or a VAPID key that doesn't
      // belong to this Firebase project, NotAllowedError at permission,
      // InvalidStateError at a stale subscription under a different key.
      // Without the name every one of those reads identically.
      const name = err instanceof Error && err.name && err.name !== 'Error' ? ` (${err.name})` : '';
      setState((prev) => ({
        ...prev,
        error: err instanceof Error ? `${err.message}${name}` : 'Could not enable push notifications',
      }));
      return false;
    }
  }, [isNative, persistToken, user]);

  const unsubscribe = useCallback(async () => {
    const supabase = getSupabase();

    // Delete the row first: the user asked to stop receiving pushes, and
    // that must hold even if revoking the token itself fails. Passing
    // null clears every token for this account, which is what makes this
    // work on native -- there the token isn't re-read after an app
    // restart, so the old `if (state.token)` guard silently did nothing
    // and delivery continued after the user turned it off.
    if (supabase) {
      await supabase.rpc('unregister_push_tokens', { p_token: state.token });
    }

    try {
      if (isNative) {
        const { PushNotifications } = await import('@capacitor/push-notifications');
        await PushNotifications.unregister();
      } else {
        const messaging = await getFirebaseMessaging();
        if (messaging) await deleteToken(messaging);
      }
    } catch {
      // Token already invalid on the FCM side -- the DB row is gone,
      // which is what actually stops delivery.
    }

    setState((prev) => ({ ...prev, token: null, subscribed: false }));
  }, [isNative, state.token]);

  // Proves the whole path end to end (device token -> FCM -> this
  // device), which permission state alone can't.
  const sendTestPush = useCallback(async (): Promise<{ error: string | null }> => {
    const supabase = getSupabase();
    if (!supabase) return { error: 'Supabase not connected' };
    const { data, error } = await supabase.functions.invoke('send-push', { body: { test: true } });
    if (error) return { error: error.message };
    if (!data) return { error: 'No response from the push service.' };
    if (data.sent === 0) {
      // Report what actually happened. Previously any FCM-side failure
      // was reported as "no registered devices", which is a flatly wrong
      // diagnosis when the real cause is a rejected send.
      if (data.failed > 0) {
        return { error: data.firstError || 'Firebase rejected the send for this device.' };
      }
      return { error: data.skipped || 'No registered devices for this account.' };
    }
    return { error: null };
  }, []);

  return {
    permission: state.permission,
    token: state.token,
    subscribed: state.subscribed,
    error: state.error,
    requestPermission,
    unsubscribe,
    sendTestPush,
    isSupported: state.permission !== 'unsupported',
    isNative,
  };
}

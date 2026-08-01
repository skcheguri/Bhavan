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
    async (token: string) => {
      const supabase = getSupabase();
      if (!supabase || !user) return;
      // Conflict on fcm_token (unique, migration 065): re-registering the
      // same device -- including after signing in as someone else --
      // moves the row rather than duplicating it.
      await supabase.from('user_push_tokens').upsert(
        {
          user_id: user.id,
          fcm_token: token,
          device_name: describeDevice(),
          active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'fcm_token' }
      );
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
          const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
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
            await persistToken(t.value);
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

      const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      const token = await getToken(messaging, {
        vapidKey: VAPID_PUBLIC_KEY,
        serviceWorkerRegistration: registration,
      });
      if (!token) {
        setState((prev) => ({ ...prev, permission: 'granted', subscribed: false, error: 'Could not register this device for push.' }));
        return false;
      }

      await persistToken(token);
      setState({ permission: 'granted', token, subscribed: true, error: null });
      return true;
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Could not enable push notifications',
      }));
      return false;
    }
  }, [isNative, persistToken, user]);

  const unsubscribe = useCallback(async () => {
    const supabase = getSupabase();

    // Delete the row first: the user asked to stop receiving pushes, and
    // that must hold even if revoking the token itself fails.
    if (supabase && state.token) {
      await supabase.from('user_push_tokens').delete().eq('fcm_token', state.token);
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
    if (data?.sent === 0) return { error: data?.skipped || 'No registered devices for this account.' };
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

import { useState, useEffect, useCallback } from 'react';

export type PushPermission = 'default' | 'granted' | 'denied' | 'unsupported';

interface PushState {
  permission: PushPermission;
  fcmToken: string | null;
  subscribed: boolean;
  error: string | null;
}

export function usePushNotifications() {
  const [state, setState] = useState<PushState>({
    permission: 'default',
    fcmToken: null,
    subscribed: false,
    error: null,
  });

  useEffect(() => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      setState((prev) => ({ ...prev, permission: 'unsupported' }));
      return;
    }
    setState((prev) => ({ ...prev, permission: Notification.permission as PushPermission }));
  }, []);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      setState((prev) => ({ ...prev, permission: 'unsupported' }));
      return false;
    }

    try {
      const result = await Notification.requestPermission();
      const granted = result === 'granted';
      setState((prev) => ({
        ...prev,
        permission: result as PushPermission,
        subscribed: granted,
        // Simulate an FCM token for the mock flow
        fcmToken: granted ? `mock-fcm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` : null,
        error: granted ? null : 'Permission denied by user',
      }));
      return granted;
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Request failed',
      }));
      return false;
    }
  }, []);

  const unsubscribe = useCallback(() => {
    setState((prev) => ({
      ...prev,
      subscribed: false,
      fcmToken: null,
    }));
  }, []);

  const simulateFallback = useCallback((channel: 'sms' | 'email') => {
    // Hook consumer can call this when push fails and SMS/email fallback is needed
    return channel;
  }, []);

  return {
    permission: state.permission,
    fcmToken: state.fcmToken,
    subscribed: state.subscribed,
    error: state.error,
    requestPermission,
    unsubscribe,
    simulateFallback,
    isSupported: state.permission !== 'unsupported',
  };
}
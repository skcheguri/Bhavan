import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { getSupabase } from '@/lib/supabase';
import { completeNativeOAuth, isNativePlatform } from '@/lib/nativeOAuth';

/**
 * Catches the OAuth redirect deep link on native and establishes the
 * session, then hands off to the shared /auth/callback screen for the
 * pending-role reconciliation the web path also runs.
 *
 * The consent happens in the system browser (see signInWithGoogle); the OS
 * reopens the app on com.bhavan.app://auth/callback via the manifest's
 * intent-filter, and MainActivity's singleTask launch mode delivers that
 * URL to this listener rather than spawning a second instance.
 *
 * Mounted app-wide (App.tsx) for the same reason as push routing: a cold
 * start triggered by the redirect must find the handler already bound.
 */
export function useNativeOAuthCallback(): void {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isNativePlatform()) return;

    let cancelled = false;
    let remove: (() => void) | undefined;

    (async () => {
      const { App } = await import('@capacitor/app');
      const handle = await App.addListener('appUrlOpen', async ({ url }) => {
        const supabase = getSupabase();
        if (!supabase) return;

        const { handled, error } = await completeNativeOAuth(supabase, url);
        if (!handled) return;

        // Close the Custom Tab left open behind the app.
        try {
          const { Browser } = await import('@capacitor/browser');
          await Browser.close();
        } catch {
          // No open browser to close (or the plugin is unavailable) -- harmless.
        }

        // Reuse the web callback screen: on error it shows the same
        // "Google sign-in failed" panel; on success it reconciles the
        // pending tenant/owner role and routes onward.
        navigate(error ? `/auth/callback?error_description=${encodeURIComponent(error)}` : '/auth/callback');
      });

      if (cancelled) {
        handle.remove();
        return;
      }
      remove = () => handle.remove();
    })();

    return () => {
      cancelled = true;
      if (remove) remove();
    };
  }, [navigate]);
}

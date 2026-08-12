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
      const { Browser } = await import('@capacitor/browser');

      const appHandle = await App.addListener('appUrlOpen', async ({ url }) => {
        const supabase = getSupabase();
        if (!supabase) return;

        const { handled, error } = await completeNativeOAuth(supabase, url);
        if (!handled) return;

        // Close the Custom Tab left open behind the app.
        try {
          await Browser.close();
        } catch {
          // No open browser to close (or the plugin is unavailable) -- harmless.
        }

        // Reuse the web callback screen: on error it shows the same
        // "Google sign-in failed" panel; on success it reconciles the
        // pending tenant/owner role and routes onward.
        navigate(error ? `/auth/callback?error_description=${encodeURIComponent(error)}` : '/auth/callback');
      });

      // If the user dismisses the Custom Tab without finishing (system back),
      // no appUrlOpen ever fires, so the "Connecting to Google..." button
      // would spin forever. Broadcast the close so the sign-in screens can
      // reset. On the success path the deep link has already navigated away,
      // so this is a harmless no-op there.
      const browserHandle = await Browser.addListener('browserFinished', () => {
        window.dispatchEvent(new CustomEvent('bhavan:oauth-browser-closed'));
      });

      if (cancelled) {
        appHandle.remove();
        browserHandle.remove();
        return;
      }
      remove = () => {
        appHandle.remove();
        browserHandle.remove();
      };
    })();

    return () => {
      cancelled = true;
      if (remove) remove();
    };
  }, [navigate]);
}

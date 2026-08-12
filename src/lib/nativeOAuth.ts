import { Capacitor } from '@capacitor/core';
import type { SupabaseClient } from '@supabase/supabase-js';

// Google OAuth from inside the Capacitor Android WebView.
//
// Google blocks its consent page in embedded WebViews (the
// `disallowed_useragent` / 403 you get if you just let signInWithOAuth
// navigate the WebView). The supported path is to open the provider URL in
// the system browser (Custom Tabs on Android) and catch the redirect back
// into the app via a custom-scheme deep link.
//
// The redirect target below must also be added to the Supabase Auth
// "Redirect URLs" allow-list, or Supabase refuses to bounce the browser
// back to it (see ANDROID_RELEASE.md). The app registers the scheme in
// AndroidManifest.xml so the OS reopens the app on this URL.
export const NATIVE_OAUTH_REDIRECT = 'com.bhavan.app://auth/callback';

/** True only inside a native Capacitor shell, never in the web build. */
export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Completes a native OAuth sign-in from the deep-link URL the system
 * browser redirected to. Establishes the Supabase session in the app's
 * WebView so the normal auth-state listener picks the user up.
 *
 * Handles both Supabase flows so it works whichever the client is on:
 *   - PKCE   -> `?code=...`            -> exchangeCodeForSession
 *   - implicit -> `#access_token=...`  -> setSession
 * The PKCE code verifier was stored by signInWithOAuth in this same
 * WebView, so the exchange finds it even though the consent happened in a
 * separate browser process.
 *
 * Returns a user-facing error string, or null on success. `handled` is
 * false when the URL isn't an auth redirect we recognise, so a listener
 * can ignore unrelated deep links.
 */
export async function completeNativeOAuth(
  supabase: SupabaseClient,
  url: string
): Promise<{ handled: boolean; error: string | null }> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { handled: false, error: null };
  }

  // Only our OAuth callback deep link; unrelated links (e.g. a future
  // share or notification deep link) are left alone.
  if (!url.includes('auth/callback')) return { handled: false, error: null };

  const errorDescription =
    parsed.searchParams.get('error_description') || parsed.searchParams.get('error');
  if (errorDescription) {
    return { handled: true, error: errorDescription.replace(/\+/g, ' ') };
  }

  const code = parsed.searchParams.get('code');
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return { handled: true, error: error ? error.message : null };
  }

  const hash = new URLSearchParams(parsed.hash.replace(/^#/, ''));
  const accessToken = hash.get('access_token');
  const refreshToken = hash.get('refresh_token');
  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    return { handled: true, error: error ? error.message : null };
  }

  // Looked like our callback but carried neither a code nor tokens.
  return { handled: true, error: 'Google sign-in did not complete. Please try again.' };
}

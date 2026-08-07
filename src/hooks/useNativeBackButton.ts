import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { dismissTopLayer } from '@/hooks/useDismissableLayer';

/**
 * Makes Android's hardware back button navigate instead of quitting.
 *
 * Without this, a single back press from anywhere in the app closed it
 * outright -- verified on a device: navigating home -> listings and
 * pressing back once dropped straight to the launcher, discarding the
 * whole session. Android users treat back as "up one screen", so an app
 * that exits from a nested route reads as broken.
 *
 * The rule is the ordinary one: go back through history while there is
 * history, and only exit at the root. Exiting is still reachable, it just
 * takes reaching the start of the stack first.
 *
 * Web is unaffected -- browsers already own the back button, and the
 * plugin is dynamically imported so it never enters the web bundle.
 */
export function useNativeBackButton(): void {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let remove: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      const { App } = await import('@capacitor/app');
      const handle = await App.addListener('backButton', ({ canGoBack }) => {
        // canGoBack reflects the WebView's own history, which the router's
        // pushState navigations feed into, so it tracks in-app screens
        // rather than only full page loads.
        // Close what is on top of the page first. Back with a modal open
        // used to navigate away, dismissing the modal only as a side
        // effect of leaving the screen -- and taking whatever the user was
        // doing with it.
        if (dismissTopLayer()) return;

        if (canGoBack) {
          window.history.back();
        } else {
          App.exitApp();
        }
      });

      // The component can unmount before addListener resolves.
      if (cancelled) {
        handle.remove();
        return;
      }
      remove = () => handle.remove();
    })();

    return () => {
      cancelled = true;
      remove?.();
    };
  }, []);
}

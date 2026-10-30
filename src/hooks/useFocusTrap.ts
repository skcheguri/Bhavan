import { useEffect, useRef } from 'react';

/**
 * Keyboard focus management for a modal dialog. Attach the returned ref to the
 * dialog panel (the element that should contain focus) and render the dialog
 * only while it is open, so the hook mounts with it.
 *
 * While mounted it:
 *   - moves focus to the first focusable element inside the panel (or the
 *     panel itself) so keyboard and screen-reader users land in the dialog;
 *   - keeps Tab / Shift+Tab cycling within the panel instead of escaping to
 *     the page behind it;
 *   - calls `onEscape` when Escape is pressed (pair it with the dialog's own
 *     close handler); and
 *   - restores focus to whatever was focused before the dialog opened, on
 *     unmount.
 *
 * This complements useDismissableLayer (which handles the Android back button);
 * together they make a modal behave for keyboard, screen-reader and mobile
 * users alike. The panel should also carry role="dialog" aria-modal="true" and
 * an accessible name, and tabIndex={-1} so the panel itself can receive focus.
 */
const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function useFocusTrap<T extends HTMLElement = HTMLDivElement>(onEscape?: () => void) {
  const ref = useRef<T>(null);
  // Held in a ref so a new onEscape identity each render never re-runs the
  // effect (which would re-trap focus mid-interaction).
  const escapeRef = useRef(onEscape);
  escapeRef.current = onEscape;

  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusables = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );

    (focusables()[0] ?? container).focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        escapeRef.current?.();
        return;
      }
      if (e.key !== 'Tab') return;
      const els = focusables();
      if (els.length === 0) {
        e.preventDefault();
        return;
      }
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    container.addEventListener('keydown', onKeyDown);
    return () => {
      container.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, []);

  return ref;
}

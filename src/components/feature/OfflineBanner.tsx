import { useOnlineStatus } from '@/hooks/useOnlineStatus';

/**
 * Says the app is offline, so a screen that cannot load reads as "no
 * signal" rather than "this is broken".
 *
 * Before this, losing connection mid-session produced spinners that never
 * resolved and empty states that looked like genuinely empty accounts --
 * the two failure modes users report as "the app stopped working". The
 * problem was never the loading state, it was that nothing said why.
 */
export default function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div
      role="status"
      className="sticky top-0 z-40 bg-charcoal text-white px-4 py-2 flex items-center justify-center gap-2 text-xs font-medium"
    >
      <i className="ri-wifi-off-line text-sm" />
      You're offline. Saved listings and downloaded documents are still available.
    </div>
  );
}

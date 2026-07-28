import { getSupabase } from '@/lib/supabase';

type ErrorSource = 'error_boundary' | 'window_error' | 'unhandled_rejection';

// Fire-and-forget by design -- a logging call must never itself throw or
// block the UI. Best-effort only; if Supabase is unreachable the error
// just isn't recorded, same as it wasn't before this existed.
export function logClientError(
  error: unknown,
  source: ErrorSource,
  extra?: { componentStack?: string }
): void {
  try {
    const supabase = getSupabase();
    if (!supabase) return;

    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack ?? null : null;

    supabase.auth.getUser().then(({ data }) => {
      supabase
        .from('client_error_logs')
        .insert({
          message: message.slice(0, 2000),
          stack: stack?.slice(0, 8000) ?? null,
          component_stack: extra?.componentStack?.slice(0, 8000) ?? null,
          source,
          url: window.location.href,
          user_agent: navigator.userAgent,
          user_id: data.user?.id ?? null,
        })
        .then(() => {});
    });
  } catch {
    // Logging must never crash the app it's trying to report on.
  }
}

export function installGlobalErrorLogging(): void {
  window.addEventListener('error', (event) => {
    logClientError(event.error ?? event.message, 'window_error');
  });
  window.addEventListener('unhandledrejection', (event) => {
    logClientError(event.reason, 'unhandled_rejection');
  });
}

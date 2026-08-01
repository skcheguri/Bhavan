import { Component, type ErrorInfo, type ReactNode } from 'react';
import { logClientError } from '@/lib/errorLogging';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

// A deploy replaces the hashed route chunks, but a tab that's already
// open still holds the OLD index.html referencing the old filenames. Those
// files are gone, and vercel.json's SPA rewrite serves index.html for the
// miss -- so the browser gets HTML where it expected JavaScript. Confirmed
// in production: requesting a stale chunk returns 200 text/html, and both
// error shapes below appear in client_error_logs.
//
// The fix is a one-shot reload, which fetches the new index.html and the
// chunk names that go with it. The sessionStorage flag is what keeps a
// genuinely broken build from becoming an infinite reload loop -- if the
// error recurs after reloading once, we fall through to the normal error
// screen instead.
const CHUNK_RELOAD_FLAG = 'bhavan_chunk_reloaded';

function isStaleChunkError(error: Error): boolean {
  const message = `${error?.message ?? ''}`;
  return (
    /Failed to fetch dynamically imported module/i.test(message) ||
    /error loading dynamically imported module/i.test(message) ||
    /is not a valid JavaScript MIME type/i.test(message) ||
    /Importing a module script failed/i.test(message)
  );
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (isStaleChunkError(error)) {
      let alreadyReloaded = false;
      try {
        alreadyReloaded = sessionStorage.getItem(CHUNK_RELOAD_FLAG) === '1';
        if (!alreadyReloaded) sessionStorage.setItem(CHUNK_RELOAD_FLAG, '1');
      } catch {
        // Private mode / storage disabled -- skip auto-reload rather than
        // risk looping without a way to record that we already tried.
        alreadyReloaded = true;
      }
      if (!alreadyReloaded) {
        window.location.reload();
        return;
      }
    }

    console.error('Unhandled error in app:', error, info.componentStack);
    logClientError(error, 'error_boundary', { componentStack: info.componentStack ?? undefined });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="relative flex flex-col items-center justify-center min-h-[70vh] text-center px-4 bg-white">
          <div className="w-20 h-20 mx-auto flex items-center justify-center rounded-2xl bg-lightgray mb-6">
            <i className="ri-error-warning-line text-3xl text-charcoal/40" />
          </div>
          <h2 className="text-xl md:text-2xl font-semibold text-charcoal">Something Went Wrong</h2>
          <p className="mt-3 text-sm md:text-base text-charcoal/40 max-w-sm mx-auto leading-relaxed">
            This page ran into an unexpected error. Try reloading, or head back home.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            {/* Plain <a>/full reload rather than client-side nav -- guarantees a
                clean remount even if the error left app-level state corrupted. */}
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2.5 rounded-full bg-charcoal text-white text-sm font-semibold hover:bg-gray-800 transition-colors whitespace-nowrap cursor-pointer"
            >
              Reload Page
            </button>
            <a
              href="/"
              className="px-6 py-2.5 rounded-full border border-black/10 text-sm font-medium text-charcoal/60 hover:bg-lightgray transition-colors whitespace-nowrap"
            >
              Go Home
            </a>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled error in app:', error, info.componentStack);
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

import { BrowserRouter, useLocation } from "react-router";
import { AppRoutes } from "./router";
import { Suspense, useEffect } from "react";
import Navbar from "./components/feature/Navbar";
import Footer from "./components/feature/Footer";
import AuthProvider from "./components/feature/AuthProvider";
import SubscriptionProvider from "./components/feature/SubscriptionProvider";
import { ToastProvider } from "./hooks/useToast";
import ToastContainer from "./components/feature/ToastContainer";
import ErrorBoundary from "./components/feature/ErrorBoundary";
import { applyRouteSeo } from "./lib/seo";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

// Route-level titles/descriptions/canonicals -- runs on every
// navigation. Data-driven pages (listing detail) call applySeo again
// once their content loads, which happens after this and wins.
function RouteSeo() {
  const { pathname } = useLocation();
  useEffect(() => {
    applyRouteSeo(pathname);
  }, [pathname]);
  return null;
}

function RouteLoadingFallback() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <i className="ri-loader-4-line animate-spin text-3xl text-brand" />
    </div>
  );
}

function RoutesWithErrorBoundary() {
  // Keying by pathname remounts the boundary (clearing an error) on the
  // next navigation, rather than leaving the fallback stuck up forever
  // once tripped -- Navbar/Footer stay mounted and usable either way
  // since the boundary only wraps the routed page content. Suspense
  // covers the lazy-loaded route chunks (see router/config.tsx); it sits
  // inside the boundary so a failed chunk load is also caught as an error
  // rather than left as an unhandled rejection.
  const { pathname } = useLocation();
  return (
    <ErrorBoundary key={pathname}>
      <Suspense fallback={<RouteLoadingFallback />}>
        <AppRoutes />
      </Suspense>
    </ErrorBoundary>
  );
}

function AppShell() {
  // /admin/login is a deliberately separate surface (see its own file
  // comment) -- it shouldn't sit under the consumer Navbar/Footer, which
  // would visually contradict its own dedicated sign-in form.
  const { pathname } = useLocation();
  const isStandaloneAdminLogin =
    pathname === '/admin/login' || pathname === '/admin/mfa-setup' || pathname === '/admin/mfa-challenge';

  return (
    <div className="min-h-screen flex flex-col">
      {!isStandaloneAdminLogin && <Navbar />}
      <main className="flex-1">
        <RoutesWithErrorBoundary />
      </main>
      {!isStandaloneAdminLogin && <Footer />}
      <ToastContainer />
    </div>
  );
}

function App() {
  return (
      <AuthProvider>
        <SubscriptionProvider>
          <ToastProvider>
            <BrowserRouter basename={__BASE_PATH__}>
              <ScrollToTop />
              <RouteSeo />
              <AppShell />
            </BrowserRouter>
          </ToastProvider>
        </SubscriptionProvider>
      </AuthProvider>
  );
}

export default App;

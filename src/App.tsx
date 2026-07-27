import { BrowserRouter, useLocation } from "react-router-dom";
import { AppRoutes } from "./router";
import { useEffect } from "react";
import { I18nextProvider } from "react-i18next";
import i18n from "./i18n";
import Navbar from "./components/feature/Navbar";
import Footer from "./components/feature/Footer";
import AuthProvider from "./components/feature/AuthProvider";
import SubscriptionProvider from "./components/feature/SubscriptionProvider";
import { ToastProvider } from "./hooks/useToast";
import ToastContainer from "./components/feature/ToastContainer";
import ErrorBoundary from "./components/feature/ErrorBoundary";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function RoutesWithErrorBoundary() {
  // Keying by pathname remounts the boundary (clearing an error) on the
  // next navigation, rather than leaving the fallback stuck up forever
  // once tripped -- Navbar/Footer stay mounted and usable either way
  // since the boundary only wraps the routed page content.
  const { pathname } = useLocation();
  return (
    <ErrorBoundary key={pathname}>
      <AppRoutes />
    </ErrorBoundary>
  );
}

function AppShell() {
  // /admin/login is a deliberately separate surface (see its own file
  // comment) -- it shouldn't sit under the consumer Navbar/Footer, which
  // would visually contradict its own dedicated sign-in form.
  const { pathname } = useLocation();
  const isStandaloneAdminLogin = pathname === '/admin/login';

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
    <I18nextProvider i18n={i18n}>
      <AuthProvider>
        <SubscriptionProvider>
          <ToastProvider>
            <BrowserRouter basename={__BASE_PATH__}>
              <ScrollToTop />
              <AppShell />
            </BrowserRouter>
          </ToastProvider>
        </SubscriptionProvider>
      </AuthProvider>
    </I18nextProvider>
  );
}

export default App;

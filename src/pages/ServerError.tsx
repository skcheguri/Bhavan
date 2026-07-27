import { useNavigate } from "react-router-dom";

export default function ServerError() {
  const navigate = useNavigate();

  const handleRetry = () => {
    navigate(0);
  };

  return (
    <div className="relative flex flex-col items-center justify-center h-screen text-center px-4 bg-white">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 right-1/4 w-72 h-72 rounded-full bg-amber-50 blur-3xl opacity-60" />
        <div className="absolute bottom-1/3 left-1/4 w-96 h-96 rounded-full bg-lightgray blur-3xl opacity-50" />
      </div>
      <div className="relative z-10">
        <div className="w-20 h-20 mx-auto flex items-center justify-center rounded-2xl bg-lightgray mb-6">
          <i className="ri-wifi-off-line text-3xl text-charcoal/40" />
        </div>
        <h1 className="text-7xl md:text-9xl font-black text-gray-100 select-none">500</h1>
        <h2 className="text-xl md:text-2xl font-semibold text-charcoal mt-2">Something Went Wrong</h2>
        <p className="mt-3 text-sm md:text-base text-charcoal/40 max-w-sm mx-auto leading-relaxed">
          We are experiencing a temporary issue on our end. Please try refreshing the page, or come back in a few minutes.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={handleRetry}
            className="px-6 py-2.5 rounded-full bg-charcoal text-white text-sm font-semibold hover:bg-gray-800 transition-colors whitespace-nowrap cursor-pointer"
          >
            Refresh Page
          </button>
          <a
            href="/contact"
            className="px-6 py-2.5 rounded-full border border-black/10 text-sm font-medium text-charcoal/60 hover:bg-lightgray transition-colors whitespace-nowrap"
          >
            Contact Support
          </a>
        </div>
        <p className="mt-6 text-xs text-charcoal/30">Error ID: BGL-500-{Date.now().toString(36).toUpperCase()}</p>
      </div>
    </div>
  );
}
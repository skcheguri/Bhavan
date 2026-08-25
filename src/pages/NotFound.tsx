import { Link } from "react-router";

export default function NotFound() {
  return (
    <div className="relative flex flex-col items-center justify-center h-screen text-center px-4 bg-white">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 rounded-full bg-amber-50 blur-3xl opacity-60" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full bg-lightgray blur-3xl opacity-50" />
      </div>
      <div className="relative z-10">
        <div className="w-20 h-20 mx-auto flex items-center justify-center rounded-2xl bg-amber-50 mb-6">
          <i className="ri-compass-3-line text-3xl text-amber-500" />
        </div>
        <h1 className="text-7xl md:text-9xl font-black text-gray-100 select-none">404</h1>
        <h2 className="text-xl md:text-2xl font-semibold text-charcoal mt-2">Page Not Found</h2>
        <p className="mt-3 text-sm md:text-base text-charcoal/40 max-w-sm mx-auto leading-relaxed">
          The page you are looking for does not exist or has been moved. Let&apos;s get you back to browsing homes.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            to="/"
            className="px-6 py-2.5 rounded-full bg-charcoal text-white text-sm font-semibold hover:bg-gray-800 transition-colors whitespace-nowrap"
          >
            Back to Home
          </Link>
          <Link
            to="/listings"
            className="px-6 py-2.5 rounded-full border border-black/10 text-sm font-medium text-charcoal/60 hover:bg-lightgray transition-colors whitespace-nowrap"
          >
            Browse Listings
          </Link>
        </div>
      </div>
    </div>
  );
}

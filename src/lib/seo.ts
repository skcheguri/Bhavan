// Client-side SEO for an SPA. Google's crawler executes JS, so titles,
// descriptions, canonicals, and JSON-LD set here are indexed. Social
// link-preview scrapers (WhatsApp, Facebook, Twitter) generally do NOT
// execute JS -- they see only the static defaults in index.html. True
// per-listing link previews therefore need SSR or prerendering; that is
// a deliberate follow-up, not something this module can provide.

export interface SeoInput {
  title: string;
  description?: string;
  /** Set on private/authenticated surfaces so they never get indexed. */
  noindex?: boolean;
  /** Absolute URL for og:image (e.g. a listing photo). */
  image?: string | null;
  /** JSON-LD structured data blob, replaced wholesale on each call. */
  jsonLd?: Record<string, unknown> | null;
}

const SITE_NAME = 'Bhavan';
const DEFAULT_DESCRIPTION =
  "India's broker-free rental platform. Verified owners, verified tenants, direct connections — no brokers, no commission.";

function upsertMeta(attr: 'name' | 'property', key: string, content: string | null) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (content === null) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

const JSON_LD_ID = 'bhavan-jsonld';

export function applySeo(input: SeoInput) {
  const fullTitle = input.title === SITE_NAME ? input.title : `${input.title} | ${SITE_NAME}`;
  const description = input.description ?? DEFAULT_DESCRIPTION;
  // Canonical strips query/hash -- filter and UTM parameters must not
  // create duplicate indexed URLs.
  const canonical = window.location.origin + window.location.pathname;

  document.title = fullTitle;
  upsertMeta('name', 'description', description);
  upsertCanonical(canonical);

  upsertMeta('name', 'robots', input.noindex ? 'noindex, nofollow' : null);

  upsertMeta('property', 'og:site_name', SITE_NAME);
  upsertMeta('property', 'og:title', fullTitle);
  upsertMeta('property', 'og:description', description);
  upsertMeta('property', 'og:type', 'website');
  upsertMeta('property', 'og:url', canonical);
  upsertMeta('property', 'og:image', input.image ?? null);
  upsertMeta('name', 'twitter:card', input.image ? 'summary_large_image' : 'summary');
  upsertMeta('name', 'twitter:title', fullTitle);
  upsertMeta('name', 'twitter:description', description);

  const existing = document.getElementById(JSON_LD_ID);
  if (input.jsonLd) {
    const script = existing ?? document.createElement('script');
    script.id = JSON_LD_ID;
    (script as HTMLScriptElement).type = 'application/ld+json';
    script.textContent = JSON.stringify(input.jsonLd);
    if (!existing) document.head.appendChild(script);
  } else {
    existing?.remove();
  }
}

interface RouteMeta {
  title: string;
  description?: string;
  noindex?: boolean;
}

// Longest-prefix match against these; dynamic pages (listing detail)
// additionally call applySeo themselves once their data loads, which
// runs after this route-level default and wins.
const ROUTE_META: [string, RouteMeta][] = [
  ['/listings/', { title: 'Listing Details', description: 'View verified rental listing details on Bhavan.' }],
  ['/listings', { title: 'Browse Rental Listings', description: 'Browse verified, broker-free rental homes across India. Filter by city, budget, and amenities — connect directly with owners.' }],
  ['/list-property', { title: 'List Your Property Free', description: 'List your rental property free on Bhavan. Reach verified tenants directly — no brokers, no commission.' }],
  ['/how-it-works', { title: 'How It Works', description: 'How Bhavan connects verified tenants and owners directly: browse, connect, chat in-app, and close with digital agreements.' }],
  ['/about', { title: 'About Us', description: 'Bhavan is India\'s broker-free rental platform, built on verified users and direct owner-tenant connections.' }],
  ['/contact', { title: 'Contact Us', description: 'Questions or feedback? Reach the Bhavan team.' }],
  ['/community', { title: 'Community Forum', description: 'Ask questions and share experiences with renters and owners in the Bhavan community.' }],
  ['/feedback', { title: 'Reviews & Feedback', description: 'Read reviews from tenants and owners on Bhavan.' }],
  ['/subscription', { title: 'Pro Plans for Landlords', description: 'Upgrade to Bhavan Pro: advanced analytics, bulk receipts, priority placement, and more. One-time payment, no auto-charges.' }],
  ['/terms', { title: 'Terms of Service' }],
  ['/privacy', { title: 'Privacy Policy' }],
  ['/cookies', { title: 'Cookie Policy' }],
  ['/accessibility', { title: 'Accessibility' }],
  ['/login', { title: 'Sign In', noindex: true }],
  ['/signup', { title: 'Create Account', noindex: true }],
  ['/auth/callback', { title: 'Signing In…', noindex: true }],
  ['/reset-password', { title: 'Reset Password', noindex: true }],
  ['/aadhaar-verify', { title: 'Aadhaar Verification', noindex: true }],
  // Owner-only, and its contents belong to one building. Never indexed.
  ['/society', { title: 'My Society', noindex: true }],
  ['/tenant-profile', { title: 'Tenant Dashboard', noindex: true }],
  ['/owner-profile', { title: 'Owner Dashboard', noindex: true }],
  ['/scan/', { title: 'Property QR', noindex: true }],
  ['/tax-forms', { title: 'Tax Forms', noindex: true }],
  ['/rent-receipts', { title: 'Rent Receipts', noindex: true }],
  ['/rental-agreements', { title: 'Rental Agreements', noindex: true }],
  ['/notifications', { title: 'Notifications', noindex: true }],
  ['/rent-payment', { title: 'Rent Payments', noindex: true }],
  ['/admin', { title: 'Admin', noindex: true }],
  ['/403', { title: 'Access Denied', noindex: true }],
  ['/500', { title: 'Something Went Wrong', noindex: true }],
];

export function applyRouteSeo(pathname: string) {
  if (pathname === '/') {
    applySeo({ title: SITE_NAME, description: DEFAULT_DESCRIPTION });
    return;
  }
  const match = ROUTE_META.find(([prefix]) => pathname === prefix || pathname.startsWith(prefix));
  if (match) {
    applySeo(match[1]);
  } else {
    applySeo({ title: 'Page Not Found', noindex: true });
  }
}

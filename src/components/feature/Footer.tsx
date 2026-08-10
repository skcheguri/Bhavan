import { Link, useLocation } from 'react-router';
import { useAuth } from '@/hooks/useAuth';

/**
 * The pages the full footer belongs on.
 *
 * It is a marketing surface: four columns of links a visitor uses while
 * deciding whether to trust Bhavan. On a dashboard or a payment screen
 * it is just weight under someone's work.
 *
 * The legal pages are in the list on purpose. So are About, Contact and
 * How It Works -- they are where the footer's own links go, and the
 * navbar carries only Browse Listings, List Property and How It Works,
 * so dropping the footer there would strand a visitor who followed it.
 */
const FULL_FOOTER_ROUTES = new Set([
  '/',
  '/about',
  '/how-it-works',
  '/contact',
  '/terms',
  '/privacy',
  '/cookies',
  '/accessibility',
]);

const LEGAL_LINKS = [
  { to: '/terms', label: 'Terms' },
  { to: '/privacy', label: 'Privacy' },
  { to: '/cookies', label: 'Cookies' },
  { to: '/accessibility', label: 'Accessibility' },
];

/**
 * Everywhere else. These four pages had no route into them but this
 * footer -- nothing in the navbar or settings links to them, and they
 * only cross-reference each other -- so scoping the full footer without
 * this would leave a privacy policy reachable only by typing the URL.
 */
function SlimFooter() {
  return (
    <footer className="border-t border-black/5 bg-white">
      <div className="w-full px-4 md:px-8 lg:px-12 py-5 flex flex-col sm:flex-row items-center justify-between gap-3">
        <p className="text-xs text-charcoal/40">&copy; 2025 Bhavan</p>
        <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          {LEGAL_LINKS.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="text-xs text-charcoal/50 hover:text-charcoal transition-colors"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}

export default function Footer() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const isTenant = user?.role === 'tenant';

  if (!FULL_FOOTER_ROUTES.has(pathname)) return <SlimFooter />;

  // Dashboard/verification links shouldn't dead-end a signed-out visitor
  // on a "please sign in" page, and shouldn't send a signed-in user to a
  // profile page for a role that isn't theirs -- both always resolve to
  // the current user's own real destination.
  const dashboardHref = !user ? '/signup' : user.role === 'admin' ? '/admin' : user.role === 'owner' ? '/owner-profile' : '/tenant-profile';
  const verificationHref = !user ? '/signup' : '/aadhaar-verify';

  const columns = [
    {
      title: 'For Renters',
      links: [
        { to: '/listings', label: 'Browse Listings' },
        { to: dashboardHref, label: 'My Dashboard' },
        { to: '/community', label: 'Community Forum' },
        { to: '/feedback', label: 'Reviews & Feedback' },
      ],
    },
    {
      title: 'For Landlords',
      links: [
        ...(isTenant ? [] : [{ to: '/list-property', label: 'List Property' }]),
        { to: dashboardHref, label: 'Owner Dashboard' },
        { to: verificationHref, label: 'Verification Process' },
        { to: '/how-it-works', label: 'How It Works' },
      ],
    },
    {
      title: 'Company',
      links: [
        { to: '/about', label: 'About Us' },
        { to: '/how-it-works', label: 'How It Works' },
        { to: '/aadhaar-verify', label: 'Trust & Safety' },
        { to: '/contact', label: 'Contact' },
      ],
    },
    {
      title: 'Legal',
      links: [
        { to: '/terms', label: 'Terms of Service' },
        { to: '/privacy', label: 'Privacy Policy' },
        { to: '/cookies', label: 'Cookie Policy' },
        { to: '/accessibility', label: 'Accessibility' },
      ],
    },
  ];

  return (
    <footer className="bg-charcoal text-white">
      <div className="w-full px-4 md:px-8 lg:px-12 py-16 md:py-20">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12">
          {columns.map((col) => (
            <div key={col.title}>
              <h4 className="text-base font-semibold mb-4">{col.title}</h4>
              <div className="w-10 h-0.5 bg-brand mb-4" />
              <ul className="space-y-3">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      to={link.to}
                      className="text-sm text-white/50 hover:text-white transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-16 pt-8 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <img
              src="/favicon.svg"
              alt="Bhavan"
              className="h-8 w-8 object-contain"
            />
            <div>
              <span className="text-xl font-bold">Bhavan</span>
              <p className="text-xs text-white/50 mt-0.5">Empowering Indian renters since 2025</p>
            </div>
          </div>

          <div className="flex flex-col items-center md:items-end gap-3">
            <p className="text-sm text-white/50">&copy; 2025 Bhavan. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <a href="#" className="text-white/50 hover:text-white transition-colors" rel="nofollow">
                <div className="w-6 h-6 flex items-center justify-center">
                  <i className="ri-linkedin-fill text-lg" />
                </div>
              </a>
              <a href="#" className="text-white/50 hover:text-white transition-colors" rel="nofollow">
                <div className="w-6 h-6 flex items-center justify-center">
                  <i className="ri-twitter-x-fill text-lg" />
                </div>
              </a>
              <a href="#" className="text-white/50 hover:text-white transition-colors" rel="nofollow">
                <div className="w-6 h-6 flex items-center justify-center">
                  <i className="ri-instagram-line text-lg" />
                </div>
              </a>
              <a href="#" className="text-white/50 hover:text-white transition-colors" rel="nofollow">
                <div className="w-6 h-6 flex items-center justify-center">
                  <i className="ri-facebook-fill text-lg" />
                </div>
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
// Dynamic sitemap served at /sitemap.xml (rewrite in vercel.json).
// Static marketing routes plus every ACTIVE listing, fetched through
// Supabase's REST API with the anon key -- the "Public can read active
// listings" RLS policy scopes exactly what belongs in a sitemap anyway.
// Runs as a Vercel Node serverless function; the SPA itself stays static.

const STATIC_ROUTES = [
  { path: '/', priority: '1.0', changefreq: 'daily' },
  { path: '/listings', priority: '0.9', changefreq: 'hourly' },
  { path: '/list-property', priority: '0.8', changefreq: 'monthly' },
  { path: '/how-it-works', priority: '0.6', changefreq: 'monthly' },
  { path: '/about', priority: '0.5', changefreq: 'monthly' },
  { path: '/community', priority: '0.5', changefreq: 'daily' },
  { path: '/contact', priority: '0.4', changefreq: 'yearly' },
  { path: '/subscription', priority: '0.5', changefreq: 'monthly' },
  { path: '/feedback', priority: '0.4', changefreq: 'weekly' },
  { path: '/terms', priority: '0.2', changefreq: 'yearly' },
  { path: '/privacy', priority: '0.2', changefreq: 'yearly' },
  { path: '/cookies', priority: '0.2', changefreq: 'yearly' },
  { path: '/accessibility', priority: '0.2', changefreq: 'yearly' },
];

function xmlEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// package.json declares "type": "module", so this is an ES module.
export default async function handler(req, res) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const origin = `${proto}://${host}`;

  let listingUrls = [];
  const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.VITE_PUBLIC_SUPABASE_ANON_KEY;
  if (supabaseUrl && anonKey) {
    try {
      const resp = await fetch(
        `${supabaseUrl.replace(/\/$/, '')}/rest/v1/listings?select=id,updated_at&status=eq.active&order=updated_at.desc&limit=5000`,
        { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } }
      );
      if (resp.ok) {
        const rows = await resp.json();
        listingUrls = rows.map((r) => ({
          loc: `${origin}/listings/${r.id}`,
          lastmod: r.updated_at ? new Date(r.updated_at).toISOString().slice(0, 10) : null,
        }));
      }
    } catch {
      // Sitemap must never 500 over a transient DB hiccup -- static
      // routes alone are still a valid sitemap.
    }
  }

  const entries = [
    ...STATIC_ROUTES.map(
      (r) =>
        `  <url><loc>${xmlEscape(origin + r.path)}</loc><changefreq>${r.changefreq}</changefreq><priority>${r.priority}</priority></url>`
    ),
    ...listingUrls.map(
      (u) =>
        `  <url><loc>${xmlEscape(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}<changefreq>weekly</changefreq><priority>0.7</priority></url>`
    ),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`;

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  res.status(200).send(xml);
}

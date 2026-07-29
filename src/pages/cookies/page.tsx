import LegalPageLayout, { LegalSection, LegalContactNote } from '@/components/feature/LegalPageLayout';

interface StorageRow {
  name: string;
  type: string;
  purpose: string;
  duration: string;
}

const essentialStorage: StorageRow[] = [
  {
    name: 'Supabase auth session',
    type: 'localStorage',
    purpose: "Keeps you signed in between visits and identifies you to our database's authorization rules.",
    duration: 'Until you sign out, or the session expires',
  },
  {
    name: 'bhavan_pending_oauth_role',
    type: 'localStorage',
    purpose: 'Remembers whether you picked "Tenant" or "Owner" while a Google sign-in redirect is in progress.',
    duration: 'A few seconds, cleared right after sign-in completes',
  },
  {
    name: 'i18nextLng',
    type: 'localStorage',
    purpose: 'Remembers your selected display language.',
    duration: 'Until you change it or clear browser storage',
  },
];

const securityStorage: StorageRow[] = [
  {
    name: 'bhavan_fingerprint',
    type: 'sessionStorage',
    purpose: 'A device fingerprint (derived from screen size, timezone, browser and graphics-card characteristics) used to rate-limit actions like contact-form submissions and connection requests from signed-out or first-time visitors, to reduce spam and abuse.',
    duration: 'Current browser tab session',
  },
  {
    name: 'Per-user/device rate-limit timers',
    type: 'localStorage',
    purpose: 'Timestamps of recent actions (e.g. connection requests, contact submissions) used to enforce fair-use limits.',
    duration: 'Rolling window, typically 24 hours, then automatically ignored',
  },
];

function StorageTable({ rows }: { rows: StorageRow[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-black/5">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-offwhite text-left">
            <th className="px-4 py-2.5 font-semibold text-charcoal/70">Name</th>
            <th className="px-4 py-2.5 font-semibold text-charcoal/70">Type</th>
            <th className="px-4 py-2.5 font-semibold text-charcoal/70">Purpose</th>
            <th className="px-4 py-2.5 font-semibold text-charcoal/70">Duration</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name} className="border-t border-black/5 align-top">
              <td className="px-4 py-3 font-medium text-charcoal whitespace-nowrap">{row.name}</td>
              <td className="px-4 py-3 text-charcoal/60 whitespace-nowrap">{row.type}</td>
              <td className="px-4 py-3 text-charcoal/70">{row.purpose}</td>
              <td className="px-4 py-3 text-charcoal/60 whitespace-nowrap">{row.duration}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Cookies() {
  return (
    <LegalPageLayout
      title="Cookie Policy"
      lastUpdated="28 July 2026"
      intro="Bhavan mostly avoids traditional tracking cookies. What we actually store on your device is your browser's localStorage and sessionStorage, used to keep you signed in and to keep the platform safe from spam — not to build an advertising profile of you."
    >
      <LegalSection id="essential" title="1. Essential storage">
        <p>These are required for the platform to function — signing in, staying signed in, and remembering your language preference.</p>
        <StorageTable rows={essentialStorage} />
      </LegalSection>

      <LegalSection id="security" title="2. Security and anti-abuse storage">
        <p>
          These help us keep listings and messages genuine by limiting how fast an account or device can repeat certain actions, and are not
          used to track you across other websites.
        </p>
        <StorageTable rows={securityStorage} />
      </LegalSection>

      <LegalSection id="third-party" title="3. Third-party cookies">
        <p>
          When you pay rent through Bhavan, Razorpay's checkout is embedded on the page to process the payment. Razorpay (and, if your bank
          or UPI app redirects you for authentication, that provider) may set its own cookies during that step, governed by their own privacy
          and cookie policies — Bhavan does not control or read those cookies. We do not embed third-party advertising or analytics trackers.
        </p>
      </LegalSection>

      <LegalSection id="managing" title="4. Managing or clearing storage">
        <p>
          You can clear localStorage and sessionStorage for Bhavan at any time from your browser's site settings — this will sign you out and
          reset your rate-limit history and language preference, but won't affect data already saved to your account (listings, messages,
          agreements, etc.), which lives in our database, not your browser.
        </p>
      </LegalSection>

      <LegalSection id="changes" title="5. Changes to this policy">
        <p>If the storage we use changes materially — for example, if we introduce analytics or advertising cookies in the future — we will update this page and the "Last updated" date above.</p>
      </LegalSection>

      <LegalSection id="contact" title="6. Contact">
        <LegalContactNote email="support@mybhavan.com" />
      </LegalSection>
    </LegalPageLayout>
  );
}

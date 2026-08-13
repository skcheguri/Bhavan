import { Link, useLocation } from 'react-router';
import { useState, useEffect, useRef } from 'react';

/**
 * Scroll to the section a deep link names.
 *
 * A browser does this itself on a full page load, but not on a
 * client-side navigation, and nothing else in the app handles a hash. So
 * the footer's "Trust & Safety" link would otherwise land at the top of
 * a long page with no sign it had aimed anywhere in particular.
 */
function useScrollToHash() {
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    const target = document.getElementById(hash.slice(1));
    if (!target) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }, [hash]);
}

const ownerSteps = [
  {
    number: '01',
    icon: 'ri-shield-check-line',
    title: 'Verify Your Aadhaar',
    desc: 'Complete a one-time Aadhaar OTP verification. This confirms your real identity and ensures only genuine property owners can list — no brokers, no agents.',
    color: 'bg-green-50 text-green-600',
    badge: 'Required First',
    badgeColor: 'bg-green-100 text-green-700',
  },
  {
    number: '02',
    icon: 'ri-file-shield-2-line',
    title: 'Upload Ownership Documents',
    desc: 'Submit proof of ownership — property registration deed, sale deed, or municipal tax receipt. Our team verifies documents within 24 hours.',
    color: 'bg-amber-50 text-amber-600',
    badge: 'Mandatory',
    badgeColor: 'bg-amber-100 text-amber-700',
  },
  {
    number: '03',
    icon: 'ri-home-4-line',
    title: 'Fill Property Details',
    desc: 'Add your property title, type, rent, location, amenities, and a description. The more detail you add, the faster you find the right tenant.',
    color: 'bg-brand/10 text-brand',
    badge: 'Step 3',
    badgeColor: 'bg-brand/10 text-brand',
  },
  {
    number: '04',
    icon: 'ri-search-eye-line',
    title: 'Listing Review',
    desc: 'Our team reviews your listing and ownership documents within 24 hours. Verified listings get a trust badge and priority placement in search results.',
    color: 'bg-teal-50 text-teal-600',
    badge: '24 hrs',
    badgeColor: 'bg-teal-100 text-teal-700',
  },
  {
    number: '05',
    icon: 'ri-user-received-line',
    title: 'Receive Verified Inquiries',
    desc: 'Only Aadhaar-verified tenants can contact you. Browse their profiles, check their verification status, and schedule visits directly through the platform.',
    color: 'bg-brand/10 text-brand',
    badge: 'Go Live',
    badgeColor: 'bg-brand/10 text-brand',
  },
  {
    number: '06',
    icon: 'ri-file-text-line',
    title: 'Sign Digital Agreement',
    desc: 'Generate and sign a legally valid rental agreement in both parties\' Aadhaar-verified names. No broker, no paper clutter — fully digital.',
    color: 'bg-green-50 text-green-600',
    badge: 'Final Step',
    badgeColor: 'bg-green-100 text-green-700',
  },
];

const tenantSteps = [
  {
    number: '01',
    icon: 'ri-user-add-line',
    title: 'Create Your Account',
    desc: 'Sign up as a tenant in under 2 minutes. Add your basic details, preferred locations, and budget to get personalised listing recommendations.',
    color: 'bg-brand/10 text-brand',
  },
  {
    number: '02',
    icon: 'ri-shield-check-line',
    title: 'Verify Your Aadhaar',
    desc: 'Owners verify with Aadhaar to list a property; for tenants it is optional but recommended, and puts your verified name on the agreements you sign.',
    color: 'bg-green-50 text-green-600',
  },
  {
    number: '03',
    icon: 'ri-search-2-line',
    title: 'Browse & Save Listings',
    desc: 'Filter by city, locality, budget, BHK, furnishing, and parking. Save properties you like to your profile and compare them side by side.',
    color: 'bg-teal-50 text-teal-600',
  },
  {
    number: '04',
    icon: 'ri-calendar-check-line',
    title: 'Schedule a Visit',
    desc: 'Book an in-person property tour directly from the listing page. Pick your preferred date and time — the owner confirms within 2 hours.',
    color: 'bg-amber-50 text-amber-600',
  },
  {
    number: '05',
    icon: 'ri-message-3-line',
    title: 'Contact the Owner',
    desc: 'Message verified property owners directly — no broker in between. Discuss terms, negotiate rent, and ask questions before committing.',
    color: 'bg-brand/10 text-brand',
  },
  {
    number: '06',
    icon: 'ri-file-text-line',
    title: 'Sign & Move In',
    desc: 'Sign a digital rental agreement in your Aadhaar-verified name. Track maintenance requests, store documents, and manage rent — all in one place.',
    color: 'bg-green-50 text-green-600',
  },
];

const faqs = [
  {
    q: 'Is Aadhaar verification mandatory?',
    a: 'Owners must verify with Aadhaar to list a property. For tenants it is optional but recommended — it builds trust with owners and puts your verified name on any agreement you sign.',
  },
  {
    q: 'Can brokers or agents list properties?',
    a: 'Absolutely not. Bhavan is strictly for direct property owners. Broker listings are immediately removed and accounts are permanently banned.',
  },
  {
    q: 'How long does listing review take?',
    a: 'Our team reviews all listings and ownership documents within 24 hours. You\'ll receive an email confirmation once your listing goes live.',
  },
  {
    q: 'What documents are accepted as proof of ownership?',
    a: 'We accept property registration deed, sale deed, municipal tax receipt, or electricity bill in the owner\'s name. The name must match your Aadhaar.',
  },
  {
    q: 'Is listing on Bhavan free?',
    a: 'Yes, listing is completely free for property owners. There are no broker fees, no commission, and no hidden charges.',
  },
  {
    q: 'What happens after I sign the rental agreement?',
    a: 'Both parties receive a digitally signed copy. Tenants can then use the Renter Tools to track maintenance requests, store documents, and manage rent payments.',
  },
];

export default function HowItWorks() {
  useScrollToHash();
  const [activeTab, setActiveTab] = useState<'owners' | 'tenants'>('owners');
  const ownersRef = useRef<HTMLElement>(null);
  const tenantsRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            if (entry.target.id === 'for-owners') setActiveTab('owners');
            if (entry.target.id === 'for-tenants') setActiveTab('tenants');
          }
        });
      },
      { rootMargin: '-40% 0px -40% 0px', threshold: 0 }
    );

    if (ownersRef.current) observer.observe(ownersRef.current);
    if (tenantsRef.current) observer.observe(tenantsRef.current);

    return () => observer.disconnect();
  }, []);

  const handleTabClick = (tab: 'owners' | 'tenants') => {
    setActiveTab(tab);
    const el = document.getElementById(tab === 'owners' ? 'for-owners' : 'for-tenants');
    if (el) {
      const offset = 110;
      const top = el.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-offwhite pb-16">

      {/* Hero */}
      <section className="relative bg-charcoal py-16 md:py-24 overflow-hidden">
        <div className="absolute inset-0">
          <img
            src="/placeholders/photo.svg"
            alt="How it works"
            className="w-full h-full object-cover object-top opacity-25"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-charcoal via-charcoal/80 to-charcoal/60" />
        </div>
        <div className="relative z-10 w-full px-4 md:px-8 lg:px-12 text-center">
          <span className="inline-block px-4 py-1.5 bg-brand/20 border border-brand/40 text-brand text-xs font-semibold rounded-full uppercase tracking-wide mb-5">
            No Brokers. No Middlemen.
          </span>
          <h1 className="text-3xl md:text-5xl font-bold text-white leading-tight">
            How Bhavan Works
          </h1>
          <p className="mt-4 text-white/70 text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
            A transparent, verified, broker-free rental platform for property owners and tenants across India.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-6 text-sm text-white/60">
            {[
              { icon: 'ri-shield-check-line', label: 'Aadhaar Verified Users' },
              { icon: 'ri-forbid-2-line', label: 'Zero Broker Tolerance' },
              { icon: 'ri-price-tag-3-line', label: 'Free for Owners' },
              { icon: 'ri-file-text-line', label: 'Digital Agreements' },
            ].map((item) => (
              <span key={item.label} className="flex items-center gap-1.5">
                <div className="w-4 h-4 flex items-center justify-center">
                  <i className={`${item.icon} text-brand`} />
                </div>
                {item.label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Tab toggle */}
      <section className="bg-white border-b">
        <div className="w-full px-4 md:px-8 lg:px-12">
          <div className="max-w-4xl mx-auto flex">
            <button
              onClick={() => handleTabClick('owners')}
              className={`flex-1 text-center py-4 text-sm font-semibold transition-colors border-b-2 cursor-pointer ${
                activeTab === 'owners'
                  ? 'text-brand border-brand'
                  : 'text-charcoal/60 hover:text-charcoal border-transparent'
              }`}
            >
              <i className="ri-building-line mr-2" />
              For Property Owners
            </button>
            <button
              onClick={() => handleTabClick('tenants')}
              className={`flex-1 text-center py-4 text-sm font-semibold transition-colors border-b-2 cursor-pointer ${
                activeTab === 'tenants'
                  ? 'text-brand border-brand'
                  : 'text-charcoal/60 hover:text-charcoal border-transparent'
              }`}
            >
              <i className="ri-user-line mr-2" />
              For Tenants
            </button>
          </div>
        </div>
      </section>

      {/* For Owners */}
      <section id="for-owners" ref={ownersRef} className="py-16 md:py-20">
        <div className="w-full px-4 md:px-8 lg:px-12">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <span className="inline-block px-4 py-1.5 bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold rounded-full uppercase tracking-wide mb-4">
                Property Owners
              </span>
              <h2 className="text-2xl md:text-3xl font-bold text-charcoal">List Your Property in 6 Steps</h2>
              <p className="mt-3 text-charcoal/60 text-sm max-w-xl mx-auto">
                Only verified property owners can list. The process is designed to keep brokers out and protect both owners and tenants.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {ownerSteps.map((step) => (
                <div key={step.number} className="bg-white rounded-3xl border border-black/5 p-6 hover:border-brand/20 transition">
                  <div className="flex items-start justify-between mb-4">
                    <div className={`w-11 h-11 flex items-center justify-center rounded-xl flex-shrink-0 ${step.color}`}>
                      <i className={`${step.icon} text-xl`} />
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${step.badgeColor}`}>
                      {step.badge}
                    </span>
                  </div>
                  <p className="text-3xl font-black text-gray-100 mb-2 leading-none">{step.number}</p>
                  <h3 className="text-sm font-bold text-charcoal mb-2">{step.title}</h3>
                  <p className="text-xs text-charcoal/60 leading-relaxed">{step.desc}</p>
                </div>
              ))}
            </div>

            {/* Owner CTA */}
            <div className="mt-10 bg-white rounded-3xl border border-black/5 p-8 flex flex-col md:flex-row items-center justify-between gap-6">
              <div>
                <h3 className="text-lg font-bold text-charcoal">Ready to list your property?</h3>
                <p className="text-sm text-charcoal/60 mt-1">Start with Aadhaar verification — it only takes 2 minutes.</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 flex-shrink-0">
                <Link
                  to="/aadhaar-verify"
                  className="flex items-center justify-center gap-2 bg-green-600 text-white text-sm font-semibold px-6 py-3 rounded-full hover:bg-green-700 transition-colors whitespace-nowrap"
                >
                  <i className="ri-shield-check-line" /> Verify Aadhaar First
                </Link>
                <Link
                  to="/list-property"
                  className="flex items-center justify-center gap-2 bg-brand text-white text-sm font-semibold px-6 py-3 rounded-full hover:bg-brand-dark transition-colors whitespace-nowrap"
                >
                  <i className="ri-home-4-line" /> List a Property
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* For Tenants */}
      <section id="for-tenants" ref={tenantsRef} className="py-16 md:py-20 bg-white">
        <div className="w-full px-4 md:px-8 lg:px-12">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <span className="inline-block px-4 py-1.5 bg-brand/10 border border-brand/20 text-brand text-xs font-semibold rounded-full uppercase tracking-wide mb-4">
                Tenants
              </span>
              <h2 className="text-2xl md:text-3xl font-bold text-charcoal">Find Your Home in 6 Steps</h2>
              <p className="mt-3 text-charcoal/60 text-sm max-w-xl mx-auto">
                Browse verified listings, contact owners directly, and move in — all without a single broker.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {tenantSteps.map((step) => (
                <div key={step.number} className="bg-offwhite rounded-3xl border border-black/5 p-6 hover:border-brand/20 transition">
                  <div className={`w-11 h-11 flex items-center justify-center rounded-xl flex-shrink-0 mb-4 ${step.color}`}>
                    <i className={`${step.icon} text-xl`} />
                  </div>
                  <p className="text-3xl font-black text-gray-200 mb-2 leading-none">{step.number}</p>
                  <h3 className="text-sm font-bold text-charcoal mb-2">{step.title}</h3>
                  <p className="text-xs text-charcoal/60 leading-relaxed">{step.desc}</p>
                </div>
              ))}
            </div>

            {/* Tenant CTA */}
            <div className="mt-10 bg-offwhite rounded-3xl border border-black/5 p-8 flex flex-col md:flex-row items-center justify-between gap-6">
              <div>
                <h3 className="text-lg font-bold text-charcoal">Ready to find your next home?</h3>
                <p className="text-sm text-charcoal/60 mt-1">Browse thousands of verified listings across India — no broker fees.</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 flex-shrink-0">
                <Link
                  to="/signup"
                  className="flex items-center justify-center gap-2 bg-brand text-white text-sm font-semibold px-6 py-3 rounded-full hover:bg-brand-dark transition-colors whitespace-nowrap"
                >
                  <i className="ri-user-add-line" /> Create Free Account
                </Link>
                <Link
                  to="/listings"
                  className="flex items-center justify-center gap-2 border border-black/10 text-charcoal text-sm font-semibold px-6 py-3 rounded-full hover:border-brand/40 hover:text-brand transition-colors whitespace-nowrap"
                >
                  <i className="ri-search-2-line" /> Browse Listings
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust & Safety */}
      <section id="trust-safety" className="scroll-mt-24 py-16 md:py-20">
        <div className="w-full px-4 md:px-8 lg:px-12">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-2xl md:text-3xl font-bold text-charcoal">Trust &amp; Safety</h2>
              <p className="mt-3 text-charcoal/60 text-sm">How we keep Bhavan broker-free and safe for everyone</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {[
                { icon: 'ri-shield-check-fill', title: 'Aadhaar Gated', desc: 'Every user — owner or tenant — must verify Aadhaar before accessing key features.', color: 'text-green-600 bg-green-50' },
                { icon: 'ri-file-shield-2-line', title: 'Document Verified', desc: 'Owners must submit property ownership proof. Listings go live only after manual review.', color: 'text-amber-600 bg-amber-50' },
                { icon: 'ri-forbid-2-fill', title: 'Zero Broker Policy', desc: 'Broker accounts are permanently banned. Agreements must match Aadhaar names exactly.', color: 'text-red-500 bg-red-50' },
                { icon: 'ri-lock-2-fill', title: 'Data Privacy', desc: 'Full Aadhaar numbers are never stored. Only last 4 digits are saved for display purposes.', color: 'text-brand bg-brand/10' },
              ].map((item) => (
                <div key={item.title} className="bg-white rounded-3xl border border-black/5 p-5 text-center">
                  <div className={`w-12 h-12 flex items-center justify-center rounded-xl mx-auto mb-4 ${item.color}`}>
                    <i className={`${item.icon} text-2xl`} />
                  </div>
                  <h3 className="text-sm font-bold text-charcoal mb-2">{item.title}</h3>
                  <p className="text-xs text-charcoal/60 leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 md:py-20 bg-white">
        <div className="w-full px-4 md:px-8 lg:px-12">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-10">
              <h2 className="text-2xl md:text-3xl font-bold text-charcoal">Frequently Asked Questions</h2>
            </div>
            <div className="space-y-3">
              {faqs.map((faq) => (
                <details key={faq.q} className="group bg-offwhite rounded-xl border border-black/5 overflow-hidden">
                  <summary className="flex items-center justify-between px-5 py-4 cursor-pointer list-none">
                    <span className="text-sm font-semibold text-charcoal pr-4">{faq.q}</span>
                    <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                      <i className="ri-add-line text-charcoal/40 group-open:hidden" />
                      <i className="ri-subtract-line text-brand hidden group-open:block" />
                    </div>
                  </summary>
                  <div className="px-5 pb-4">
                    <p className="text-sm text-charcoal/60 leading-relaxed">{faq.a}</p>
                  </div>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}

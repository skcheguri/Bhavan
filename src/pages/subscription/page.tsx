import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSubscription } from '@/hooks/useSubscription';
import PlanToggle from './components/PlanToggle';
import FeatureRow from './components/FeatureRow';
import FaqAccordion from './components/FaqAccordion';
import UpgradeModal from './components/UpgradeModal';

const featureRows = [
  { label: 'Active Properties', freeValue: 'Unlimited', proValue: 'Unlimited', isProCheck: false },
  { label: 'Active Listings', freeValue: 'Unlimited', proValue: 'Unlimited', isProCheck: false },
  { label: 'Monthly Tenant Inquiries', freeValue: 'Unlimited', proValue: 'Unlimited', isProCheck: false },
  { label: 'Advanced Analytics Dashboard', freeValue: '—', proValue: 'Included', isProCheck: true },
  { label: 'Automated Rent Reminders', freeValue: '—', proValue: 'Included', isProCheck: true },
  { label: 'Lease Expiry Alerts', freeValue: '—', proValue: 'Included', isProCheck: true },
  { label: 'Bulk Rent Receipt Generation', freeValue: '—', proValue: 'Included', isProCheck: true },
  { label: 'Priority Listing Placement', freeValue: '—', proValue: 'Included', isProCheck: true },
  { label: 'Verified Pro Landlord Badge', freeValue: '—', proValue: 'Included', isProCheck: true },
  { label: 'Custom Branded Listing URLs', freeValue: '—', proValue: 'Included', isProCheck: true },
  { label: 'Auto-filled Tax Forms (Schedule HP)', freeValue: '—', proValue: 'Included', isProCheck: true },
  { label: 'Data Export (CSV / Excel)', freeValue: '—', proValue: 'Included', isProCheck: true },
  { label: 'Priority Email Support', freeValue: '—', proValue: '4-hour response', isProCheck: true },
  { label: 'Dedicated Account Manager', freeValue: '—', proValue: '5+ properties', isProCheck: true },
  { label: 'No Ads on Dashboard', freeValue: '—', proValue: 'Included', isProCheck: true },
  { label: 'Advanced Agreement Templates', freeValue: '—', proValue: 'Included', isProCheck: true },
];

export default function SubscriptionPage() {
  const { isPro, plan } = useSubscription();
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('annual');
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [upgradePlan, setUpgradePlan] = useState<'pro_monthly' | 'pro_annual'>('pro_annual');

  const monthlyPrice = 199;
  const annualPrice = 999;
  const annualMonthlyEquivalent = Math.round(annualPrice / 12);
  const annualSavings = monthlyPrice * 12 - annualPrice;

  const openUpgrade = (selected: 'pro_monthly' | 'pro_annual') => {
    setUpgradePlan(selected);
    setUpgradeModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-offwhite pt-20 pb-16">
      <UpgradeModal
        isOpen={upgradeModalOpen}
        onClose={() => setUpgradeModalOpen(false)}
        plan={upgradePlan}
      />

      <div className="max-w-5xl mx-auto px-4 md:px-8">
        {/* Hero */}
        <div className="text-center py-10 md:py-16">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-bold mb-4">
            <i className="ri-vip-crown-line text-sm" /> For Landlords Only
          </span>
          <h1 className="text-3xl md:text-4xl font-bold text-charcoal mb-3">Choose Your Plan</h1>
          <p className="text-charcoal/60 text-sm md:text-base max-w-xl mx-auto leading-relaxed">
            Start free and upgrade when you need more power. All plans include verified listings, tenant inquiries, and rent management tools.
          </p>
        </div>

        {/* Plan Toggle */}
        <div className="flex justify-center mb-10">
          <PlanToggle value={billingCycle} onChange={setBillingCycle} />
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-14">
          {/* Free Card */}
          <div className="bg-white rounded-3xl border border-black/5 p-6 md:p-8 flex flex-col">
            <div className="mb-6">
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-lightgray text-charcoal/70">Free</span>
              <h2 className="text-xl font-bold text-charcoal mt-3">Free Forever</h2>
              <p className="text-sm text-charcoal/60 mt-1">Perfect for getting started with 1–2 properties.</p>
            </div>
            <div className="mb-6">
              <span className="text-4xl font-bold text-charcoal">₹0</span>
              <span className="text-sm text-charcoal/40 ml-1">/month</span>
            </div>
            <ul className="space-y-3 mb-8 flex-1">
              {[
                'Unlimited active properties',
                'Unlimited active listings',
                'Unlimited tenant inquiries',
                'Basic dashboard & metrics',
                'QR codes for listings',
                'Standard chat messaging',
                'Community access',
              ].map((item) => (
                <li key={item} className="flex items-center gap-2.5 text-sm text-charcoal/70">
                  <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                    <i className="ri-checkbox-circle-fill text-amber-400 text-sm" />
                  </div>
                  {item}
                </li>
              ))}
            </ul>
            <button
              disabled
              className="w-full py-3 rounded-full border border-black/10 text-sm font-semibold text-charcoal/40 bg-lightgray cursor-not-allowed whitespace-nowrap"
            >
              {isPro ? 'Current Plan (Downgrade)' : 'Current Plan'}
            </button>
          </div>

          {/* Pro Card */}
          <div className="bg-white rounded-2xl border-2 border-amber-400 p-6 md:p-8 flex flex-col relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <span className="px-3 py-1 rounded-full bg-amber-500 text-white text-xs font-bold whitespace-nowrap">
                Most Popular
              </span>
            </div>
            <div className="mb-6">
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700">Pro</span>
              <h2 className="text-xl font-bold text-charcoal mt-3">Pro Unlimited</h2>
              <p className="text-sm text-charcoal/60 mt-1">Scale your rental business with advanced tools.</p>
            </div>
            <div className="mb-6">
              {billingCycle === 'monthly' ? (
                <>
                  <span className="text-4xl font-bold text-charcoal">₹{monthlyPrice.toLocaleString('en-IN')}</span>
                  <span className="text-sm text-charcoal/40 ml-1">/month</span>
                </>
              ) : (
                <>
                  <span className="text-4xl font-bold text-charcoal">₹{annualPrice.toLocaleString('en-IN')}</span>
                  <span className="text-sm text-charcoal/40 ml-1">/year</span>
                  <p className="text-xs text-green-600 font-semibold mt-1">
                    ₹{annualMonthlyEquivalent}/mo equivalent — Save ₹{annualSavings.toLocaleString('en-IN')}/year
                  </p>
                </>
              )}
            </div>
            <ul className="space-y-3 mb-8 flex-1">
              {[
                'Unlimited properties & listings',
                'Unlimited tenant inquiries',
                'Advanced analytics dashboard',
                'Auto rent reminders & lease alerts',
                'Bulk receipt generation',
                'Priority search placement',
                'Verified Pro Landlord badge',
                'Custom branded URLs',
                'Auto-filled tax forms',
                'Priority support (4hr response)',
                'Data export to CSV/Excel',
                'No ads on dashboard',
              ].map((item) => (
                <li key={item} className="flex items-center gap-2.5 text-sm text-charcoal">
                  <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
                    <i className="ri-checkbox-circle-fill text-amber-500 text-sm" />
                  </div>
                  {item}
                </li>
              ))}
            </ul>
            <button
              onClick={() => openUpgrade(billingCycle === 'monthly' ? 'pro_monthly' : 'pro_annual')}
              className={`w-full py-3 rounded-full text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                isPro
                  ? 'border border-black/10 text-charcoal/60 bg-lightgray hover:bg-lightgray'
                  : 'bg-amber-500 text-white hover:bg-amber-600'
              }`}
            >
              {isPro ? 'Current Plan' : 'Upgrade to Pro'}
            </button>
          </div>
        </div>

        {/* Feature Comparison Table */}
        <div className="bg-white rounded-3xl border border-black/5 overflow-hidden mb-14">
          <div className="grid grid-cols-3 gap-4 px-5 py-4 bg-offwhite border-b border-black/5">
            <span className="text-xs font-bold text-charcoal/40 uppercase tracking-wide">Feature</span>
            <span className="text-xs font-bold text-charcoal/40 uppercase tracking-wide">Free</span>
            <span className="text-xs font-bold text-amber-600 uppercase tracking-wide">Pro</span>
          </div>
          {featureRows.map((row) => (
            <FeatureRow key={row.label} {...row} />
          ))}
        </div>

        {/* Trust Badges */}
        <div className="flex flex-wrap items-center justify-center gap-4 md:gap-8 mb-14">
          {[
            { icon: 'ri-shield-check-line', label: '7-Day Money-Back Guarantee' },
            { icon: 'ri-lock-line', label: 'Secure Razorpay Payments' },
            { icon: 'ri-close-circle-line', label: 'No Hidden Fees' },
            { icon: 'ri-time-line', label: 'Cancel Anytime' },
          ].map((badge) => (
            <div key={badge.label} className="flex items-center gap-2 text-sm text-charcoal/60">
              <div className="w-5 h-5 flex items-center justify-center">
                <i className={`${badge.icon} text-amber-500`} />
              </div>
              {badge.label}
            </div>
          ))}
        </div>

        {/* FAQ */}
        <div className="mb-6">
          <h2 className="text-xl font-bold text-charcoal text-center mb-6">Frequently Asked Questions</h2>
          <FaqAccordion />
        </div>

        {/* Bottom CTA */}
        <div className="text-center mt-12">
          <p className="text-sm text-charcoal/60 mb-4">Still have questions? Reach out anytime.</p>
          <Link
            to="/contact"
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full border border-black/10 text-sm font-medium text-charcoal hover:border-amber-400 hover:text-amber-600 transition-colors whitespace-nowrap"
          >
            <i className="ri-customer-service-2-line text-sm" /> Contact Support
          </Link>
        </div>
      </div>
    </div>
  );
}
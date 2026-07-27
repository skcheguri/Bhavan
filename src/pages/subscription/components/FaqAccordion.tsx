import { useState } from 'react';

const faqs = [
  {
    q: 'What happens if I exceed the Free tier limits?',
    a: 'The Free plan has no hard caps on properties, listings, or inquiries. Pro gives you advanced tools like analytics, auto-reminders, and priority placement — not more quantity.',
  },
  {
    q: 'Can I switch between Monthly and Annual billing?',
    a: 'Yes! You can switch at any time from your Billing tab. If you switch from Monthly to Annual, the new annual rate applies at your next billing cycle.',
  },
  {
    q: 'Is there a free trial for Pro?',
    a: 'Yes — all new landlords get a 7-day free trial of Pro features. If you don\'t upgrade before the trial ends, you\'ll automatically move to the Free tier.',
  },
  {
    q: 'What payment methods do you support?',
    a: 'We accept UPI (Google Pay, PhonePe, Paytm, BHIM), all major Credit/Debit cards (Visa, Mastercard, RuPay), Net Banking, and popular wallets like Paytm and PhonePe.',
  },
  {
    q: 'What is the grace period?',
    a: 'If a renewal payment fails, you get a 7-day grace period where you keep full Pro access. We\'ll send reminders to update your payment method. After 7 days, you\'ll revert to the Free tier.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Absolutely. Cancel from your Billing tab and you\'ll stay on Pro until the end of your current billing period. No hidden fees, no questions asked.',
  },
  {
    q: 'Is there a refund policy?',
    a: 'Yes — we offer a 7-day money-back guarantee. If you\'re not satisfied with Pro, contact us within 7 days of your first payment for a full refund.',
  },
  {
    q: 'Do tenants see that I\'m on the Free plan?',
    a: 'Free listings show a small "Free" badge, while Pro listings display a "Verified Pro Landlord" badge. Tenants see this to build trust.',
  },
];

export default function FaqAccordion() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="max-w-3xl mx-auto space-y-3">
      {faqs.map((faq, i) => (
        <div key={i} className="bg-white rounded-xl border border-black/5 overflow-hidden">
          <button
            onClick={() => setOpenIndex(openIndex === i ? null : i)}
            className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left cursor-pointer"
          >
            <span className="text-sm font-semibold text-charcoal">{faq.q}</span>
            <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
              <i className={`ri-arrow-down-s-line text-lg text-charcoal/40 transition-transform ${openIndex === i ? 'rotate-180' : ''}`} />
            </div>
          </button>
          {openIndex === i && (
            <div className="px-5 pb-4">
              <p className="text-sm text-charcoal/60 leading-relaxed">{faq.a}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
import { useState } from 'react';

const faqs = [
  {
    q: 'What happens if I exceed the Free tier limits?',
    a: 'The Free plan has no hard caps on properties, listings, or inquiries. Pro gives you advanced tools like analytics, auto-reminders, and priority placement — not more quantity.',
  },
  {
    q: 'Can I switch between Monthly and Annual?',
    a: 'Yes — just purchase the other plan whenever you like. Any time remaining on your current plan is added on top of the new period, so you never lose days you\'ve already paid for.',
  },
  {
    q: 'Is there a free trial for Pro?',
    a: 'The Free plan is free forever with no caps on properties, listings, or inquiries — so you can use Bhavan as long as you like and upgrade only when you want the Pro tools.',
  },
  {
    q: 'What payment methods do you support?',
    a: 'We accept UPI (Google Pay, PhonePe, Paytm, BHIM), all major Credit/Debit cards (Visa, Mastercard, RuPay), Net Banking, and popular wallets like Paytm and PhonePe.',
  },
  {
    q: 'Will I be charged automatically when my plan ends?',
    a: 'Never. Pro is a one-time payment — there is no auto-renewal and no card on file. When your paid-through date arrives, Pro simply ends; your listings and data are untouched, and you can renew any time.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'There\'s nothing to cancel — since Pro is a one-time payment with no recurring charge, you keep Pro until your paid-through date and it stops on its own. No hidden fees, no questions asked.',
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
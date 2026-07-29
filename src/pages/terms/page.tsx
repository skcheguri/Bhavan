import { Link } from 'react-router-dom';
import LegalPageLayout, { LegalSection, LegalList, LegalContactNote } from '@/components/feature/LegalPageLayout';

export default function Terms() {
  return (
    <LegalPageLayout
      title="Terms of Service"
      lastUpdated="28 July 2026"
      intro="These Terms govern your use of Bhavan, a broker-free rental platform connecting property owners directly with tenants across India. By creating an account or using Bhavan, you agree to these Terms."
    >
      <LegalSection id="who-we-are" title="1. Who we are">
        <p>
          Bhavan is a platform that lets property owners list rental properties and lets tenants search, connect with owners, and manage a
          tenancy directly — without a broker. Bhavan is not a party to any lease, sale, or rental agreement formed between an owner and a
          tenant, and we do not take a cut of rent. We provide the platform, identity verification tooling, communication channels, and
          optional document and payment tools that owners and tenants use to transact with each other.
        </p>
      </LegalSection>

      <LegalSection id="eligibility" title="2. Eligibility and accounts">
        <LegalList
          items={[
            'You must be at least 18 years old and capable of entering into a legally binding contract under Indian law.',
            'You may sign up as a Tenant or an Owner. You are responsible for choosing the role that matches your actual use of the platform.',
            'You can create an account with an email and password, Google sign-in, or a phone number verified by OTP.',
            'You are responsible for keeping your login credentials confidential and for all activity that happens under your account.',
            'One person may hold one active account per role. Creating multiple accounts to evade a block, rate limit, or moderation action is a violation of these Terms.',
          ]}
        />
      </LegalSection>

      <LegalSection id="verification" title="3. Identity verification">
        <p>
          Bhavan offers Aadhaar-based e-KYC verification through a licensed third-party verification provider, using an OTP sent by UIDAI to
          your Aadhaar-linked mobile number. Verification is currently optional for using the platform, but a "Verified" badge is only shown
          on accounts and listings that have completed it, and some actions — such as scheduling a property visit or signing a rental
          agreement — are gated behind Aadhaar verification for safety. See our{' '}
          <Link to="/privacy" className="text-brand font-medium hover:text-brand-dark">Privacy Policy</Link> for what verification data we
          store. You must provide your own accurate Aadhaar details; attempting to verify using someone else's identity is prohibited and
          may be reported to the appropriate authorities.
        </p>
      </LegalSection>

      <LegalSection id="listings" title="4. Listings, content, and conduct">
        <p>As an Owner, when you publish a listing you confirm that:</p>
        <LegalList
          items={[
            'You own the property, or you are authorized by the owner to list and let it.',
            'The information you provide — price, location, photos, amenities, availability — is accurate and current.',
            'You will honor the terms you advertise, including price, once you accept a tenant.',
          ]}
        />
        <p className="mt-2">Whether you are an Owner or a Tenant, when using Bhavan (including listings, messages, reviews, and the Community Forum) you agree not to:</p>
        <LegalList
          items={[
            'Post false, misleading, defamatory, or discriminatory content, including discrimination on the basis of religion, caste, gender, or community in violation of applicable law.',
            'Act as, or arrange for, a broker, agent, or other intermediary in a transaction on Bhavan, or ask another user to pay a brokerage fee — this platform exists specifically to be broker-free.',
            'Harass, threaten, or attempt to defraud another user, or solicit payment outside the channels a transaction was agreed through.',
            'Scrape, copy, or republish listings or user data from the platform, or use automated tools to create accounts or send messages.',
            'Circumvent identity verification, rate limits, or a moderation action (such as a soft block) placed on your account.',
          ]}
        />
        <p className="mt-2">
          We may review, moderate, or remove content — including listings, community posts, and reviews — that violates these Terms, and we
          maintain reporting tools (broker reports, post reports) so users can flag suspicious listings or conduct to our team.
        </p>
      </LegalSection>

      <LegalSection id="payments" title="5. Rent payments and subscriptions">
        <p>
          Rent payments made through Bhavan are processed by Razorpay, a licensed Indian payment aggregator; Bhavan does not store your card,
          UPI, or bank account credentials. Payment status (paid, pending, failed, reconciled) is recorded against your rental agreement so
          both parties have a shared, auditable record. Bhavan is not responsible for delays or failures caused by your bank, UPI app, or
          Razorpay's systems, though we will help you retry or reconcile a failed payment.
        </p>
        <p className="mt-2">
          Owners may optionally subscribe to a paid plan for extended features. Subscription pricing, billing cycle, and cancellation terms
          are shown at the time of purchase; you can cancel auto-renewal at any time from your account, effective at the end of the current
          billing period.
        </p>
      </LegalSection>

      <LegalSection id="rental-agreements" title="6. Rental agreements and documents">
        <p>
          Bhavan's rental agreement, rent receipt, and tax-form generators are drafting tools that produce documents from the details you
          enter, formatted for common Indian rental-law conventions. They are provided for convenience and are <strong>not legal advice</strong>.
          You are responsible for reviewing any generated document — and, where the value or terms warrant it, having it reviewed by a
          qualified lawyer — before relying on it, signing it, or registering it with the relevant authority.
        </p>
      </LegalSection>

      <LegalSection id="disclaimers" title="7. Disclaimers and limitation of liability">
        <p>
          Bhavan verifies identity and listing information where stated above, but we do not inspect properties in person, guarantee the
          condition of a property, or guarantee that any user will honor a commitment made to another user. Transactions, viewings, and
          tenancies happen directly between Owners and Tenants, at their own risk and judgment.
        </p>
        <p className="mt-2">
          The platform is provided "as is." To the maximum extent permitted by law, Bhavan is not liable for indirect, incidental, or
          consequential damages arising from your use of the platform or from a dispute between an Owner and a Tenant. Nothing in this
          section limits liability that cannot be excluded under Indian law.
        </p>
      </LegalSection>

      <LegalSection id="termination" title="8. Suspension and termination">
        <p>
          We may suspend or terminate an account that violates these Terms, provides false verification information, or is used to harass or
          defraud other users. You may close your account at any time by contacting us; some records (such as rent payment history tied to an
          active tenancy) may be retained as described in our{' '}
          <Link to="/privacy" className="text-brand font-medium hover:text-brand-dark">Privacy Policy</Link>.
        </p>
      </LegalSection>

      <LegalSection id="changes" title="9. Changes to these Terms">
        <p>
          We may update these Terms as the platform evolves. If we make a material change, we will update the "Last updated" date above and,
          where practical, notify account holders. Continuing to use Bhavan after a change takes effect means you accept the updated Terms.
        </p>
      </LegalSection>

      <LegalSection id="governing-law" title="10. Governing law">
        <p>
          These Terms are governed by the laws of India. Any dispute arising from these Terms or your use of Bhavan will be subject to the
          exclusive jurisdiction of the courts of [your city], India.
        </p>
      </LegalSection>

      <LegalSection id="contact" title="11. Contact">
        <LegalContactNote email="support@mybhavan.com" />
      </LegalSection>
    </LegalPageLayout>
  );
}

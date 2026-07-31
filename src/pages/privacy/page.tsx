import { Link } from 'react-router';
import LegalPageLayout, { LegalSection, LegalList, LegalContactNote } from '@/components/feature/LegalPageLayout';

export default function Privacy() {
  return (
    <LegalPageLayout
      title="Privacy Policy"
      lastUpdated="31 July 2026"
      intro="This policy explains what personal data Bhavan collects, why, and how it's protected, and sets out your rights under India's Digital Personal Data Protection Act, 2023 (DPDP Act). It covers everyone who uses the platform — Tenants, Owners, and visitors browsing listings. Under the DPDP Act, Bhavan acts as the 'Data Fiduciary' for the personal data described below, and you, as the person the data is about, are the 'Data Principal'."
    >
      <LegalSection id="data-we-collect" title="1. Data we collect">
        <p><strong>Account and profile data</strong> you provide directly: name, email, phone number, date of birth, occupation, emergency
          contact, and — for tenants — your current flat and move-in date. This is stored in our database and used to run your account and
          personalize your experience.</p>
        <p><strong>Identity verification data:</strong> if you complete Aadhaar verification, your Aadhaar number is sent directly to our
          licensed KYC verification provider to request and check an OTP — we store only the last 4 digits of your Aadhaar number, your
          verification status, and the timestamp of verification, never the full number. Rental agreements and rent receipts you generate may
          include your PAN and a masked Aadhaar number, since Indian tenancy documents conventionally require them.</p>
        <p><strong>Listing and transaction data:</strong> property details and photos you publish, connection requests, scheduled visits,
          chat messages between an owner and tenant, rent payment records (amount, month, status, and payment method — not your card or bank
          details, which Razorpay handles directly), rental agreements, rent receipts, maintenance requests, and reviews.</p>
        <p><strong>Community content:</strong> posts, comments, and reports you submit in the Community Forum, and feedback you submit through
          the Feedback or Contact forms.</p>
        <p><strong>Device and usage data:</strong> to keep the platform safe from spam and fraud, some actions (like submitting a contact
          form, or repeated connection requests) are rate-limited using a device fingerprint derived from browser and device characteristics
          (screen size, timezone, browser/GPU details) and stored only in your browser, not tied to your identity unless you're signed in. See
          our <Link to="/cookies" className="text-brand font-medium hover:text-brand-dark">Cookie Policy</Link> for the full list of what we
          store on your device and why.</p>
      </LegalSection>

      <LegalSection id="how-we-use-it" title="2. How we use your data">
        <LegalList
          items={[
            'To create and secure your account, and to let you sign in via email/password, Google, or phone OTP.',
            'To connect Tenants and Owners — showing your name and, once you choose to share it, your contact details to the other party in a request you have approved.',
            'To verify identity (Aadhaar) and reduce fraud and impersonation on the platform.',
            'To process rent payments through Razorpay and keep a shared payment record for both parties.',
            'To generate rental agreements, rent receipts, and tax-summary documents from the details you enter.',
            'To send you notifications about activity relevant to you — a new request, an approved visit, a payment, a shared agreement — in-app and, where you have enabled it, by email or SMS.',
            'To moderate content, investigate reports of suspicious brokers or abusive conduct, and enforce our Terms of Service.',
            'To comply with legal obligations, including tax, KYC, and payment-aggregator record-keeping requirements under Indian law.',
          ]}
        />
        <p className="mt-2">We do not sell your personal data, and we do not use your Aadhaar, PAN, or payment data for advertising.</p>
        <p className="mt-2">
          <strong>Consent.</strong> We process most of the data above based on the consent you give when you create an account, submit a
          form, or take an action that shares it (like sending a connection request). That consent is specific to the purpose stated at the
          time — for example, agreeing to identity verification doesn't also mean agreeing to marketing. You can withdraw consent for a
          given purpose at any time by adjusting your settings or writing to us (see Section 11); withdrawal doesn't undo processing already
          carried out, and may mean we can no longer provide the feature the data was needed for (for instance, withdrawing consent for
          Aadhaar verification means your listing loses its verified badge). Some limited processing — like keeping records required for tax
          or payment-aggregator compliance, or investigating a safety report — does not require consent because it falls under the "legitimate
          uses" exemptions in Section 7 of the DPDP Act, such as compliance with law or use of data you voluntarily provided for a
          specified purpose.
        </p>
      </LegalSection>

      <LegalSection id="who-we-share-with" title="3. Who we share data with">
        <LegalList
          items={[
            <><strong>The other party in a transaction</strong> — an Owner and a Tenant see each other's name, and once a connection is
              approved or an agreement is generated, contact details and documents needed to complete the tenancy.</>,
            <><strong>Razorpay</strong>, to process rent payments and, for owners, subscription billing.</>,
            <><strong>Our Aadhaar verification provider</strong>, solely to perform the OTP e-KYC check you initiate.</>,
            <><strong>Our SMS provider</strong>, to deliver phone OTP codes for sign-in and verification.</>,
            <><strong>Supabase</strong>, our database, authentication, and file-storage infrastructure provider, which hosts the data
              described in this policy on our behalf.</>,
            'Law enforcement or regulators, where required by Indian law, court order, or to protect the safety of our users.',
          ]}
        />
        <p className="mt-2">We do not share your data with third parties for their own marketing purposes.</p>
      </LegalSection>

      <LegalSection id="cross-border-transfer" title="4. Where your data is processed">
        <p>
          Some of our infrastructure providers (including Supabase and Razorpay) may process or store data on servers located outside
          India. The DPDP Act permits this by default — transfers are restricted only to specific countries or territories the Central
          Government notifies from time to time, and Bhavan does not transfer personal data to any such restricted destination. Regardless
          of where your data is processed, it remains subject to the protections described in this policy.
        </p>
      </LegalSection>

      <LegalSection id="retention" title="5. How long we keep it">
        <p>
          We keep account and transaction data for as long as your account is active, and for a reasonable period afterward to satisfy legal,
          tax, and dispute-resolution obligations — for example, rent payment and agreement records tied to a tenancy may be retained after
          account closure so both parties still have access to their history. Aadhaar verification attempt records (used for rate-limiting and
          fraud prevention) are retained separately from the last-4-digits/verification-status fields on your profile. Consistent with the
          DPDP Act's storage-limitation principle, we erase or anonymize personal data once it is no longer necessary for the purpose it was
          collected for and we are not required to keep it by law. You can request deletion of your account as described below.
        </p>
      </LegalSection>

      <LegalSection id="your-rights" title="6. Your rights as a Data Principal">
        <p>Under the DPDP Act, you have the right to:</p>
        <LegalList
          items={[
            <><strong>Access</strong> a summary of the personal data we hold about you and how it is being processed — most of it is
              already visible directly in your Tenant or Owner dashboard; for anything else, write to us at the email in Section 11.</>,
            <><strong>Correct, complete, and update</strong> your personal data. Most profile fields can be edited directly; re-verifying
              your phone number or email requires confirming a new OTP or confirmation link before the change takes effect.</>,
            <><strong>Erase</strong> personal data that is no longer necessary for the purpose it was collected for, including by
              requesting deletion of your account.</>,
            <><strong>Withdraw consent</strong> for a given processing purpose at any time, as described in Section 2 — as easily as you
              gave it, from Channel Preferences or by writing to us.</>,
            <><strong>Nominate</strong> another individual to exercise these rights on your behalf in the event of your death or incapacity.
              To register a nominee, contact us at the email in Section 11.</>,
            <><strong>Grievance redressal</strong> — if you're unhappy with how we've handled a request or your data generally, you can
              raise it with our Grievance Officer (Section 11) before, if still unresolved, approaching the Data Protection Board of India.</>,
          ]}
        />
        <p className="mt-2">
          We will respond to a rights request within a reasonable time and explain any records we are required to retain by law.
        </p>
      </LegalSection>

      <LegalSection id="your-duties" title="7. Your duties as a Data Principal">
        <p>The DPDP Act also sets out duties for individuals when exercising these rights. In using Bhavan, you agree not to:</p>
        <LegalList
          items={[
            'Impersonate another person when providing personal data (for example, registering an account or listing under a false identity).',
            'Suppress material information when providing your personal data for a document or verification the platform requires by law.',
            'Register a false or frivolous grievance with us or with the Data Protection Board of India.',
            'Furnish false or misleading particulars, or knowingly impersonate another person, when requesting correction or erasure of information.',
          ]}
        />
      </LegalSection>

      <LegalSection id="security" title="8. Security and breach notification">
        <p>
          Access to your data is protected by row-level authorization on our database, so a user can only read or modify data tied to their
          own account or an active relationship (such as an approved connection or signed agreement) with another user. Sensitive
          verification actions — like confirming Aadhaar verification — are handled by server-side functions rather than directly by client
          code. No system is perfectly secure, and we encourage you to use a strong, unique password and keep your OTP codes private.
        </p>
        <p>
          If a personal data breach occurs that is likely to affect you, we will notify you and the Data Protection Board of India as
          required under the DPDP Act, describing what happened, the likely consequences, and the steps we are taking in response.
        </p>
      </LegalSection>

      <LegalSection id="childrens-privacy" title="9. Children's privacy">
        <p>Bhavan is intended for users who are 18 or older, consistent with the eligibility requirement in our Terms of Service. We do not knowingly collect data from anyone under 18.</p>
      </LegalSection>

      <LegalSection id="changes" title="10. Changes to this policy">
        <p>
          If we make a material change to how we handle your data, we will update the "Last updated" date above and, where appropriate,
          notify you directly.
        </p>
      </LegalSection>

      <LegalSection id="contact" title="11. Contact and Grievance Officer">
        <p>
          For any question about this policy, a rights request under Section 6, or a grievance about how your personal data has been
          handled, contact our Grievance Officer:
        </p>
        <LegalContactNote email="support@mybhavan.com" />
      </LegalSection>
    </LegalPageLayout>
  );
}

import LegalPageLayout, { LegalSection, LegalList, LegalContactNote } from '@/components/feature/LegalPageLayout';

export default function Accessibility() {
  return (
    <LegalPageLayout
      title="Accessibility"
      lastUpdated="28 July 2026"
      intro="Renting a home shouldn't be harder because of how you access the web. We want Bhavan to be usable by everyone, including people using screen readers, keyboard-only navigation, or assistive technology."
    >
      <LegalSection id="our-approach" title="1. Our approach">
        <p>
          We are working toward meeting the Web Content Accessibility Guidelines (WCAG) 2.1 at Level AA, the widely used standard for web
          accessibility. This is an ongoing effort rather than a certification we're claiming today — as we build and update Bhavan, we aim to
          make sure new and existing pages meet that bar, and we prioritize fixes based on real reports from users.
        </p>
      </LegalSection>

      <LegalSection id="what-we-do" title="2. What's already in place">
        <LegalList
          items={[
            'Keyboard-operable forms and buttons across sign-up, listing search, messaging, and payment flows, with visible focus states.',
            'Form fields are paired with labels and inline validation messages, rather than relying on placeholder text or color alone to convey required information or errors.',
            'Text and background color combinations are chosen for sufficient contrast against our light background theme.',
            'The interface supports multiple languages, so you can browse and manage your account in the language you\'re most comfortable with.',
            'Interactive icons (e.g. verified badges, notification bells) are paired with visible text labels or accessible titles rather than icons alone.',
          ]}
        />
      </LegalSection>

      <LegalSection id="known-limitations" title="3. Known limitations">
        <p>
          Some areas of the platform — including data-dense tables (like the owner Tenants view) and multi-step flows (like document
          generation and identity verification) — have not yet had a full accessibility audit and may not fully meet WCAG 2.1 AA today. We are
          actively working through these as we continue to develop Bhavan.
        </p>
      </LegalSection>

      <LegalSection id="feedback" title="4. Tell us what's not working">
        <p>
          If you use assistive technology and run into a barrier anywhere on Bhavan — a page that's hard to navigate by keyboard, an image
          missing a description, or text that's hard to read — please tell us. Include the page URL, what you were trying to do, and the
          assistive technology or browser you were using if you can; it helps us reproduce and fix the issue faster.
        </p>
      </LegalSection>

      <LegalSection id="contact" title="5. Contact">
        <LegalContactNote email="accessibility@bhavan.in" />
      </LegalSection>
    </LegalPageLayout>
  );
}

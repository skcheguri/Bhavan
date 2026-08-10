/**
 * Bhavan's own social accounts.
 *
 * Fill in a href to make the icon appear. An entry with no href does not
 * render anywhere, so there is never an icon that looks live and does
 * nothing -- which is what the footer and the Contact page both had:
 * four `href="#"` anchors each, inviting a click on a product whose
 * whole pitch is being trustworthy.
 *
 * One list, because there were two copies of the same four icons and
 * they would have drifted the moment a real account existed.
 *
 * YouTube and Instagram are first: they are where the video plan lives,
 * so those are the accounts most likely to be filled in.
 */
export interface SocialAccount {
  label: string;
  icon: string;
  href: string;
}

export const SOCIAL_ACCOUNTS: SocialAccount[] = (
  [
    { label: 'Instagram', icon: 'ri-instagram-line', href: '' },
    { label: 'YouTube', icon: 'ri-youtube-fill', href: '' },
    { label: 'LinkedIn', icon: 'ri-linkedin-fill', href: '' },
    { label: 'X', icon: 'ri-twitter-x-fill', href: '' },
    { label: 'Facebook', icon: 'ri-facebook-fill', href: '' },
  ] as SocialAccount[]
).filter((a) => a.href);

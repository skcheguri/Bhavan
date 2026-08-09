/**
 * Which half of the owner dashboard applies.
 *
 * The owner role covers two different people. One rents flats out and
 * needs tenants, listings and income on screen. The other lives in their
 * own flat and joined Bhavan for the society -- for them those three
 * tiles read zero forever, which is not a wrong number but is a clear
 * message that the product is not for them.
 *
 * Read from what the owner has actually done rather than from anything
 * they were asked to declare. A flat that is let has an agreement; a
 * flat being offered has a listing. Somebody with neither is not
 * landlording, and somebody who lives in one flat and lets another has
 * both and sees both.
 *
 * Kept out of the page because it is the rule that would regress
 * silently: a resident owner seeing landlord tiles again looks like a
 * layout change, not like a bug.
 */

export interface OccupancyInput {
  /** Listings currently live on Bhavan. */
  activeListings: number;
  /** Rental agreements whose lease has not ended. */
  activeAgreements: number;
}

export function isLandlord({ activeListings, activeAgreements }: OccupancyInput): boolean {
  return activeListings > 0 || activeAgreements > 0;
}

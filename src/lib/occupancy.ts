import type { PropertyOccupancy } from '@/hooks/useProperties';

/**
 * Which half of the owner dashboard applies.
 *
 * The owner role covers two different people. One rents flats out and
 * needs tenants, listings and income on screen. The other lives in their
 * own flat and joined Bhavan for the society -- for them those three
 * tiles read zero forever, which is not a wrong number but is a clear
 * message that the product is not for them.
 *
 * Decided from the flats rather than from the person, because the common
 * case here is somebody who lives in one and lets another, often in the
 * same building. That person is both, and gets both.
 *
 * Kept out of the page because it is the rule that would regress
 * silently: a resident owner seeing landlord tiles again looks like a
 * layout change, not like a bug.
 */

export interface OccupancyInput {
  /** Every flat the owner has, whether or not it was ever listed. */
  occupancies: PropertyOccupancy[];
  /** Listings currently live on Bhavan. */
  activeListings: number;
  /** Rental agreements whose lease has not ended. */
  activeAgreements: number;
}

export interface OwnerDashboardShape {
  /** Show listings, tenants and income. */
  isLandlord: boolean;
  /** Flats said to be let with no agreement in Bhavan behind them. */
  untrackedTenancies: number;
}

export function ownerDashboardShape({
  occupancies,
  activeListings,
  activeAgreements,
}: OccupancyInput): OwnerDashboardShape {
  const letting = occupancies.filter((o) => o !== 'self_occupied').length;
  const rentedOut = occupancies.filter((o) => o === 'rented_out').length;

  return {
    // A live listing or a live agreement counts even if no flat has been
    // classified yet -- somebody mid-way through listing their first
    // property is a landlord, and hiding the tiles from them would be a
    // worse error than showing zeros.
    isLandlord: letting > 0 || activeListings > 0 || activeAgreements > 0,

    // Informal tenancies are the norm in this market: the rent is real,
    // the paperwork never came through the app. Counting them lets the
    // dashboard explain a low income figure instead of leaving the owner
    // to decide the total is broken.
    untrackedTenancies: Math.max(0, rentedOut - activeAgreements),
  };
}

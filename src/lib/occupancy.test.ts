import { describe, it, expect } from 'vitest';
import { isLandlord } from './occupancy';

describe('isLandlord', () => {
  it('is false for an owner who only lives in their flat', () => {
    // The case that started this: registers as an owner to join a
    // society, never lets anything, and was shown income, listings and
    // tenants sitting at zero forever.
    expect(isLandlord({ activeListings: 0, activeAgreements: 0 })).toBe(false);
  });

  it('is true once a flat is let', () => {
    expect(isLandlord({ activeListings: 0, activeAgreements: 1 })).toBe(true);
  });

  it('is true while a flat is on the market, before any tenant', () => {
    // Vacant is still the landlord business -- they want the listing and
    // the enquiries on it.
    expect(isLandlord({ activeListings: 1, activeAgreements: 0 })).toBe(true);
  });

  it('is true for somebody who lives in one flat and lets another', () => {
    // Both halves. This is why the dashboard is not split by person.
    expect(isLandlord({ activeListings: 1, activeAgreements: 1 })).toBe(true);
  });

  it('goes back to false when the last listing and lease are gone', () => {
    // An owner who has stopped letting stops being shown the landlord
    // half. Reversible on purpose: it follows the facts rather than a
    // one-way flag set at signup.
    expect(isLandlord({ activeListings: 0, activeAgreements: 0 })).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import { ownerDashboardShape } from './occupancy';

const shape = (
  occupancies: Parameters<typeof ownerDashboardShape>[0]['occupancies'],
  activeListings = 0,
  activeAgreements = 0
) => ownerDashboardShape({ occupancies, activeListings, activeAgreements });

describe('ownerDashboardShape', () => {
  it('hides the landlord half from an owner who only lives in their flat', () => {
    // The case that started this: registers as an owner to join a
    // society, never lets anything, and was shown income, listings and
    // tenants sitting at zero forever.
    expect(shape(['self_occupied']).isLandlord).toBe(false);
  });

  it('shows it to an owner who lets a flat', () => {
    expect(shape(['rented_out'], 0, 1).isLandlord).toBe(true);
  });

  it('shows it to an owner whose flat is empty and looking', () => {
    // Vacant is still the landlord business -- they want to see the
    // listing and the enquiries on it.
    expect(shape(['vacant']).isLandlord).toBe(true);
  });

  it('shows both halves to someone who lives in one flat and lets another', () => {
    // The reason this is decided per flat and not per person.
    expect(shape(['self_occupied', 'rented_out'], 0, 1).isLandlord).toBe(true);
  });

  it('treats a live listing as landlord even before any flat is classified', () => {
    // Mid-way through listing a first property. Hiding the tiles here
    // would be a worse error than showing zeros.
    expect(shape([], 1, 0).isLandlord).toBe(true);
  });

  it('treats a live agreement as landlord on its own', () => {
    expect(shape([], 0, 1).isLandlord).toBe(true);
  });

  it('has nothing to show for an owner with no flats at all', () => {
    expect(shape([]).isLandlord).toBe(false);
  });

  it('counts a let flat with no agreement behind it', () => {
    // The informal tenancy: rent is real, paperwork never reached Bhavan.
    expect(shape(['rented_out'], 0, 0).untrackedTenancies).toBe(1);
  });

  it('counts nothing when every let flat has its agreement', () => {
    expect(shape(['rented_out', 'rented_out'], 0, 2).untrackedTenancies).toBe(0);
  });

  it('counts only the shortfall when some are tracked', () => {
    expect(shape(['rented_out', 'rented_out', 'rented_out'], 0, 1).untrackedTenancies).toBe(2);
  });

  it('never goes negative when there are more agreements than let flats', () => {
    // Possible while an old agreement has not been ended -- it must not
    // print "-1 flats are marked rented".
    expect(shape(['rented_out'], 0, 3).untrackedTenancies).toBe(0);
  });

  it('does not count self-occupied or empty flats as untracked tenancies', () => {
    expect(shape(['self_occupied', 'vacant'], 0, 0).untrackedTenancies).toBe(0);
  });
});

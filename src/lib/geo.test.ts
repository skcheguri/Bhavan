import { describe, it, expect } from 'vitest';
import { haversineDistanceKm, matchesSearchTerms } from './geo';

describe('haversineDistanceKm', () => {
  it('returns ~0 for the same point', () => {
    const p = { latitude: 17.4948, longitude: 78.4294 };
    expect(haversineDistanceKm(p, p)).toBeCloseTo(0, 3);
  });

  it('returns the known distance between two Hyderabad suburbs (Kompally <-> Suchitra, ~4km)', () => {
    const kompally = { latitude: 17.5459, longitude: 78.4869 };
    const suchitra = { latitude: 17.5185, longitude: 78.4652 };
    const km = haversineDistanceKm(kompally, suchitra);
    expect(km).toBeGreaterThan(2);
    expect(km).toBeLessThan(6);
  });

  it('returns a large distance between distant cities', () => {
    const hyderabad = { latitude: 17.385, longitude: 78.4867 };
    const mumbai = { latitude: 19.076, longitude: 72.8777 };
    expect(haversineDistanceKm(hyderabad, mumbai)).toBeGreaterThan(600);
  });
});

describe('matchesSearchTerms', () => {
  it('matches when every term is present, in any order', () => {
    expect(matchesSearchTerms('suchitra, hyderabad', 'Kompally, Hyderabad Suchitra Lake View')).toBe(true);
  });

  it('does not match when a term is missing', () => {
    expect(matchesSearchTerms('suchitra, hyderabad', 'Kompally, Hyderabad')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(matchesSearchTerms('HYDERABAD', 'hyderabad')).toBe(true);
  });

  it('treats an empty query as matching everything', () => {
    expect(matchesSearchTerms('', 'anything')).toBe(true);
    expect(matchesSearchTerms('   ', 'anything')).toBe(true);
  });

  it('ignores punctuation differences between query and haystack', () => {
    expect(matchesSearchTerms('koramangala', 'Koramangala, Bangalore')).toBe(true);
  });
});

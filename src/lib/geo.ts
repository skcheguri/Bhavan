export interface Coordinates {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_KM = 6371;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineDistanceKm(a: Coordinates, b: Coordinates): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

// Splits a free-text search query into terms and requires every term to
// appear somewhere in the haystack -- so "suchitra, hyderabad" matches a
// listing whose title/location contain both "suchitra" and "hyderabad"
// anywhere, in any order, rather than needing the whole query as one
// literal substring.
export function matchesSearchTerms(query: string, haystack: string): boolean {
  const terms = query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (terms.length === 0) return true;
  const target = haystack.toLowerCase();
  return terms.every((term) => target.includes(term));
}

import type { Coordinates } from './geo';
import { getSupabase } from './supabase';

// Primary: Google's Geocoding API via the "geocode" edge function (keeps the
// API key server-side). Until GOOGLE_MAPS_API_KEY is set as a Supabase
// secret, the function reports itself unconfigured and callers fall back
// to Nominatim below rather than erroring.
async function geocodeViaGoogle(query: string): Promise<{ configured: boolean; coords: Coordinates | null }> {
  const supabase = getSupabase();
  if (!supabase) return { configured: false, coords: null };

  try {
    const { data, error } = await supabase.functions.invoke('geocode', { body: { query } });
    if (error || !data) return { configured: false, coords: null };

    const { configured, latitude, longitude } = data as { configured: boolean; latitude: number | null; longitude: number | null };
    if (!configured) return { configured: false, coords: null };
    if (latitude == null || longitude == null) return { configured: true, coords: null };
    return { configured: true, coords: { latitude, longitude } };
  } catch {
    return { configured: false, coords: null };
  }
}

// Fallback: OpenStreetMap's free Nominatim geocoder -- no API key/billing
// required, used until a Google Maps key is configured (or if Google's
// lookup happens to fail). Usage policy caps this at ~1 request/second; we
// only call it once per listing create/edit and once per search submission
// (both human-paced actions), which stays well within that.
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

async function geocodeViaNominatim(query: string): Promise<Coordinates | null> {
  try {
    const url = new URL(NOMINATIM_URL);
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', '1');
    url.searchParams.set('countrycodes', 'in');
    url.searchParams.set('q', query);

    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;

    const results = (await res.json()) as { lat: string; lon: string }[];
    if (!results.length) return null;

    const latitude = Number(results[0].lat);
    const longitude = Number(results[0].lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

    return { latitude, longitude };
  } catch {
    return null;
  }
}

export async function geocodeAddress(query: string): Promise<Coordinates | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const google = await geocodeViaGoogle(trimmed);
  if (google.configured) return google.coords;

  return geocodeViaNominatim(trimmed);
}

import { useState, useEffect, useCallback } from 'react';
import { getSupabase, isSupabaseConnected } from '@/lib/supabase';
import type { ListingCategory } from './useListings';

export interface NearbyPlace {
  label: string;
  distance: string;
  icon: string;
}

export interface Listing {
  id: string;
  category: ListingCategory;
  title: string;
  description: string;
  price: number;
  price_unit?: string;
  deposit: number;
  location: string;
  bedrooms: number;
  bathrooms: number;
  area: number;
  property_type: string;
  images: string[];
  landlord_name: string;
  landlord_avatar: string;
  furnished: boolean;
  parking: string;
  verified: boolean;
  amenities?: string[];
  created_at: string;
  owner_id: string;
  nearby: NearbyPlace[];
  views_count: number;
  inquiries_count: number;
  saves_count: number;
  max_guests: number | null;
  latitude: number | null;
  longitude: number | null;
}

function isValidUUID(str: string | undefined): boolean {
  if (!str) return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

const VIEWED_LISTINGS_KEY = 'bhavan_viewed_listings';

// Caps the view count at one per listing per browser session, so a page
// refresh or revisiting the same listing doesn't inflate it -- only a
// genuinely new visit (tile click, QR scan, shared link) counts.
function hasCountedViewThisSession(id: string): boolean {
  try {
    const viewed = JSON.parse(sessionStorage.getItem(VIEWED_LISTINGS_KEY) ?? '[]') as string[];
    if (viewed.includes(id)) return true;
    sessionStorage.setItem(VIEWED_LISTINGS_KEY, JSON.stringify([...viewed, id]));
    return false;
  } catch {
    return false;
  }
}

export function useListingDetail(id: string | undefined): {
  listing: Listing | null;
  loading: boolean;
  error: string | null;
} {
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchListing = useCallback(async () => {
    if (!id || !isSupabaseConnected() || !isValidUUID(id)) {
      setListing(null);
      setLoading(false);
      return;
    }

    const supabase = getSupabase();
    if (!supabase) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const { data, error: dbError } = await supabase
      .from('listings')
      .select('*, owner:users_public!listings_owner_id_fkey(name, avatar_url, verified_aadhaar)')
      .eq('id', id)
      .eq('status', 'active')
      .maybeSingle();

    if (dbError) {
      setError(dbError.message);
      setListing(null);
      setLoading(false);
    } else if (data) {
      const db = data as Record<string, unknown>;
      const owner = (db.owner ?? {}) as Record<string, unknown>;

      const mapped: Listing = {
        id: String(db.id),
        category: (db.category ?? 'residential') as ListingCategory,
        title: String(db.title ?? ''),
        description: String(db.description ?? ''),
        price: Number(db.price ?? 0),
        price_unit: (db.category as string) === 'vacation' ? 'night' : undefined,
        deposit: Number(db.deposit ?? 0),
        location: String(db.location ?? db.city ?? 'Unknown'),
        bedrooms: Number(db.bedrooms ?? 0),
        bathrooms: Number(db.bathrooms ?? 1),
        area: Number(db.area_sqft ?? 0),
        property_type: String(db.property_type ?? 'apartment'),
        images:
          Array.isArray(db.images) && (db.images as string[]).length > 0
            ? (db.images as string[])
            : [
                '/placeholders/photo.svg',
              ],
        landlord_name: owner.name ? String(owner.name) : 'Bhavan Owner',
        landlord_avatar: owner.avatar_url
          ? String(owner.avatar_url)
          : '/placeholders/avatar.svg',
        furnished: Boolean(db.furnished ?? false),
        parking: String(db.parking ?? 'none'),
        verified: Boolean(db.verified ?? false),
        amenities: Array.isArray(db.amenities) ? (db.amenities as string[]) : [],
        owner_id: String(db.owner_id ?? ''),
        created_at: String(db.created_at ?? ''),
        nearby: Array.isArray(db.nearby_places)
          ? (db.nearby_places as { label?: string; distance?: string }[])
              .filter((p) => p.label && p.distance)
              .map((p) => ({ label: String(p.label), distance: String(p.distance), icon: 'ri-map-pin-2-line' }))
          : [],
        views_count: Number(db.views_count ?? 0),
        inquiries_count: Number(db.inquiries_count ?? 0),
        saves_count: Number(db.saves_count ?? 0),
        max_guests: db.max_guests != null ? Number(db.max_guests) : null,
        latitude: db.latitude != null ? Number(db.latitude) : null,
        longitude: db.longitude != null ? Number(db.longitude) : null,
      };
      setListing(mapped);
      setLoading(false);
      // supabase-js query/RPC builders are "thenable" -- the actual fetch
      // only fires once something awaits/then()s them, so this still
      // needs a .then() to actually go out. It's just a view counter,
      // not something the page needs before it can render -- awaiting
      // it here would add a second full network round-trip in front of
      // every listing view for no reason the user can see.
      if (!hasCountedViewThisSession(id)) {
        supabase.rpc('increment_listing_counter', { p_listing_id: id, p_counter: 'views_count', p_delta: 1 })
          .then(({ error: rpcError }) => {
            if (rpcError) console.warn('Failed to increment listing view count:', rpcError.message);
          });
      }
    } else {
      setListing(null);
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchListing();
  }, [fetchListing]);

  return { listing, loading, error };
}

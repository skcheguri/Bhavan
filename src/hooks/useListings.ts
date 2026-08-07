import { readCache, writeCache } from '@/lib/offlineCache';
import { useState, useEffect, useCallback } from 'react';
import { getSupabase, isSupabaseConnected } from '@/lib/supabase';
import type { Tables } from '@/types/database.types';
import type { Json } from '@/types/database.types';

export type ListingCategory = 'residential' | 'commercial' | 'vacation';

export type NearbyPlace = { label: string; distance: string };

// The generated listings Row plus the joined relations the queries below
// select, with nearby_places narrowed from `json` to its real shape --
// that narrowing (inside toListings) is the single unchecked cast left in
// this file. Everything else is verified against the generated schema, so
// a renamed or dropped column fails compilation instead of silently
// rendering as '' in the UI.
export interface ListingFromDB extends Omit<Tables<'listings'>, 'nearby_places'> {
  nearby_places: NearbyPlace[] | null;
  owner?: {
    name: string | null;
    avatar_url: string | null;
    verified_aadhaar: boolean | null;
  };
  property?: {
    address: string | null;
  } | null;
}

// Parameter type is structural on purpose: passing query results here is
// what proves, at compile time, that every column ListingFromDB expects
// still exists in the database.
type ListingJoinedRow = Omit<ListingFromDB, 'nearby_places'> & { nearby_places: Json | null };

function toListings(rows: ListingJoinedRow[]): ListingFromDB[] {
  return rows.map((row) => ({
    ...row,
    nearby_places: (row.nearby_places as unknown as NearbyPlace[] | null) ?? null,
  }));
}

interface UseListingsReturn {
  listings: ListingFromDB[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  /**
   * Set only when these rows came from the offline cache rather than the
   * network, so the screen can say so. Rents and availability change; a
   * snapshot presented as live is worse than no snapshot.
   */
  cachedAt?: Date | null;
}

export function useListings(category?: string): UseListingsReturn {
  const [listings, setListings] = useState<ListingFromDB[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchListings = useCallback(async () => {
    if (!isSupabaseConnected()) {
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

    let query = supabase
      .from('listings')
      .select('*, owner:users_public!listings_owner_id_fkey(name, avatar_url, verified_aadhaar)')
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (category && category !== 'all') {
      query = query.eq('category', category);
    }

    const { data, error: dbError } = await query;

    if (dbError) {
      setError(dbError.message);
      setListings([]);
    } else {
      setListings(toListings(data ?? []));
    }
    setLoading(false);
  }, [category]);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  return { listings, loading, error, refresh: fetchListings };
}

export function useOwnerListings(ownerId: string | undefined): UseListingsReturn {
  const [listings, setListings] = useState<ListingFromDB[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchListings = useCallback(async () => {
    if (!isSupabaseConnected() || !ownerId) {
      setLoading(false);
      return;
    }
    const supabase = getSupabase();
    if (!supabase) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error: dbError } = await supabase
      .from('listings')
      .select('*, owner:users_public!listings_owner_id_fkey(name, avatar_url, verified_aadhaar), property:properties(address)')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false });

    if (dbError) {
      setError(dbError.message);
      setListings([]);
    } else {
      setListings(toListings(data ?? []));
    }
    setLoading(false);
  }, [ownerId]);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  return { listings, loading, error, refresh: fetchListings };
}

export function useSavedListings(userId: string | undefined): UseListingsReturn {
  const [listings, setListings] = useState<ListingFromDB[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // When these came from the cache rather than the network. Null means
  // live -- the UI uses this to label a snapshot honestly instead of
  // passing old rents off as current.
  const [cachedAt, setCachedAt] = useState<Date | null>(null);

  const fetchSaved = useCallback(async () => {
    if (!isSupabaseConnected() || !userId) {
      setLoading(false);
      return;
    }
    const supabase = getSupabase();
    if (!supabase) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error: dbError } = await supabase
      .from('saved_listings')
      .select('listing_id')
      .eq('user_id', userId);

    if (dbError) {
      // Offline, or the request failed. Saved listings are the one thing
      // a user deliberately kept, so fall back to the last snapshot rather
      // than showing an empty shelf.
      const cached = await readCache<ListingFromDB[]>('savedListings', userId);
      if (cached.data) {
        setListings(cached.data);
        setCachedAt(cached.cachedAt);
        setError(null);
      } else {
        setError(dbError.message);
        setListings([]);
      }
      setLoading(false);
      return;
    }

    if (!data || data.length === 0) {
      setListings([]);
      setCachedAt(null);
      await writeCache('savedListings', userId, []);
      setLoading(false);
      return;
    }

    const listingIds = data.map((d) => d.listing_id);
    const { data: listingsData, error: listingsError } = await supabase
      .from('listings')
      .select('*, owner:users_public!listings_owner_id_fkey(name, avatar_url, verified_aadhaar)')
      .in('id', listingIds)
      .eq('status', 'active');

    if (listingsError) {
      const cached = await readCache<ListingFromDB[]>('savedListings', userId);
      if (cached.data) {
        setListings(cached.data);
        setCachedAt(cached.cachedAt);
        setError(null);
      } else {
        setError(listingsError.message);
        setListings([]);
      }
    } else {
      const fresh = toListings(listingsData ?? []);
      setListings(fresh);
      setCachedAt(null);
      await writeCache('savedListings', userId, fresh);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchSaved();
  }, [fetchSaved]);

  return { listings, loading, error, refresh: fetchSaved };
}

// saveListing/createProperty that used to live here were dead exports --
// list-property/page.tsx inserts directly with the (now typed) client, and
// the real createProperty lives in useProperties.ts.
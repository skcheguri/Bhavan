import { readCache, writeCache } from '@/lib/offlineCache';
import { useState, useEffect, useCallback, useRef } from 'react';
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

// Default listings page size (Part D). The old code ordered but never
// bounded the query, so every browse pulled the entire active table.
export const LISTINGS_PAGE_SIZE = 20;
// Upper bound for "fetch everything matching" mode (text or near-me search,
// where paging would hide a match). Generous for the pilot; never a full
// unbounded scan.
const FETCH_ALL_CAP = 500;

// The attribute filters the database can evaluate directly. Text search and
// the near-me radius stay client-side (free-text matching and haversine over
// geocoded coordinates), so they are deliberately NOT here.
export interface ListingAttributeFilters {
  category?: string;       // undefined / 'all' => no category filter
  propertyType?: string;   // 'all' => none
  priceMin?: number | null;
  priceMax?: number | null;
  bedrooms?: string;       // 'all' | '0' | '1' | '2' | '3+'
  furnished?: string;      // 'all' | 'yes' | 'no'
  parking?: string;        // 'all' | '2-wheeler' | '4-wheeler' | 'both'
  maxGuests?: string;      // 'all' | '2' | '4' | '6' | '8+'
  verifiedOnly?: boolean;
}

interface UseListingsOptions {
  pageSize?: number;
  /** Fetch all matching rows at once (capped) instead of paging. Used when
   *  a text or near-me search is active so client-side matching sees every
   *  candidate, not just the first page. */
  fetchAll?: boolean;
}

interface UsePaginatedListingsReturn extends UseListingsReturn {
  /** Total rows matching the server-side filters, across all pages. */
  total: number;
  loadingMore: boolean;
  hasMore: boolean;
  loadMore: () => void;
}

export function useListings(
  filters: ListingAttributeFilters = {},
  options: UseListingsOptions = {},
): UsePaginatedListingsReturn {
  const pageSize = options.pageSize ?? LISTINGS_PAGE_SIZE;
  const fetchAll = options.fetchAll ?? false;
  // Destructured so the fetch callback depends on stable primitives, not a
  // fresh filters object identity every render.
  const { category, propertyType, priceMin, priceMax, bedrooms, furnished, parking, maxGuests, verifiedOnly } = filters;

  const [listings, setListings] = useState<ListingFromDB[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pageRef = useRef(0);
  // Sequence tag: switching filters/tabs quickly races two fetches, and
  // without this the slower response can land last and show the wrong set.
  // Only the newest request is allowed to write state.
  const requestIdRef = useRef(0);

  const fetchPage = useCallback(async (page: number, append: boolean) => {
    if (!isSupabaseConnected()) {
      setLoading(false);
      return;
    }
    const supabase = getSupabase();
    if (!supabase) {
      setLoading(false);
      return;
    }

    const reqId = ++requestIdRef.current;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);

    let query = supabase
      .from('listings')
      .select('*, owner:users_public!listings_owner_id_fkey(name, avatar_url, verified_aadhaar)', { count: 'exact' })
      .eq('status', 'active');

    if (category && category !== 'all') query = query.eq('category', category);
    if (propertyType && propertyType !== 'all') query = query.eq('property_type', propertyType);
    if (priceMin != null) query = query.gte('price', priceMin);
    if (priceMax != null) query = query.lte('price', priceMax);
    if (bedrooms === '0') query = query.eq('bedrooms', 0);
    else if (bedrooms === '1') query = query.eq('bedrooms', 1);
    else if (bedrooms === '2') query = query.eq('bedrooms', 2);
    else if (bedrooms === '3+') query = query.gte('bedrooms', 3);
    if (furnished === 'yes') query = query.eq('furnished', true);
    else if (furnished === 'no') query = query.eq('furnished', false);
    if (parking === '2-wheeler') query = query.in('parking', ['2-wheeler', 'both']);
    else if (parking === '4-wheeler') query = query.in('parking', ['4-wheeler', 'both']);
    else if (parking === 'both') query = query.eq('parking', 'both');
    if (maxGuests === '2') query = query.lte('max_guests', 2);
    else if (maxGuests === '4') query = query.lte('max_guests', 4);
    else if (maxGuests === '6') query = query.lte('max_guests', 6);
    else if (maxGuests === '8+') query = query.gte('max_guests', 8);
    if (verifiedOnly) query = query.eq('verified', true);

    // `id` is a deterministic tiebreaker: listings created in the same bulk
    // insert can share a created_at to the second, and without a stable
    // secondary sort the range() window shifts between page fetches, so a
    // row can appear on two pages (duplicate React keys) or be skipped.
    query = query.order('created_at', { ascending: false }).order('id', { ascending: false });
    query = fetchAll
      ? query.limit(FETCH_ALL_CAP)
      : query.range(page * pageSize, page * pageSize + pageSize - 1);

    const { data, error: dbError, count } = await query;

    if (reqId !== requestIdRef.current) return;

    if (dbError) {
      setError(dbError.message);
      if (!append) setListings([]);
    } else {
      const rows = toListings(data ?? []);
      setListings((prev) => (append ? [...prev, ...rows] : rows));
      if (typeof count === 'number') setTotal(count);
    }
    if (append) setLoadingMore(false);
    else setLoading(false);
  }, [category, propertyType, priceMin, priceMax, bedrooms, furnished, parking, maxGuests, verifiedOnly, pageSize, fetchAll]);

  useEffect(() => {
    pageRef.current = 0;
    fetchPage(0, false);
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (fetchAll || loading || loadingMore) return;
    pageRef.current += 1;
    fetchPage(pageRef.current, true);
  }, [fetchAll, loading, loadingMore, fetchPage]);

  const refresh = useCallback(() => {
    pageRef.current = 0;
    fetchPage(0, false);
  }, [fetchPage]);

  const hasMore = !fetchAll && listings.length < total;

  return { listings, total, loading, loadingMore, error, hasMore, loadMore, refresh };
}

// Category tab totals come from a single grouped count RPC instead of a
// second full-table fetch of every active listing (Part D: the page used to
// pull the entire table twice -- once scoped, once unscoped -- just to number
// the tabs).
export function useListingCounts(): Record<string, number> {
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!isSupabaseConnected()) return;
    const supabase = getSupabase();
    if (!supabase) return;
    let active = true;
    supabase.rpc('get_active_listing_counts').then(({ data, error: rpcError }) => {
      if (!active || rpcError || !data) return;
      const map: Record<string, number> = {};
      let all = 0;
      for (const row of data) {
        const n = Number(row.count);
        map[row.category] = n;
        all += n;
      }
      map.all = all;
      setCounts(map);
    });
    return () => {
      active = false;
    };
  }, []);

  return counts;
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

  // cachedAt is surfaced (additive) so a consumer can label a snapshot
  // honestly -- it was maintained but never returned, so the "showing saved
  // copy" indicator the comments promise had nothing to read.
  return { listings, loading, error, refresh: fetchSaved, cachedAt };
}

// saveListing/createProperty that used to live here were dead exports --
// list-property/page.tsx inserts directly with the (now typed) client, and
// the real createProperty lives in useProperties.ts.
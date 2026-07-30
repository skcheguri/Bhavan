import { useState, useEffect, useCallback } from 'react';
import { getSupabase, isSupabaseConnected } from '@/lib/supabase';

export type ListingCategory = 'residential' | 'commercial' | 'vacation';

export interface ListingFromDB {
  id: string;
  property_id: string | null;
  owner_id: string;
  title: string;
  description: string | null;
  price: number;
  deposit: number | null;
  maintenance_charge: number | null;
  location: string | null;
  city: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  area_sqft: number | null;
  furnished: boolean | null;
  parking: string | null;
  property_type: string | null;
  images: string[];
  amenities: string[];
  nearby_places: { label: string; distance: string }[] | null;
  status: string | null;
  verified: boolean | null;
  views_count: number | null;
  inquiries_count: number | null;
  saves_count: number | null;
  created_at: string;
  category: string | null;
  latitude: number | null;
  longitude: number | null;
  owner?: {
    name: string | null;
    avatar_url: string | null;
    verified_aadhaar: boolean | null;
  };
  property?: {
    address: string | null;
  } | null;
}

interface UseListingsReturn {
  listings: ListingFromDB[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
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
      setListings((data as ListingFromDB[]) ?? []);
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
      setListings((data as ListingFromDB[]) ?? []);
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

    if (dbError || !data || data.length === 0) {
      setListings([]);
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
      setError(listingsError.message);
      setListings([]);
    } else {
      setListings((listingsData as ListingFromDB[]) ?? []);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchSaved();
  }, [fetchSaved]);

  return { listings, loading, error, refresh: fetchSaved };
}

export async function saveListing(listingData: Partial<ListingFromDB>): Promise<{ data: ListingFromDB | null; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { data: null, error: 'Supabase not connected' };

  const { data, error } = await supabase
    .from('listings')
    .insert(listingData)
    .select()
    .single();

  if (error) {
    return { data: null, error: error.message };
  }
  return { data: data as ListingFromDB, error: null };
}

export async function createProperty(propertyData: {
  owner_id: string;
  name: string;
  address: string;
  city: string;
  verified?: boolean;
}): Promise<{ data: { id: string } | null; error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { data: null, error: 'Supabase not connected' };

  const { data, error } = await supabase
    .from('properties')
    .insert(propertyData)
    .select('id')
    .single();

  if (error) {
    return { data: null, error: error.message };
  }
  return { data, error: null };
}
import { useState, useEffect, useCallback } from 'react';
import { getSupabase } from '@/lib/supabase';

export type AdminListingStatus = 'active' | 'inactive' | 'draft';

export type AdminListingSort = 'newest' | 'oldest_updated';

export interface AdminListingRow {
  id: string;
  title: string;
  location: string;
  city: string;
  ownerId: string;
  ownerName: string;
  price: number;
  status: AdminListingStatus;
  verified: boolean;
  category: string;
  createdAt: string;
  updatedAt: string;
}

function mapRow(r: Record<string, unknown>): AdminListingRow {
  return {
    id: String(r.id),
    title: String(r.title ?? ''),
    location: String(r.location ?? ''),
    city: String(r.city ?? ''),
    ownerId: String(r.owner_id ?? ''),
    ownerName: (r.owner as { name?: string } | null)?.name ?? 'Unknown owner',
    price: Number(r.price ?? 0),
    status: (r.status as AdminListingStatus) ?? 'draft',
    verified: Boolean(r.verified),
    category: String(r.category ?? ''),
    createdAt: String(r.created_at ?? ''),
    updatedAt: String(r.updated_at ?? r.created_at ?? ''),
  };
}

export function useAdminListings() {
  const [listings, setListings] = useState<AdminListingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<AdminListingSort>('newest');

  const load = useCallback(async (searchQuery: string, sortBy: AdminListingSort) => {
    const supabase = getSupabase();
    if (!supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);

    let query = supabase
      .from('listings')
      .select('id, title, location, city, owner_id, price, status, verified, category, created_at, updated_at, owner:users_public!listings_owner_id_fkey(name)')
      .order(sortBy === 'oldest_updated' ? 'updated_at' : 'created_at', { ascending: sortBy === 'oldest_updated' })
      .limit(200);

    if (searchQuery) {
      // users_public doesn't expose email, so owner name/email/phone
      // matches are resolved via the admin_list_users RPC first, then
      // folded into the listings filter as an owner_id.in(...) clause --
      // avoids relying on PostgREST's flakier embedded-resource filtering.
      const { data: matchingUsers } = await supabase.rpc('admin_list_users', {
        search_query: searchQuery,
        result_limit: 50,
      });
      const ownerIds = ((matchingUsers ?? []) as { id: string }[]).map((u) => u.id);

      const filters = [`title.ilike.%${searchQuery}%`, `location.ilike.%${searchQuery}%`, `city.ilike.%${searchQuery}%`];
      if (ownerIds.length > 0) {
        filters.push(`owner_id.in.(${ownerIds.join(',')})`);
      }
      query = query.or(filters.join(','));
    }

    const { data, error } = await query;

    if (error) {
      console.warn('Supabase admin listings fetch error:', error.message);
      setListings([]);
    } else {
      setListings(((data ?? []) as Record<string, unknown>[]).map(mapRow));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => load(search, sort), 300);
    return () => clearTimeout(handle);
  }, [search, sort, load]);

  const setStatus = useCallback(
    async (id: string, status: AdminListingStatus): Promise<boolean> => {
      const supabase = getSupabase();
      if (!supabase) return false;
      const { error } = await supabase.from('listings').update({ status }).eq('id', id);
      if (error) {
        console.warn('Supabase admin listing status update error:', error.message);
        return false;
      }
      await load(search, sort);
      return true;
    },
    [load, search, sort]
  );

  return { listings, loading, search, setSearch, sort, setSort, setStatus, refresh: () => load(search, sort) };
}

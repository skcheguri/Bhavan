import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import type { TablesInsert } from '@/types/database.types';

export interface PropertyVisit {
  id: string;
  tenant_id: string;
  owner_id: string;
  listing_id: string;
  visit_date: string;
  visit_time: string;
  visitor_name: string;
  visitor_phone: string;
  visitor_email: string;
  note: string | null;
  status: 'requested' | 'confirmed' | 'cancelled' | 'completed';
  created_at: string;
}

export function useTenantPropertyVisits(tenantId: string | undefined) {
  const [visits, setVisits] = useState<PropertyVisit[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase || !tenantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('property_visits')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Supabase property_visits fetch error:', error.message);
      setVisits([]);
    } else {
      setVisits((data as PropertyVisit[]) ?? []);
    }
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { visits, loading, refresh };
}

export interface CreatePropertyVisitInput {
  tenantId: string;
  listingId: string;
  visitDate: string;
  visitTime: string;
  visitorName: string;
  visitorPhone: string;
  visitorEmail: string;
  note?: string;
}

export function useCreatePropertyVisit() {
  const [creating, setCreating] = useState(false);

  const create = useCallback(async (input: CreatePropertyVisitInput): Promise<{ error: string | null }> => {
    const supabase = getSupabase();
    if (!supabase) return { error: 'Supabase not connected' };

    setCreating(true);
    // owner_id is deliberately omitted: trg_set_property_visit_owner
    // derives it from the listing server-side (a client-supplied value
    // shouldn't be trusted for it anyway). The generated Insert type
    // can't know about the trigger, hence the cast.
    const { data, error } = await supabase
      .from('property_visits')
      .insert({
        tenant_id: input.tenantId,
        listing_id: input.listingId,
        visit_date: input.visitDate,
        visit_time: input.visitTime,
        visitor_name: input.visitorName,
        visitor_phone: input.visitorPhone,
        visitor_email: input.visitorEmail,
        note: input.note || null,
      } as unknown as TablesInsert<'property_visits'>)
      .select('id')
      .single();

    if (error) {
      setCreating(false);
      if (error.code === '23505') {
        return { error: 'You already have a visit request for this property.' };
      }
      return { error: error.message };
    }

    await supabase.rpc('notify_visit_requested', { p_visit_id: data.id });
    setCreating(false);
    return { error: null };
  }, []);

  return { create, creating };
}

export interface OwnerPropertyVisit extends PropertyVisit {
  listing_title: string;
}

export function useOwnerPropertyVisits(ownerId: string | undefined) {
  const [visits, setVisits] = useState<OwnerPropertyVisit[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase || !ownerId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('property_visits')
      .select('*, listing:listings!property_visits_listing_id_fkey(title)')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Supabase property_visits (owner) fetch error:', error.message);
      setVisits([]);
    } else {
      const mapped = ((data ?? []) as Record<string, unknown>[]).map((row): OwnerPropertyVisit => {
        const listingRow = (row.listing ?? {}) as { title?: string };
        return {
          id: String(row.id),
          tenant_id: String(row.tenant_id),
          owner_id: String(row.owner_id),
          listing_id: String(row.listing_id),
          visit_date: String(row.visit_date),
          visit_time: String(row.visit_time),
          visitor_name: String(row.visitor_name ?? ''),
          visitor_phone: String(row.visitor_phone ?? ''),
          visitor_email: String(row.visitor_email ?? ''),
          note: (row.note as string | null) ?? null,
          status: row.status as PropertyVisit['status'],
          created_at: String(row.created_at),
          listing_title: listingRow.title || 'Listing',
        };
      });
      setVisits(mapped);
    }
    setLoading(false);
  }, [ownerId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const updateStatus = useCallback(async (id: string, status: 'confirmed' | 'cancelled'): Promise<{ error: string | null }> => {
    const supabase = getSupabase();
    if (!supabase) return { error: 'Supabase not connected' };

    const { error } = await supabase
      .from('property_visits')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) return { error: error.message };
    await refresh();
    return { error: null };
  }, [refresh]);

  return { visits, loading, refresh, updateStatus };
}

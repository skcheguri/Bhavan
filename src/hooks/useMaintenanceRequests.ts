import { useState, useEffect, useCallback } from 'react';
import { getSupabase, isSupabaseConnected } from '@/lib/supabase';

export interface MaintenanceRequest {
  id: string;
  tenant_id: string;
  agreement_id: string | null;
  owner_id: string | null;
  property_id: string | null;
  category: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'acknowledged' | 'in_progress' | 'resolved';
  images: string[];
  landlord_notes: string | null;
  unit: string | null;
  preferred_time: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export interface CreateMaintenanceRequestInput {
  tenant_id: string;
  agreement_id: string;
  category: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  unit?: string;
  preferred_time?: string;
}

export function useMaintenanceRequests(tenantId: string | undefined) {
  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
    if (!isSupabaseConnected() || !tenantId) {
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
      .from('maintenance_requests')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (dbError) {
      setError(dbError.message);
      setRequests([]);
    } else {
      setRequests((data as MaintenanceRequest[]) ?? []);
    }
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const refresh = fetchRequests;

  return { requests, loading, error, refresh };
}

export function useCreateMaintenanceRequest() {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(async (
    input: CreateMaintenanceRequestInput
  ): Promise<{ data: MaintenanceRequest | null; error: string | null }> => {
    if (!isSupabaseConnected()) {
      return { data: null, error: 'Supabase not connected' };
    }
    const supabase = getSupabase();
    if (!supabase) {
      return { data: null, error: 'Supabase not connected' };
    }

    setCreating(true);
    setError(null);

    const { data, error: dbError } = await supabase
      .from('maintenance_requests')
      .insert({
        tenant_id: input.tenant_id,
        agreement_id: input.agreement_id,
        category: input.category,
        title: input.title,
        description: input.description,
        priority: input.priority,
        unit: input.unit || null,
        preferred_time: input.preferred_time || null,
        status: 'pending',
        images: [],
      })
      .select('*')
      .single();

    if (dbError) {
      setCreating(false);
      setError(dbError.message);
      return { data: null, error: dbError.message };
    }

    await supabase.rpc('notify_maintenance_request_created', { p_request_id: data.id });

    setCreating(false);
    return { data: data as MaintenanceRequest, error: null };
  }, []);

  return { create, creating, error };
}

export interface OwnerMaintenanceRequest extends MaintenanceRequest {
  tenant_name: string;
  tenant_avatar: string | null;
  property_name: string;
}

export function useOwnerMaintenanceRequests(ownerId: string | undefined) {
  const [requests, setRequests] = useState<OwnerMaintenanceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRequests = useCallback(async () => {
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
      .from('maintenance_requests')
      .select('*, tenant:users_public!maintenance_requests_tenant_id_fkey(name, avatar_url), agreement:rental_agreements!maintenance_requests_agreement_id_fkey(property_address, flat_number)')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false });

    if (dbError) {
      setError(dbError.message);
      setRequests([]);
    } else {
      const mapped = ((data ?? []) as Record<string, unknown>[]).map((row): OwnerMaintenanceRequest => {
        const tenant = (row.tenant ?? {}) as { name?: string; avatar_url?: string };
        const agreement = (row.agreement ?? {}) as { property_address?: string; flat_number?: string };
        return {
          id: String(row.id),
          tenant_id: String(row.tenant_id),
          agreement_id: (row.agreement_id as string | null) ?? null,
          owner_id: (row.owner_id as string | null) ?? null,
          property_id: (row.property_id as string | null) ?? null,
          category: String(row.category),
          title: String(row.title ?? ''),
          description: String(row.description ?? ''),
          priority: row.priority as MaintenanceRequest['priority'],
          status: row.status as MaintenanceRequest['status'],
          images: (row.images as string[] | null) ?? [],
          landlord_notes: (row.landlord_notes as string | null) ?? null,
          unit: (row.unit as string | null) ?? null,
          preferred_time: (row.preferred_time as string | null) ?? null,
          created_at: String(row.created_at),
          updated_at: String(row.updated_at),
          resolved_at: (row.resolved_at as string | null) ?? null,
          tenant_name: tenant.name ?? 'Unknown',
          tenant_avatar: tenant.avatar_url ?? null,
          property_name: agreement.property_address || agreement.flat_number || 'Unknown property',
        };
      });
      setRequests(mapped);
    }
    setLoading(false);
  }, [ownerId]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const updateStatus = useCallback(async (
    id: string,
    status: 'acknowledged' | 'in_progress' | 'resolved',
    notes?: string
  ): Promise<{ error: string | null }> => {
    if (!isSupabaseConnected()) return { error: 'Supabase not connected' };
    const supabase = getSupabase();
    if (!supabase) return { error: 'Supabase not connected' };

    const updates: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (status === 'resolved') updates.resolved_at = new Date().toISOString();
    if (notes !== undefined) updates.landlord_notes = notes;

    const { error: dbError } = await supabase
      .from('maintenance_requests')
      .update(updates)
      .eq('id', id);

    if (dbError) return { error: dbError.message };
    await fetchRequests();
    return { error: null };
  }, [fetchRequests]);

  return { requests, loading, error, refresh: fetchRequests, updateStatus };
}

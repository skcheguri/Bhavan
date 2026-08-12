import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabase, isSupabaseConnected } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

export type RequestStatus = 'pending' | 'approved' | 'declined';

export interface ConnectionRequest {
  id: string;
  listingId: string;
  listingTitle: string;
  listingLocation: string;
  listingPrice: number;
  prospectId: string;
  prospectName: string;
  prospectInitials: string;
  prospectAvatar: string | null;
  prospectMessage: string;
  requestedAt: string;
  status: RequestStatus;
  respondedAt?: string;
  scannedViaQR: boolean;
  moveInDate?: string;
  occupation?: string;
  ownerId: string;
  ownerName: string;
  ownerAvatar: string | null;
}

const CONNECTION_REQUEST_SELECT =
  'id, tenant_id, owner_id, listing_id, listing_title, listing_location, listing_price, message, status, created_at, responded_at, scanned_via_qr, move_in_date, occupation, tenant:users_public!connection_requests_tenant_id_fkey(name, avatar_url), owner:users_public!connection_requests_owner_id_fkey(name, avatar_url)';

export function mapFromDb(row: Record<string, unknown>): ConnectionRequest {
  const tenant = (row.tenant ?? {}) as Record<string, unknown>;
  const owner = (row.owner ?? {}) as Record<string, unknown>;
  const tenantName = tenant.name ? String(tenant.name) : 'Unknown';
  return {
    id: String(row.id),
    listingId: String(row.listing_id ?? row.listingId ?? ''),
    listingTitle: String(row.listing_title ?? row.listingTitle ?? ''),
    listingLocation: String(row.listing_location ?? row.listingLocation ?? ''),
    listingPrice: Number(row.listing_price ?? row.listingPrice ?? 0),
    prospectId: String(row.tenant_id ?? row.prospectId ?? ''),
    prospectName: tenantName,
    prospectInitials: tenantName.trim().split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase(),
    prospectAvatar: tenant.avatar_url ? String(tenant.avatar_url) : null,
    prospectMessage: String(row.message ?? row.prospectMessage ?? ''),
    requestedAt: String(row.created_at ?? row.requestedAt ?? ''),
    status: (row.status as RequestStatus) ?? 'pending',
    respondedAt: row.responded_at ? String(row.responded_at) : undefined,
    scannedViaQR: Boolean(row.scanned_via_qr ?? row.scannedViaQR ?? false),
    moveInDate: row.move_in_date ? String(row.move_in_date) : undefined,
    occupation: row.occupation ? String(row.occupation) : undefined,
    ownerId: String(row.owner_id ?? ''),
    ownerName: owner.name ? String(owner.name) : 'Unknown',
    ownerAvatar: owner.avatar_url ? String(owner.avatar_url) : null,
  };
}

export function useOwnerConnectionRequests(ownerId: string | undefined) {
  const [requests, setRequests] = useState<ConnectionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!ownerId || !isSupabaseConnected()) {
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
      .from('connection_requests')
      .select(CONNECTION_REQUEST_SELECT)
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false });

    if (dbError) {
      setError(dbError.message);
      setRequests([]);
    } else if (data) {
      setRequests((data as unknown as Record<string, unknown>[]).map(mapFromDb));
    }
    setLoading(false);
  }, [ownerId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const updateStatus = useCallback(
    async (requestId: string, newStatus: RequestStatus) => {
      if (!isSupabaseConnected()) return false;
      const supabase = getSupabase();
      if (!supabase) return false;

      const { error: dbError } = await supabase
        .from('connection_requests')
        .update({ status: newStatus, responded_at: new Date().toISOString() })
        .eq('id', requestId)
        .eq('owner_id', ownerId ?? '');

      if (dbError) {
        setError(dbError.message);
        return false;
      }
      if (newStatus === 'approved') {
        await supabase.rpc('notify_connection_request_approved', { p_request_id: requestId });
      }
      setRequests((prev) =>
        prev.map((r) => (r.id === requestId ? { ...r, status: newStatus, respondedAt: new Date().toISOString() } : r)),
      );
      return true;
    },
    [ownerId],
  );

  return { requests, loading, error, updateStatus, refresh: fetch };
}

export function useTenantConnectionRequests(tenantId: string | undefined) {
  const [requests, setRequests] = useState<ConnectionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!tenantId || !isSupabaseConnected()) {
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
      .from('connection_requests')
      .select(CONNECTION_REQUEST_SELECT)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (dbError) {
      setError(dbError.message);
      setRequests([]);
    } else if (data) {
      setRequests((data as unknown as Record<string, unknown>[]).map(mapFromDb));
    }
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { requests, loading, error, refresh: fetch };
}

export function useCreateConnectionRequest() {
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  const create = useCallback(
    async (payload: {
      listingId: string;
      listingTitle: string;
      listingLocation: string;
      listingPrice: number;
      ownerId: string;
      message: string;
      moveInDate?: string;
      occupation?: string;
      scannedViaQR?: boolean;
    }): Promise<{ success: boolean; error?: string }> => {
      if (!isSupabaseConnected()) {
        return { success: false, error: 'Supabase not connected' };
      }
      const supabase = getSupabase();
      if (!supabase) {
        return { success: false, error: 'Supabase not connected' };
      }
      if (!user) {
        return { success: false, error: 'You must be signed in to send a request.' };
      }

      setSubmitting(true);
      try {
        // A non-UUID listingId can only be stale/mock data -- real
        // listings always have one. This used to return {success:true}
        // and write nothing, so the tenant saw "Request Sent!" for a
        // request that never existed. Fail honestly instead.
        if (!isValidUUID(payload.listingId)) {
          return { success: false, error: 'This listing is no longer available.' };
        }

        const { data: inserted, error: dbError } = await supabase
          .from('connection_requests')
          .insert({
            tenant_id: user.id,
            owner_id: payload.ownerId,
            listing_id: payload.listingId,
            listing_title: payload.listingTitle,
            listing_location: payload.listingLocation,
            listing_price: payload.listingPrice,
            message: payload.message,
            status: 'pending',
            move_in_date: payload.moveInDate ?? null,
            occupation: payload.occupation ?? null,
            scanned_via_qr: payload.scannedViaQR ?? false,
          })
          .select('id')
          .single();

        if (!dbError && inserted) {
          await supabase.rpc('notify_connection_request_created', { p_request_id: inserted.id });
        }

        if (dbError) {
          return { success: false, error: dbError.message };
        }
        // listings.inquiries_count is maintained by a trigger on
        // connection_requests (migration 119) -- no client-side bump.
        return { success: true };
      } finally {
        setSubmitting(false);
      }
    },
    [user],
  );

  return { create, submitting };
}
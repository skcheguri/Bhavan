import { useState, useEffect, useCallback } from 'react';
import { getSupabase } from '@/lib/supabase';

export type PropertyVerificationStatus = 'pending' | 'approved' | 'rejected';

export interface PropertyVerificationRequest {
  id: string;
  ownerId: string;
  ownerName: string;
  propertyName: string;
  address: string;
  city: string;
  verificationDocPath: string;
  listingImages: string[];
  /**
   * A property with no listing came through "add a flat you live in",
   * not through the listing flow. It changes what the reviewer is
   * looking at: there are no photos to cross-check, so the document and
   * the name on it are the whole case.
   */
  isResidence: boolean;
  status: PropertyVerificationStatus;
  rejectionReason: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

function deriveStatus(row: Record<string, unknown>): PropertyVerificationStatus {
  if (row.verified) return 'approved';
  if (row.verification_rejection_reason) return 'rejected';
  return 'pending';
}

export function useAdminPropertyVerification() {
  const [requests, setRequests] = useState<PropertyVerificationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);

    // Only properties that actually have a submitted document are this
    // queue's concern -- a property with no verification_doc_url hasn't
    // gone through the "prove ownership" step at all yet.
    const { data, error } = await supabase
      .from('properties')
      .select('id, owner_id, name, address, city, occupancy, verification_doc_url, verified, verification_rejection_reason, verification_reviewed_at, created_at, owner:users_public!properties_owner_id_fkey(name), listings!listings_property_id_fkey(images)')
      .not('verification_doc_url', 'is', null)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Supabase properties verification fetch error:', error.message);
      setError(error.message);
      setRequests([]);
      setLoading(false);
      return;
    }

    setError(null);
    setRequests(
      ((data ?? []) as Record<string, unknown>[]).map((row) => ({
        id: String(row.id),
        ownerId: String(row.owner_id),
        ownerName: (row.owner as { name?: string } | null)?.name ?? 'Unknown owner',
        propertyName: String(row.name ?? ''),
        address: String(row.address ?? ''),
        city: String(row.city ?? ''),
        verificationDocPath: String(row.verification_doc_url ?? ''),
        listingImages: ((row.listings as { images?: string[] }[] | null)?.[0]?.images ?? []) as string[],
        isResidence:
          ((row.listings as unknown[] | null)?.length ?? 0) === 0 &&
          row.occupancy === 'self_occupied',
        status: deriveStatus(row),
        rejectionReason: (row.verification_rejection_reason as string | null) ?? null,
        createdAt: String(row.created_at),
        reviewedAt: (row.verification_reviewed_at as string | null) ?? null,
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const approve = useCallback(
    async (id: string): Promise<boolean> => {
      const supabase = getSupabase();
      if (!supabase) return false;
      const { error } = await supabase
        .from('properties')
        .update({
          verified: true,
          verification_rejection_reason: null,
          verification_reviewed_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) {
        console.warn('Supabase property approve error:', error.message);
        return false;
      }
      await load();
      return true;
    },
    [load]
  );

  const reject = useCallback(
    async (id: string, reason: string): Promise<boolean> => {
      const supabase = getSupabase();
      if (!supabase) return false;
      const { error } = await supabase
        .from('properties')
        .update({
          verified: false,
          verification_rejection_reason: reason,
          verification_reviewed_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) {
        console.warn('Supabase property reject error:', error.message);
        return false;
      }
      await load();
      return true;
    },
    [load]
  );

  // ownership-documents is a private bucket -- a signed URL is the only
  // way to actually view the file (the bare path stored on the property
  // row isn't fetchable on its own).
  const getDocumentUrl = useCallback(async (path: string): Promise<string | null> => {
    const supabase = getSupabase();
    if (!supabase) return null;
    const { data, error } = await supabase.storage.from('ownership-documents').createSignedUrl(path, 300);
    if (error) {
      console.warn('Supabase signed URL error:', error.message);
      return null;
    }
    return data.signedUrl;
  }, []);

  return { requests, loading, error, approve, reject, getDocumentUrl, refresh: load };
}

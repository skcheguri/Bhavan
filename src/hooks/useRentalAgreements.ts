import { readCache, writeCache } from '@/lib/offlineCache';
import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import type { RentalAgreementData } from '@/lib/documents/rentalAgreementDocument';
import type { Tables } from '@/types/database.types';

export type AgreementStatus = 'draft' | 'pending_admin' | 'signed' | 'stamped' | 'completed';

export function agreementStatusMeta(status: AgreementStatus): { label: string; cls: string } {
  switch (status) {
    case 'pending_admin': return { label: 'With Bhavan · stamp duty', cls: 'bg-blue-50 text-blue-600' };
    case 'signed': return { label: 'Signed · ready to share', cls: 'bg-emerald-50 text-emerald-600' };
    case 'stamped': return { label: 'Stamped · ready to share', cls: 'bg-emerald-50 text-emerald-600' };
    case 'completed': return { label: 'Shared with tenant', cls: 'bg-green-50 text-green-600' };
    default: return { label: 'Awaiting signatures', cls: 'bg-amber-50 text-amber-600' };
  }
}

export interface RentalAgreementRow extends RentalAgreementData {
  id: string;
  ownerId: string;
  tenantId: string | null;
  listingId: string | null;
  signedByLandlord: boolean;
  signedByTenant: boolean;
  sharedWithTenant: boolean;
  sharedAt: string | null;
  agreementStatus: AgreementStatus;
  landlordSignatureName: string | null;
  landlordSignedAt: string | null;
  tenantSignatureName: string | null;
  tenantSignedAt: string | null;
  stampedDocumentPath: string | null;
  adminProcessedAt: string | null;
  stampDutyRequested: boolean;
}

// Typed against the generated schema row (not Record<string, unknown>)
// on purpose: these fields end up in a legal document, so a renamed or
// dropped column must be a compile error here -- never a silently blank
// PAN or landlord name in a generated agreement.
function mapRow(r: Tables<'rental_agreements'>): RentalAgreementRow {
  return {
    id: String(r.id),
    ownerId: String(r.owner_id ?? ''),
    tenantId: (r.tenant_id as string | null) ?? null,
    listingId: (r.listing_id as string | null) ?? null,
    agreementNumber: String(r.agreement_number ?? ''),
    tenantName: String(r.tenant_name ?? ''),
    tenantAddress: String(r.tenant_address ?? ''),
    tenantPhone: String(r.tenant_phone ?? ''),
    tenantEmail: String(r.tenant_email ?? ''),
    tenantPan: String(r.tenant_pan ?? ''),
    tenantAadhaarMasked: String(r.tenant_aadhaar_masked ?? ''),
    landlordName: String(r.landlord_name ?? ''),
    landlordAddress: String(r.landlord_address ?? ''),
    landlordPhone: String(r.landlord_phone ?? ''),
    landlordEmail: String(r.landlord_email ?? ''),
    landlordPan: String(r.landlord_pan ?? ''),
    propertyAddress: String(r.property_address ?? ''),
    propertyDescription: String(r.property_description ?? ''),
    flatNumber: String(r.flat_number ?? ''),
    carpetArea: Number(r.carpet_area ?? 0),
    leaseStartDate: String(r.lease_start_date ?? ''),
    leaseEndDate: String(r.lease_end_date ?? ''),
    monthlyRent: Number(r.monthly_rent ?? 0),
    securityDeposit: Number(r.security_deposit ?? 0),
    rentDueDay: Number(r.rent_due_day ?? 5),
    paymentMode: String(r.payment_mode ?? ''),
    maintenanceAmount: Number(r.maintenance_amount ?? 0),
    noticePeriodDays: Number(r.notice_period_days ?? 30),
    lockInMonths: Number(r.lock_in_months ?? 0),
    renewalClause: String(r.renewal_clause ?? ''),
    witness1Name: String(r.witness1_name ?? ''),
    witness1Address: String(r.witness1_address ?? ''),
    witness2Name: String(r.witness2_name ?? ''),
    witness2Address: String(r.witness2_address ?? ''),
    clauses: Array.isArray(r.clauses) ? (r.clauses as string[]) : [],
    createdAt: String(r.created_at ?? ''),
    signedByLandlord: Boolean(r.signed_by_landlord),
    signedByTenant: Boolean(r.signed_by_tenant),
    sharedWithTenant: Boolean(r.shared_with_tenant),
    sharedAt: (r.shared_at as string | null) ?? null,
    agreementStatus: (r.agreement_status as AgreementStatus) ?? 'draft',
    landlordSignatureName: (r.landlord_signature_name as string | null) ?? null,
    landlordSignedAt: (r.landlord_signed_at as string | null) ?? null,
    tenantSignatureName: (r.tenant_signature_name as string | null) ?? null,
    tenantSignedAt: (r.tenant_signed_at as string | null) ?? null,
    stampedDocumentPath: (r.stamped_document_path as string | null) ?? null,
    adminProcessedAt: (r.admin_processed_at as string | null) ?? null,
    stampDutyRequested: r.stamp_duty_requested !== false,
  };
}

// A short-lived signed URL for the admin-uploaded stamped PDF. Readable
// only by the two parties (and admins) via the storage RLS in migration
// 137; anyone else gets null.
export async function getStampedAgreementUrl(path: string): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data } = await supabase.storage.from('stamped-agreements').createSignedUrl(path, 300);
  return data?.signedUrl ?? null;
}

// Sign as whichever party the caller is (the RPC decides from auth.uid()).
export async function signRentalAgreement(agreementId: string, signerName: string): Promise<{ error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { error: 'Not available right now.' };
  const { error } = await supabase.rpc('sign_rental_agreement', { p_agreement_id: agreementId, p_signer_name: signerName });
  return { error: error?.message ?? null };
}

export function useRentalAgreements(ownerId: string | undefined) {
  const [agreements, setAgreements] = useState<RentalAgreementRow[]>([]);
  const [loading, setLoading] = useState(true);
  // Distinguishes "you have no agreements" from "the fetch failed" -- on a
  // legal-documents page, showing an empty list on failure invites the
  // owner to generate a duplicate agreement.
  const [fetchError, setFetchError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase || !ownerId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setFetchError(null);
    const { data, error } = await supabase
      .from('rental_agreements')
      .select('*')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Supabase rental_agreements fetch error:', error.message);
      setFetchError(error.message);
      setAgreements([]);
    } else {
      setAgreements((data ?? []).map(mapRow));
    }
    setLoading(false);
  }, [ownerId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = useCallback(
    async (payload: {
      ownerId: string;
      tenantId?: string | null;
      listingId?: string | null;
      stampDutyRequested?: boolean;
    } & Omit<RentalAgreementData, 'createdAt'>): Promise<{ error: string | null; id?: string }> => {
      const supabase = getSupabase();
      if (!supabase) return { error: 'Supabase not connected' };

      const baseRow = {
        owner_id: payload.ownerId,
        tenant_id: payload.tenantId ?? null,
        listing_id: payload.listingId ?? null,
        tenant_name: payload.tenantName,
        tenant_address: payload.tenantAddress,
        tenant_phone: payload.tenantPhone,
        tenant_email: payload.tenantEmail,
        tenant_pan: payload.tenantPan,
        tenant_aadhaar_masked: payload.tenantAadhaarMasked,
        landlord_name: payload.landlordName,
        landlord_address: payload.landlordAddress,
        landlord_phone: payload.landlordPhone,
        landlord_email: payload.landlordEmail,
        landlord_pan: payload.landlordPan,
        property_address: payload.propertyAddress,
        property_description: payload.propertyDescription,
        flat_number: payload.flatNumber,
        carpet_area: payload.carpetArea || null,
        lease_start_date: payload.leaseStartDate || null,
        lease_end_date: payload.leaseEndDate || null,
        monthly_rent: payload.monthlyRent,
        security_deposit: payload.securityDeposit,
        rent_due_day: payload.rentDueDay,
        payment_mode: payload.paymentMode,
        maintenance_amount: payload.maintenanceAmount,
        notice_period_days: payload.noticePeriodDays,
        lock_in_months: payload.lockInMonths,
        renewal_clause: payload.renewalClause,
        witness1_name: payload.witness1Name,
        witness1_address: payload.witness1Address,
        witness2_name: payload.witness2Name,
        witness2_address: payload.witness2Address,
        clauses: payload.clauses,
        // Default true keeps the admin stamp-duty route unless the owner
        // explicitly opted to skip it at creation.
        stamp_duty_requested: payload.stampDutyRequested ?? true,
      };

      // Retry on the rare unique-number collision (23505) with a fresh
      // number instead of surfacing a raw duplicate-key error.
      let agreementNumber = payload.agreementNumber;
      let result = await supabase.from('rental_agreements').insert({ ...baseRow, agreement_number: agreementNumber }).select('id').single();
      for (let attempt = 0; attempt < 4 && result.error?.code === '23505'; attempt++) {
        agreementNumber = generateAgreementNumber();
        result = await supabase.from('rental_agreements').insert({ ...baseRow, agreement_number: agreementNumber }).select('id').single();
      }

      if (result.error) return { error: result.error.message };
      await refresh();
      return { error: null, id: result.data?.id };
    },
    [refresh]
  );

  // Sharing now goes through the workflow RPC, which only allows it once
  // an admin has returned the stamped copy (agreement_status='stamped').
  const markShared = useCallback(
    async (agreementId: string): Promise<{ error: string | null }> => {
      const supabase = getSupabase();
      if (!supabase) return { error: 'Not available right now.' };
      const { error } = await supabase.rpc('share_rental_agreement', { p_agreement_id: agreementId });
      if (error) return { error: error.message };
      await refresh();
      return { error: null };
    },
    [refresh]
  );

  // Landlord signature (the owner is the landlord).
  const sign = useCallback(
    async (agreementId: string, signerName: string): Promise<{ error: string | null }> => {
      const { error } = await signRentalAgreement(agreementId, signerName);
      if (!error) await refresh();
      return { error };
    },
    [refresh]
  );

  return { agreements, loading, fetchError, create, markShared, sign, refresh };
}

export function generateAgreementNumber(): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `RA-${year}-${rand}`;
}

// Read-only: agreements naming this tenant, generated by their landlord.
export function useTenantRentalAgreements(tenantId: string | undefined) {
  const [agreements, setAgreements] = useState<RentalAgreementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [cachedAt, setCachedAt] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase || !tenantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setFetchError(null);
    const { data, error } = await supabase
      .from('rental_agreements')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Supabase rental_agreements (tenant) fetch error:', error.message);
      // A signed agreement is a document the tenant is entitled to read
      // whatever the network is doing -- at a viewing, in a basement flat,
      // in front of a landlord. Fall back to the last copy seen.
      const cached = await readCache<RentalAgreementRow[]>('tenantAgreements', tenantId);
      if (cached.data) {
        setAgreements(cached.data);
        setCachedAt(cached.cachedAt);
        setFetchError(null);
      } else {
        setFetchError(error.message);
        setAgreements([]);
      }
    } else {
      const fresh = (data ?? []).map(mapRow);
      setAgreements(fresh);
      setCachedAt(null);
      await writeCache('tenantAgreements', tenantId, fresh);
    }
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const sign = useCallback(
    async (agreementId: string, signerName: string): Promise<{ error: string | null }> => {
      const { error } = await signRentalAgreement(agreementId, signerName);
      if (!error) await refresh();
      return { error };
    },
    [refresh]
  );

  return { agreements, loading, fetchError, refresh, cachedAt, sign };
}

// Admin: agreements sitting in the stamp-duty queue, and the action to
// upload the stamped PDF and return them to the owner.
export function useAdminPendingAgreements() {
  const [agreements, setAgreements] = useState<RentalAgreementRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('rental_agreements')
      .select('*')
      .eq('agreement_status', 'pending_admin')
      .order('created_at', { ascending: true });
    if (error) {
      console.warn('Supabase pending agreements fetch error:', error.message);
      setAgreements([]);
    } else {
      setAgreements((data ?? []).map(mapRow));
    }
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const stamp = useCallback(
    async (agreementId: string, file: File): Promise<{ error: string | null }> => {
      const supabase = getSupabase();
      if (!supabase) return { error: 'Not available right now.' };
      const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf';
      const path = `${agreementId}/stamped-${Date.now()}.${ext}`;
      const up = await supabase.storage.from('stamped-agreements').upload(path, file);
      if (up.error) return { error: `Upload failed: ${up.error.message}` };
      const { error } = await supabase.rpc('admin_stamp_rental_agreement', { p_agreement_id: agreementId, p_document_path: path });
      if (error) return { error: error.message };
      await refresh();
      return { error: null };
    },
    [refresh]
  );

  return { agreements, loading, refresh, stamp };
}

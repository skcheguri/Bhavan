import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import type { RentalAgreementData } from '@/lib/documents/rentalAgreementDocument';

export interface RentalAgreementRow extends RentalAgreementData {
  id: string;
  ownerId: string;
  tenantId: string | null;
  listingId: string | null;
  signedByLandlord: boolean;
  signedByTenant: boolean;
  sharedWithTenant: boolean;
  sharedAt: string | null;
}

function mapRow(r: Record<string, unknown>): RentalAgreementRow {
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
  };
}

export function useRentalAgreements(ownerId: string | undefined) {
  const [agreements, setAgreements] = useState<RentalAgreementRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase || !ownerId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('rental_agreements')
      .select('*')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Supabase rental_agreements fetch error:', error.message);
      setAgreements([]);
    } else {
      setAgreements(((data ?? []) as Record<string, unknown>[]).map(mapRow));
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
    } & Omit<RentalAgreementData, 'createdAt'>): Promise<{ error: string | null; id?: string }> => {
      const supabase = getSupabase();
      if (!supabase) return { error: 'Supabase not connected' };

      const { data, error } = await supabase
        .from('rental_agreements')
        .insert({
          owner_id: payload.ownerId,
          tenant_id: payload.tenantId ?? null,
          listing_id: payload.listingId ?? null,
          agreement_number: payload.agreementNumber,
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
        })
        .select('id')
        .single();

      if (error) return { error: error.message };
      await refresh();
      return { error: null, id: data?.id };
    },
    [refresh]
  );

  const markShared = useCallback(
    async (agreementId: string) => {
      const supabase = getSupabase();
      if (!supabase) return;
      await supabase
        .from('rental_agreements')
        .update({ shared_with_tenant: true, shared_at: new Date().toISOString() })
        .eq('id', agreementId);
      await supabase.rpc('notify_agreement_shared', { p_agreement_id: agreementId });
      setAgreements((prev) => prev.map((a) => (a.id === agreementId ? { ...a, sharedWithTenant: true, sharedAt: new Date().toISOString() } : a)));
    },
    []
  );

  return { agreements, loading, create, markShared, refresh };
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

  const refresh = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase || !tenantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('rental_agreements')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Supabase rental_agreements (tenant) fetch error:', error.message);
      setAgreements([]);
    } else {
      setAgreements(((data ?? []) as Record<string, unknown>[]).map(mapRow));
    }
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { agreements, loading, refresh };
}

import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import type { RentReceiptData } from '@/lib/documents/rentReceiptDocument';
import type { Tables } from '@/types/database.types';

export interface RentReceiptRow extends RentReceiptData {
  id: string;
  ownerId: string;
  tenantId: string | null;
  listingId: string | null;
  sentToTenant: boolean;
  sentAt: string | null;
}

// Typed against the generated schema row (not Record<string, unknown>)
// on purpose: these fields end up in an HRA/tax receipt, so a renamed or
// dropped column must be a compile error here -- never a silently blank
// PAN or amount on a generated receipt.
function mapRow(r: Tables<'rent_receipts'>): RentReceiptRow {
  return {
    id: String(r.id),
    ownerId: String(r.owner_id ?? ''),
    tenantId: (r.tenant_id as string | null) ?? null,
    listingId: (r.listing_id as string | null) ?? null,
    receiptNumber: String(r.receipt_number ?? ''),
    landlordName: String(r.landlord_name ?? ''),
    landlordPan: String(r.landlord_pan ?? ''),
    landlordAddress: String(r.landlord_address ?? ''),
    tenantName: String(r.tenant_name ?? ''),
    tenantPan: String(r.tenant_pan ?? ''),
    propertyAddress: String(r.property_address ?? ''),
    periodFrom: String(r.period_from ?? ''),
    periodTo: String(r.period_to ?? ''),
    rentAmount: Number(r.rent_amount ?? 0),
    paymentMode: String(r.payment_mode ?? ''),
    transactionRef: String(r.transaction_ref ?? ''),
    paymentDate: String(r.payment_date ?? ''),
    includesMaintenance: Boolean(r.includes_maintenance),
    maintenanceAmount: Number(r.maintenance_amount ?? 0),
    notes: String(r.notes ?? ''),
    createdAt: String(r.created_at ?? ''),
    landlordSignedAt: (r.landlord_signed_at as string | null) ?? null,
    sentToTenant: Boolean(r.sent_to_tenant),
    sentAt: (r.sent_at as string | null) ?? null,
  };
}

export function useRentReceipts(ownerId: string | undefined) {
  const [receipts, setReceipts] = useState<RentReceiptRow[]>([]);
  const [loading, setLoading] = useState(true);
  // Distinguishes "no receipts yet" from "the fetch failed" -- a tenant
  // relying on receipts for an HRA claim must not see a silent empty list
  // when the query errored.
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
      .from('rent_receipts')
      .select('*')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Supabase rent_receipts fetch error:', error.message);
      setFetchError(error.message);
      setReceipts([]);
    } else {
      setReceipts((data ?? []).map(mapRow));
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
    } & Omit<RentReceiptData, 'createdAt'>): Promise<{ error: string | null; id?: string }> => {
      const supabase = getSupabase();
      if (!supabase) return { error: 'Supabase not connected' };

      const { data, error } = await supabase
        .from('rent_receipts')
        .insert({
          owner_id: payload.ownerId,
          tenant_id: payload.tenantId ?? null,
          listing_id: payload.listingId ?? null,
          receipt_number: payload.receiptNumber,
          landlord_name: payload.landlordName,
          landlord_pan: payload.landlordPan,
          landlord_address: payload.landlordAddress,
          tenant_name: payload.tenantName,
          tenant_pan: payload.tenantPan,
          property_address: payload.propertyAddress,
          period_from: payload.periodFrom || null,
          period_to: payload.periodTo || null,
          rent_amount: Math.round(payload.rentAmount),
          payment_mode: payload.paymentMode,
          transaction_ref: payload.transactionRef,
          payment_date: payload.paymentDate || null,
          includes_maintenance: payload.includesMaintenance,
          maintenance_amount: Math.round(payload.maintenanceAmount) || 0,
          notes: payload.notes,
          // Issuing a receipt is the landlord signing it.
          signed_by_landlord: true,
          landlord_signed_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (error) return { error: error.message };
      await refresh();
      return { error: null, id: data?.id };
    },
    [refresh]
  );

  const markShared = useCallback(async (receiptId: string) => {
    const supabase = getSupabase();
    if (!supabase) return;
    await supabase
      .from('rent_receipts')
      .update({ sent_to_tenant: true, sent_at: new Date().toISOString() })
      .eq('id', receiptId);
    await supabase.rpc('notify_receipt_shared', { p_receipt_id: receiptId });
    setReceipts((prev) => prev.map((r) => (r.id === receiptId ? { ...r, sentToTenant: true, sentAt: new Date().toISOString() } : r)));
  }, []);

  return { receipts, loading, fetchError, create, markShared, refresh };
}

export function generateReceiptNumber(): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `RR-${year}-${rand}`;
}

// Read-only: receipts naming this tenant, generated by their landlord.
export function useTenantRentReceipts(tenantId: string | undefined) {
  const [receipts, setReceipts] = useState<RentReceiptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase || !tenantId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setFetchError(null);
    const { data, error } = await supabase
      .from('rent_receipts')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Supabase rent_receipts (tenant) fetch error:', error.message);
      setFetchError(error.message);
      setReceipts([]);
    } else {
      setReceipts((data ?? []).map(mapRow));
    }
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { receipts, loading, fetchError, refresh };
}

import { useState, useEffect, useCallback } from 'react';
import { getSupabase } from '@/lib/supabase';

export interface RentPayment {
  id: string;
  tenant_id: string;
  property_id: string;
  owner_id: string;
  amount: number;
  month: string;
  payment_mode: 'upi_autopay' | 'upi_qr' | 'bank_transfer' | 'offline';
  status: 'pending' | 'paid' | 'failed' | 'reconciled';
  razorpay_payment_id: string | null;
  failure_reason: string | null;
  receipt_url: string | null;
  reconciled_at: string | null;
  reconciliation_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface UPIMandate {
  id: string;
  tenant_id: string;
  owner_id: string;
  property_id: string;
  upi_id: string;
  bank_account: string;
  mandate_amount: number;
  frequency: string;
  start_date: string;
  end_date: string;
  status: 'active' | 'paused' | 'cancelled';
  razorpay_token: string;
  created_at: string;
  updated_at: string;
}

export interface PaymentFilters {
  month?: string;
  status?: RentPayment['status'];
  propertyId?: string;
  tenantId?: string;
}

export interface CreatePaymentInput {
  tenant_id: string;
  property_id: string;
  owner_id: string;
  amount: number;
  month: string;
  payment_mode: RentPayment['payment_mode'];
  transaction_ref: string;
}

export interface CreateMandateInput {
  tenant_id: string;
  owner_id: string;
  property_id: string;
  upi_id: string;
  bank_account: string;
  mandate_amount: number;
  start_date: string;
  end_date: string;
}

export interface RentPaymentState {
  payments: RentPayment[];
  mandates: UPIMandate[];
  loading: boolean;
  error: string | null;
}

export interface UseRentPaymentReturn extends RentPaymentState {
  filteredPayments: (filters: PaymentFilters) => RentPayment[];
  tenantPayments: (tenantId: string) => RentPayment[];
  propertyPayments: (propertyId: string) => RentPayment[];
  ownerPayments: (ownerId: string) => RentPayment[];
  pendingPayments: RentPayment[];
  failedPayments: RentPayment[];
  overduePayments: RentPayment[];
  reconciledPayments: RentPayment[];
  totalCollected: (ownerId: string) => number;
  totalOutstanding: (ownerId: string) => number;
  onTimeRate: (tenantId: string) => number;
  hasFailedPayment: (tenantId: string) => boolean;
  getMandateForTenant: (tenantId: string) => UPIMandate | null;
  createPayment: (input: CreatePaymentInput) => Promise<{ data: RentPayment | null; error: string | null }>;
  retryPayment: (paymentId: string) => Promise<{ data: RentPayment | null; error: string | null }>;
  reconcilePayment: (paymentId: string, note: string) => Promise<{ error: string | null }>;
  createMandate: (input: CreateMandateInput) => Promise<{ data: UPIMandate | null; error: string | null }>;
  pauseMandate: (mandateId: string) => Promise<{ error: string | null }>;
  cancelMandate: (mandateId: string) => Promise<{ error: string | null }>;
  refresh: () => Promise<void>;
}

function formatMonthKey(date: Date): string {
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${months[date.getMonth()]} ${date.getFullYear()}`;
}

function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

export function useRentPayment(): UseRentPaymentReturn {
  const [payments, setPayments] = useState<RentPayment[]>([]);
  const [mandates, setMandates] = useState<UPIMandate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = getSupabase();

  const fetchFromSupabase = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const { data: pData, error: pErr } = await supabase
        .from('rent_payments')
        .select('*')
        .order('created_at', { ascending: false });
      if (pErr) throw pErr;

      const { data: mData, error: mErr } = await supabase
        .from('upi_mandates')
        .select('*')
        .order('created_at', { ascending: false });
      if (mErr) throw mErr;

      setPayments((pData as RentPayment[]) ?? []);
      setMandates((mData as UPIMandate[]) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch payments');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  const refresh = useCallback(async () => {
    if (supabase) {
      await fetchFromSupabase();
    } else {
      setPayments([]);
      setMandates([]);
    }
  }, [supabase, fetchFromSupabase]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filteredPayments = useCallback(
    (filters: PaymentFilters) => {
      return payments.filter((p) => {
        if (filters.month && p.month !== filters.month) return false;
        if (filters.status && p.status !== filters.status) return false;
        if (filters.propertyId && p.property_id !== filters.propertyId) return false;
        if (filters.tenantId && p.tenant_id !== filters.tenantId) return false;
        return true;
      });
    },
    [payments]
  );

  const tenantPayments = useCallback(
    (tenantId: string) => payments.filter((p) => p.tenant_id === tenantId).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [payments]
  );

  const propertyPayments = useCallback(
    (propertyId: string) => payments.filter((p) => p.property_id === propertyId),
    [payments]
  );

  const ownerPayments = useCallback(
    (ownerId: string) => payments.filter((p) => p.owner_id === ownerId),
    [payments]
  );

  const pendingPayments = payments.filter((p) => p.status === 'pending');
  const failedPayments = payments.filter((p) => p.status === 'failed');
  const overduePayments = payments.filter((p) => {
    if (p.status !== 'pending') return false;
    const due = new Date(p.created_at);
    const now = new Date();
    return now.getTime() - due.getTime() > 3 * 24 * 60 * 60 * 1000;
  });
  const reconciledPayments = payments.filter((p) => p.status === 'reconciled');

  const totalCollected = useCallback(
    (ownerId: string) =>
      payments
        .filter((p) => p.owner_id === ownerId && (p.status === 'paid' || p.status === 'reconciled'))
        .reduce((sum, p) => sum + p.amount, 0),
    [payments]
  );

  const totalOutstanding = useCallback(
    (ownerId: string) =>
      payments
        .filter((p) => p.owner_id === ownerId && (p.status === 'pending' || p.status === 'failed'))
        .reduce((sum, p) => sum + p.amount, 0),
    [payments]
  );

  const onTimeRate = useCallback((tenantId: string) => {
    const tenantPays = payments.filter((p) => p.tenant_id === tenantId && (p.status === 'paid' || p.status === 'reconciled'));
    if (tenantPays.length === 0) return 0;
    const onTime = tenantPays.filter((p) => {
      const paidDate = new Date(p.created_at);
      const dueDate = new Date(paidDate.getFullYear(), paidDate.getMonth(), 5);
      return paidDate.getTime() <= dueDate.getTime();
    }).length;
    return Math.round((onTime / tenantPays.length) * 100);
  }, [payments]);

  const hasFailedPayment = useCallback(
    (tenantId: string) => payments.some((p) => p.tenant_id === tenantId && p.status === 'failed'),
    [payments]
  );

  const getMandateForTenant = useCallback(
    (tenantId: string) => mandates.find((m) => m.tenant_id === tenantId && m.status === 'active') ?? null,
    [mandates]
  );

  const createPayment = useCallback(
    async (input: CreatePaymentInput): Promise<{ data: RentPayment | null; error: string | null }> => {
      const newPayment: RentPayment = {
        id: `pay-${Date.now()}`,
        ...input,
        status: 'pending',
        razorpay_payment_id: null,
        failure_reason: null,
        receipt_url: null,
        reconciled_at: null,
        reconciliation_note: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (supabase && isValidUUID(input.tenant_id) && isValidUUID(input.property_id) && isValidUUID(input.owner_id)) {
        const { data, error: supaErr } = await supabase.from('rent_payments').insert(newPayment).select().single();
        if (supaErr) return { data: null, error: supaErr.message };
        await refresh();
        return { data: data as RentPayment, error: null };
      }

      setPayments((prev) => [newPayment, ...prev]);
      return { data: newPayment, error: null };
    },
    [supabase, refresh]
  );

  const retryPayment = useCallback(
    async (paymentId: string): Promise<{ data: RentPayment | null; error: string | null }> => {
      const idx = payments.findIndex((p) => p.id === paymentId);
      if (idx === -1) return { data: null, error: 'Payment not found' };

      const updated: RentPayment = {
        ...payments[idx],
        status: 'pending',
        failure_reason: null,
        updated_at: new Date().toISOString(),
      };

      if (supabase && isValidUUID(paymentId)) {
        const { data, error: supaErr } = await supabase
          .from('rent_payments')
          .update({ status: 'pending', failure_reason: null, updated_at: updated.updated_at })
          .eq('id', paymentId)
          .select()
          .single();
        if (supaErr) return { data: null, error: supaErr.message };
        await refresh();
        return { data: data as RentPayment, error: null };
      }

      setPayments((prev) => prev.map((p, i) => (i === idx ? updated : p)));
      return { data: updated, error: null };
    },
    [payments, supabase, refresh]
  );

  const reconcilePayment = useCallback(
    async (paymentId: string, note: string): Promise<{ error: string | null }> => {
      const idx = payments.findIndex((p) => p.id === paymentId);
      if (idx === -1) return { error: 'Payment not found' };

      if (supabase && isValidUUID(paymentId)) {
        const { error: supaErr } = await supabase
          .from('rent_payments')
          .update({
            status: 'reconciled',
            reconciled_at: new Date().toISOString(),
            reconciliation_note: note,
            updated_at: new Date().toISOString(),
          })
          .eq('id', paymentId);
        if (supaErr) return { error: supaErr.message };
        await refresh();
        return { error: null };
      }

      setPayments((prev) =>
        prev.map((p, i) =>
          i === idx
            ? {
                ...p,
                status: 'reconciled',
                reconciled_at: new Date().toISOString(),
                reconciliation_note: note,
                updated_at: new Date().toISOString(),
              }
            : p
        )
      );
      return { error: null };
    },
    [payments, supabase, refresh]
  );

  const createMandate = useCallback(
    async (input: CreateMandateInput): Promise<{ data: UPIMandate | null; error: string | null }> => {
      const newMandate: UPIMandate = {
        id: `mand-${Date.now()}`,
        ...input,
        frequency: 'monthly',
        status: 'active',
        razorpay_token: `token_${Date.now()}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (supabase && isValidUUID(input.tenant_id) && isValidUUID(input.owner_id) && isValidUUID(input.property_id)) {
        const { data, error: supaErr } = await supabase.from('upi_mandates').insert(newMandate).select().single();
        if (supaErr) return { data: null, error: supaErr.message };
        await refresh();
        return { data: data as UPIMandate, error: null };
      }

      setMandates((prev) => [...prev, newMandate]);
      return { data: newMandate, error: null };
    },
    [supabase, refresh]
  );

  const pauseMandate = useCallback(
    async (mandateId: string): Promise<{ error: string | null }> => {
      const idx = mandates.findIndex((m) => m.id === mandateId);
      if (idx === -1) return { error: 'Mandate not found' };

      if (supabase && isValidUUID(mandateId)) {
        const { error: supaErr } = await supabase
          .from('upi_mandates')
          .update({ status: 'paused', updated_at: new Date().toISOString() })
          .eq('id', mandateId);
        if (supaErr) return { error: supaErr.message };
        await refresh();
        return { error: null };
      }

      setMandates((prev) => prev.map((m, i) => (i === idx ? { ...m, status: 'paused', updated_at: new Date().toISOString() } : m)));
      return { error: null };
    },
    [mandates, supabase, refresh]
  );

  const cancelMandate = useCallback(
    async (mandateId: string): Promise<{ error: string | null }> => {
      const idx = mandates.findIndex((m) => m.id === mandateId);
      if (idx === -1) return { error: 'Mandate not found' };

      if (supabase && isValidUUID(mandateId)) {
        const { error: supaErr } = await supabase
          .from('upi_mandates')
          .update({ status: 'cancelled', updated_at: new Date().toISOString() })
          .eq('id', mandateId);
        if (supaErr) return { error: supaErr.message };
        await refresh();
        return { error: null };
      }

      setMandates((prev) => prev.map((m, i) => (i === idx ? { ...m, status: 'cancelled', updated_at: new Date().toISOString() } : m)));
      return { error: null };
    },
    [mandates, supabase, refresh]
  );

  return {
    payments,
    mandates,
    loading,
    error,
    filteredPayments,
    tenantPayments,
    propertyPayments,
    ownerPayments,
    pendingPayments,
    failedPayments,
    overduePayments,
    reconciledPayments,
    totalCollected,
    totalOutstanding,
    onTimeRate,
    hasFailedPayment,
    getMandateForTenant,
    createPayment,
    retryPayment,
    reconcilePayment,
    createMandate,
    pauseMandate,
    cancelMandate,
    refresh,
  };
}
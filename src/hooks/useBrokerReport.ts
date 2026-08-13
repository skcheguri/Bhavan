import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';

export interface SoftBlockState {
  tenant_id: string;
  active: boolean;
  triggered_at: string | null;
  aadhaar_re_verified: boolean;
  additional_details_provided: boolean;
  details: {
    employerName?: string;
    companyAddress?: string;
    referenceContact?: string;
    purposeOfRenting?: string;
  } | null;
}

export interface BrokerReport {
  id: string;
  tenant_id: string;
  owner_id: string;
  listing_id: string | null;
  reason: ReportReason;
  reason_text: string;
  status: 'pending' | 'reviewed' | 'resolved' | 'dismissed';
  admin_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminBrokerReport extends BrokerReport {
  tenant_name: string;
  owner_name: string;
  listing_title: string | null;
}

const HOUR_MS = 60 * 60 * 1000;
const WINDOW_MS = 48 * HOUR_MS;

export type ReportReason =
  | 'broker_agent'
  | 'asked_commission'
  | 'shared_competing_listing'
  | 'refused_identity'
  | 'other';

function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

export interface BrokerReportStatus {
  reports: BrokerReport[];
  reportCount: number;
  recentReportCount: number;
  isSoftBlocked: boolean;
  softBlockState: SoftBlockState;
  canBeReportedBy: (reporterId: string) => boolean;
  loading: boolean;
}

/* ---- Supabase helpers ---- */

async function fetchReportsSupabase(tenantId: string): Promise<BrokerReport[]> {
  const supabase = getSupabase();
  if (!supabase || !isValidUUID(tenantId)) return [];
  const { data, error } = await supabase
    .from('broker_reports')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });
  if (error) {
    console.warn('Supabase broker_reports fetch error:', error.message);
    return [];
  }
  return (data as BrokerReport[]) ?? [];
}

async function insertReportSupabase(
  tenantId: string,
  ownerId: string,
  reason: ReportReason,
  reasonText: string,
  listingId: string
): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase || !isValidUUID(tenantId) || !isValidUUID(ownerId)) return false;
  const { error } = await supabase.from('broker_reports').insert({
    tenant_id: tenantId,
    owner_id: ownerId,
    listing_id: isValidUUID(listingId) ? listingId : null,
    reason,
    reason_text: reasonText,
  });
  if (error) {
    console.warn('Supabase broker_reports insert error:', error.message);
    return false;
  }
  return true;
}

async function fetchSoftBlockSupabase(tenantId: string): Promise<SoftBlockState | null> {
  const supabase = getSupabase();
  if (!supabase || !isValidUUID(tenantId)) return null;
  const { data, error } = await supabase
    .from('soft_block_states')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) {
    console.warn('Supabase soft_block_states fetch error:', error.message);
    return null;
  }
  if (!data) return null;
  // details is a json column; this is its one narrowing point.
  const details = data.details as {
    employer_name?: string;
    company_address?: string;
    reference_contact?: string;
    purpose_of_renting?: string;
  } | null;
  return {
    tenant_id: data.tenant_id,
    active: data.active,
    triggered_at: data.triggered_at,
    aadhaar_re_verified: data.aadhaar_re_verified,
    additional_details_provided: data.additional_details_provided,
    details: details
      ? {
          employerName: details.employer_name,
          companyAddress: details.company_address,
          referenceContact: details.reference_contact,
          purposeOfRenting: details.purpose_of_renting,
        }
      : null,
  };
}

async function upsertSoftBlockSupabase(state: SoftBlockState): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase || !isValidUUID(state.tenant_id)) return false;
  const payload = {
    tenant_id: state.tenant_id,
    active: state.active,
    triggered_at: state.triggered_at,
    aadhaar_re_verified: state.aadhaar_re_verified,
    additional_details_provided: state.additional_details_provided,
    details: state.details
      ? {
          employer_name: state.details.employerName,
          company_address: state.details.companyAddress,
          reference_contact: state.details.referenceContact,
          purpose_of_renting: state.details.purposeOfRenting,
        }
      : null,
  };
  const { error } = await supabase.from('soft_block_states').upsert(payload, {
    onConflict: 'tenant_id',
  });
  if (error) {
    console.warn('Supabase soft_block_states upsert error:', error.message);
    return false;
  }
  return true;
}

/* ---- Status builder ---- */

// Read-only: the active/inactive decision is computed and persisted by the
// database (migration 144, trg_broker_report_recompute_block +
// soft_block_recompute_active). The client only reflects that server state --
// it no longer counts an RLS-truncated report set or writes from a read.
function buildBrokerReportStatus(
  tenantId: string,
  reports: BrokerReport[],
  softBlock: SoftBlockState | null
): BrokerReportStatus {
  const now = Date.now();
  const recentReportCount = reports.filter(
    (r) => now - new Date(r.created_at).getTime() < WINDOW_MS
  ).length;

  const state: SoftBlockState = softBlock ?? {
    tenant_id: tenantId,
    active: false,
    triggered_at: null,
    aadhaar_re_verified: false,
    additional_details_provided: false,
    details: null,
  };

  const canBeReportedBy = (reporterId: string) => {
    return !reports.some((r) => r.owner_id === reporterId);
  };

  return {
    reports,
    reportCount: reports.length,
    recentReportCount,
    isSoftBlocked: state.active,
    softBlockState: state,
    canBeReportedBy,
    loading: false,
  };
}

/* ---- Hook (single tenant) ---- */

export function useBrokerReport(tenantId: string | undefined) {
  const [status, setStatus] = useState<BrokerReportStatus>({
    reports: [],
    reportCount: 0,
    recentReportCount: 0,
    isSoftBlocked: false,
    softBlockState: {
      tenant_id: '',
      active: false,
      triggered_at: null,
      aadhaar_re_verified: false,
      additional_details_provided: false,
      details: null,
    },
    canBeReportedBy: () => false,
    loading: true,
  });

  const id = tenantId ?? '';

  const load = useCallback(async () => {
    if (!id) {
      setStatus((prev) => ({ ...prev, loading: false }));
      return;
    }
    setStatus((prev) => ({ ...prev, loading: true }));

    const [reports, softBlock] = await Promise.all([
      fetchReportsSupabase(id),
      fetchSoftBlockSupabase(id),
    ]);

    const next = buildBrokerReportStatus(id, reports, softBlock);
    setStatus(next);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const report = useCallback(
    async (
      reporterId: string,
      _reporterName: string,
      reason: ReportReason,
      reasonText: string,
      listingId: string
    ): Promise<boolean> => {
      if (!id) return false;
      const alreadyReported = status.reports.some((r) => r.owner_id === reporterId);
      if (alreadyReported) return false;

      const ok = await insertReportSupabase(id, reporterId, reason, reasonText, listingId);
      if (!ok) return false;

      await load();
      return true;
    },
    [id, status.reports, load]
  );

  const resolveAadhaar = useCallback(async () => {
    if (!id) return;
    const next: SoftBlockState = {
      ...status.softBlockState,
      tenant_id: id,
      aadhaar_re_verified: true,
    };
    await upsertSoftBlockSupabase(next);
    await load();
  }, [id, status.softBlockState, load]);

  const submitDetails = useCallback(
    async (details: {
      employerName: string;
      companyAddress: string;
      referenceContact: string;
      purposeOfRenting: string;
    }) => {
      if (!id) return;
      const next: SoftBlockState = {
        ...status.softBlockState,
        tenant_id: id,
        additional_details_provided: true,
        details: { ...details },
      };
      await upsertSoftBlockSupabase(next);
      await load();
    },
    [id, status.softBlockState, load]
  );

  return { ...status, report, resolveAadhaar, submitDetails, refresh: load };
}

/* ---- Admin-wide (all tenants) ---- */

export function useAdminBrokerReports() {
  const [reports, setReports] = useState<AdminBrokerReport[]>([]);
  const [activeSoftBlockCount, setActiveSoftBlockCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);

    const [{ data: reportRows, error: reportsError }, { count: blockCount }] = await Promise.all([
      supabase
        .from('broker_reports')
        .select(
          'id, tenant_id, owner_id, listing_id, reason, reason_text, status, admin_note, created_at, updated_at, tenant:users_public!broker_reports_tenant_id_fkey(name), owner:users_public!broker_reports_owner_id_fkey(name), listing:listings(title)'
        )
        .order('created_at', { ascending: false }),
      supabase.from('soft_block_states').select('tenant_id', { count: 'exact', head: true }).eq('active', true),
    ]);

    if (reportsError) {
      console.warn('Supabase admin broker_reports fetch error:', reportsError.message);
      setReports([]);
    } else {
      setReports(
        ((reportRows ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
          id: String(r.id),
          tenant_id: String(r.tenant_id),
          owner_id: String(r.owner_id),
          listing_id: r.listing_id ? String(r.listing_id) : null,
          reason: r.reason as ReportReason,
          reason_text: String(r.reason_text ?? ''),
          status: (r.status as AdminBrokerReport['status']) ?? 'pending',
          admin_note: r.admin_note ? String(r.admin_note) : null,
          created_at: String(r.created_at),
          updated_at: String(r.updated_at ?? r.created_at),
          tenant_name: (r.tenant as { name?: string } | null)?.name ?? 'Unknown tenant',
          owner_name: (r.owner as { name?: string } | null)?.name ?? 'Unknown owner',
          listing_title: (r.listing as { title?: string } | null)?.title ?? null,
        }))
      );
    }
    setActiveSoftBlockCount(blockCount ?? 0);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const updateReportStatus = useCallback(
    async (id: string, status: AdminBrokerReport['status'], adminNote?: string) => {
      const supabase = getSupabase();
      if (!supabase) return false;
      const payload: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
      if (adminNote !== undefined) payload.admin_note = adminNote;
      const { error } = await supabase.from('broker_reports').update(payload).eq('id', id);
      if (error) {
        console.warn('Supabase broker_reports update error:', error.message);
        return false;
      }
      setReports((prev) => prev.map((r) => (r.id === id ? { ...r, status, admin_note: adminNote ?? r.admin_note } : r)));
      return true;
    },
    []
  );

  return { reports, activeSoftBlockCount, loading, updateReportStatus, refresh: load };
}

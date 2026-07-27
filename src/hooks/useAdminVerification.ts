import { useState, useEffect, useCallback } from 'react';
import { getSupabase } from '@/lib/supabase';

// Read-only audit log of real Aadhaar e-KYC attempts (see
// supabase/functions/aadhaar-verify/index.ts) -- the third-party KYC
// provider already makes the pass/fail decision in real time via OTP,
// so there is no pending human review step; this exists purely so an
// admin can see who attempted verification, when, and why it failed.
export type AadhaarAttemptStatus = 'otp_sent' | 'verified' | 'failed' | 'expired';

export interface AadhaarAuditEntry {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  aadhaarLast4: string | null;
  status: AadhaarAttemptStatus;
  failureReason: string | null;
  requestedAt: string;
  verifiedAt: string | null;
}

interface VerifiedUserSummary {
  id: string;
  name: string;
  avatar_url: string | null;
  aadhaar_last4: string | null;
}

function mapRow(r: Record<string, unknown>): AadhaarAuditEntry {
  return {
    id: String(r.id),
    userId: String(r.user_id ?? ''),
    userName: (r.user as { name?: string } | null)?.name ?? 'Unknown user',
    userRole: (r.user as { role?: string } | null)?.role ?? '',
    aadhaarLast4: (r.aadhaar_last4 as string | null) ?? null,
    status: (r.status as AadhaarAttemptStatus) ?? 'otp_sent',
    failureReason: (r.failure_reason as string | null) ?? null,
    requestedAt: String(r.requested_at ?? ''),
    verifiedAt: (r.verified_at as string | null) ?? null,
  };
}

export function useAdminVerification() {
  const [entries, setEntries] = useState<AadhaarAuditEntry[]>([]);
  const [verifiedUsers, setVerifiedUsers] = useState<VerifiedUserSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);

    const [{ data: attemptRows, error: attemptsError }, { data: verifiedRows, error: verifiedError }] = await Promise.all([
      supabase
        .from('aadhaar_verification_attempts')
        .select('id, user_id, aadhaar_last4, status, failure_reason, requested_at, verified_at, user:users_public!aadhaar_verification_attempts_user_id_fkey(name, role)')
        .order('requested_at', { ascending: false })
        .limit(100),
      supabase
        .from('users_public')
        .select('id, name, avatar_url, verified_aadhaar')
        .eq('verified_aadhaar', true)
        .order('name'),
    ]);

    if (attemptsError) {
      console.warn('Supabase aadhaar_verification_attempts fetch error:', attemptsError.message);
      setEntries([]);
    } else {
      setEntries(((attemptRows ?? []) as unknown as Record<string, unknown>[]).map(mapRow));
    }

    if (verifiedError) {
      console.warn('Supabase verified users fetch error:', verifiedError.message);
      setVerifiedUsers([]);
    } else {
      setVerifiedUsers(
        ((verifiedRows ?? []) as { id: string; name: string; avatar_url: string | null }[]).map((u) => ({
          id: u.id,
          name: u.name,
          avatar_url: u.avatar_url,
          aadhaar_last4: null,
        }))
      );
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { entries, verifiedUsers, loading, refresh: load };
}

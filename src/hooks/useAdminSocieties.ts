import { useState, useEffect, useCallback } from 'react';
import { getSupabase } from '@/lib/supabase';

/**
 * Bhavan's review queue for societies.
 *
 * Without this nothing else in the feature works: a society is created
 * `pending`, its join code does not resolve while it is pending, and the
 * founder only becomes its admin when a platform admin flips it to active.
 * Approval was the missing link in the chain, not an optional extra.
 *
 * The check being made is "does this building exist, and is this person
 * plausibly an owner in it" -- the same judgement as the property queue,
 * on the strength of the ownership document they already had approved.
 */

export type SocietyReviewStatus = 'pending' | 'active' | 'rejected';

export interface SocietyReviewRow {
  id: string;
  name: string;
  kind: string;
  address: string;
  city: string | null;
  state: string | null;
  joinCode: string;
  status: SocietyReviewStatus;
  rejectionReason: string | null;
  createdAt: string;
  reviewedAt: string | null;
  createdById: string;
  createdByName: string;
  memberCount: number;
}

export function useAdminSocieties() {
  const [societies, setSocieties] = useState<SocietyReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);

    // users_public rather than users: the same reason the member directory
    // goes through a function. The FK has to be named because communities
    // references users twice, as created_by and reviewed_by.
    const { data, error: dbError } = await supabase
      .from('communities')
      .select(
        'id, name, kind, address, city, state, join_code, status, rejection_reason, created_at, reviewed_at, created_by, creator:users_public!communities_created_by_fkey(name), community_members(count)'
      )
      .order('created_at', { ascending: false });

    if (dbError) {
      setError(dbError.message);
      setSocieties([]);
      setLoading(false);
      return;
    }

    setError(null);
    setSocieties(
      (data ?? []).map((r: Record<string, unknown>) => ({
        id: r.id as string,
        name: r.name as string,
        kind: r.kind as string,
        address: r.address as string,
        city: (r.city as string) ?? null,
        state: (r.state as string) ?? null,
        joinCode: r.join_code as string,
        status: r.status as SocietyReviewStatus,
        rejectionReason: (r.rejection_reason as string) ?? null,
        createdAt: r.created_at as string,
        reviewedAt: (r.reviewed_at as string) ?? null,
        createdById: r.created_by as string,
        createdByName:
          ((r.creator as { name: string | null } | null)?.name) ?? 'Unknown owner',
        memberCount:
          ((r.community_members as { count: number }[] | null)?.[0]?.count) ?? 0,
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Approve. The founder's admin membership is created by a database
   * trigger on this transition, not here -- so this single update is the
   * whole action, and there is no half-approved state to clean up if the
   * client disappears mid-way.
   */
  const approve = useCallback(
    async (id: string, reviewerId: string): Promise<string | null> => {
      const supabase = getSupabase();
      if (!supabase) return 'Not connected to the database.';

      const { error: dbError } = await supabase
        .from('communities')
        .update({
          status: 'active',
          reviewed_by: reviewerId,
          reviewed_at: new Date().toISOString(),
          rejection_reason: null,
        })
        .eq('id', id);

      if (dbError) return dbError.message;
      await load();
      return null;
    },
    [load]
  );

  const reject = useCallback(
    async (id: string, reviewerId: string, reason: string): Promise<string | null> => {
      const supabase = getSupabase();
      if (!supabase) return 'Not connected to the database.';

      const { error: dbError } = await supabase
        .from('communities')
        .update({
          status: 'rejected',
          reviewed_by: reviewerId,
          reviewed_at: new Date().toISOString(),
          rejection_reason: reason,
        })
        .eq('id', id);

      if (dbError) return dbError.message;
      await load();
      return null;
    },
    [load]
  );

  const pendingCount = societies.filter((s) => s.status === 'pending').length;

  return { societies, loading, error, approve, reject, refresh: load, pendingCount };
}

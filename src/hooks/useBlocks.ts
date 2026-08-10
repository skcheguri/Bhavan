import { useState, useEffect, useCallback } from 'react';
import { getSupabase } from '@/lib/supabase';

/**
 * Blocking someone.
 *
 * Distinct from soft_block_states, which is moderation: an owner reports
 * a renter as a broker and Bhavan resolves it. This is personal, nobody
 * reviews it, and it is enforced in RLS on the two paths one member has
 * to reach another -- enquiries and chat (migration 114).
 *
 * You can only ever read your own blocks. "Who has blocked me" is not
 * available by design, so this hook answers "have I blocked them", never
 * "have they blocked me". A blocked person simply finds that contact no
 * longer works, which is the point of blocking rather than muting.
 */
export function useIsBlocked(otherUserId: string | undefined) {
  const [blocked, setBlocked] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase || !otherUserId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { count } = await supabase
      .from('user_blocks')
      .select('blocked_id', { count: 'exact', head: true })
      .eq('blocked_id', otherUserId);
    setBlocked((count ?? 0) > 0);
    setLoading(false);
  }, [otherUserId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { blocked, loading, refresh };
}

/**
 * Whether the two of you have a tenancy that has not ended yet.
 *
 * Blocking is still allowed in that case -- someone who needs to cut
 * contact with their landlord is often exactly the person who most needs
 * to -- but they should be told what it costs, because rent and
 * maintenance are arranged through the channel they are about to close.
 */
export function useLiveTenancyWith(otherUserId: string | undefined, myId: string | undefined) {
  const [live, setLive] = useState(false);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase || !otherUserId || !myId) return;
    let cancelled = false;

    void (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { count } = await supabase
        .from('rental_agreements')
        .select('id', { count: 'exact', head: true })
        .or(
          `and(owner_id.eq.${myId},tenant_id.eq.${otherUserId}),and(owner_id.eq.${otherUserId},tenant_id.eq.${myId})`
        )
        // A missing end date means open-ended, which is still live.
        .or(`lease_end_date.gte.${today},lease_end_date.is.null`);
      if (!cancelled) setLive((count ?? 0) > 0);
    })();

    return () => {
      cancelled = true;
    };
  }, [otherUserId, myId]);

  return live;
}

export async function blockUser(
  blockerId: string,
  blockedId: string
): Promise<{ error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { error: 'Not connected to the database.' };

  const { error } = await supabase
    .from('user_blocks')
    .insert({ blocker_id: blockerId, blocked_id: blockedId });

  // Already blocked is the state they asked for, so it is not an error
  // worth showing.
  if (error && error.code !== '23505') return { error: error.message };
  return { error: null };
}

export async function unblockUser(
  blockerId: string,
  blockedId: string
): Promise<{ error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { error: 'Not connected to the database.' };

  const { error } = await supabase
    .from('user_blocks')
    .delete()
    .eq('blocker_id', blockerId)
    .eq('blocked_id', blockedId);

  return { error: error ? error.message : null };
}

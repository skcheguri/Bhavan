import { useCallback, useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';

export interface ChatMessageFromDB {
  id: string;
  request_id: string;
  sender: 'tenant' | 'landlord';
  text: string;
  read: boolean;
  created_at: string;
}

// Union by id, kept in created_at order. Merging (rather than replacing)
// is what lets the initial snapshot and the realtime stream coexist: a
// message the channel already delivered survives the fetch, and vice versa.
function mergeById(prev: ChatMessageFromDB[], incoming: ChatMessageFromDB[]): ChatMessageFromDB[] {
  if (incoming.length === 0) return prev;
  const byId = new Map(prev.map((m) => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return Array.from(byId.values()).sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function useChatMessages(requestId: string | undefined) {
  const [messages, setMessages] = useState<ChatMessageFromDB[]>([]);
  const [loading, setLoading] = useState(true);

  // A manual refetch that merges rather than replaces, so it can't wipe a
  // message the realtime channel delivered since the last snapshot.
  const refresh = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase || !requestId) {
      setMessages([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('request_id', requestId)
      .order('created_at', { ascending: true });

    if (error) {
      console.warn('Supabase chat_messages fetch error:', error.message);
    } else {
      setMessages((prev) => mergeById(prev, (data ?? []) as ChatMessageFromDB[]));
    }
    setLoading(false);
  }, [requestId]);

  // Subscribe first, then take the snapshot once the channel is live, then
  // merge it in. Two uncoordinated effects (fetch here, subscribe there)
  // used to lose any message committed between the SELECT snapshot and the
  // subscription going live, and the fetch's setMessages([...]) could wipe a
  // row the channel had already appended. One coordinated effect closes both.
  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase || !requestId) {
      setMessages([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setMessages([]);

    const channel = supabase
      .channel(`chat_messages:${requestId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `request_id=eq.${requestId}` },
        (payload) => {
          // The sender's own insert already appends this row locally (see
          // sendMessage below); mergeById makes the echoed realtime event a
          // no-op instead of a duplicate.
          const incoming = payload.new as ChatMessageFromDB;
          setMessages((prev) => mergeById(prev, [incoming]));
        }
      )
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') return;
        // The channel is live now, so any insert from this point is
        // delivered; the snapshot backfills everything before it.
        (async () => {
          const { data, error } = await supabase
            .from('chat_messages')
            .select('*')
            .eq('request_id', requestId)
            .order('created_at', { ascending: true });
          if (cancelled) return;
          if (error) {
            console.warn('Supabase chat_messages fetch error:', error.message);
          } else {
            setMessages((prev) => mergeById(prev, (data ?? []) as ChatMessageFromDB[]));
          }
          setLoading(false);
        })();
      });

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [requestId]);

  const sendMessage = useCallback(
    async (sender: 'tenant' | 'landlord', text: string): Promise<{ error: string | null }> => {
      const supabase = getSupabase();
      if (!supabase || !requestId || !text.trim()) return { error: 'Cannot send message' };

      const { data, error } = await supabase
        .from('chat_messages')
        .insert({ request_id: requestId, sender, text: text.trim(), read: sender === 'landlord' })
        .select()
        .single();

      // The only thing that revokes a party's right to write in a thread
      // they are on is a block, in either direction (migration 114). The
      // wording stays vague on purpose: whether the other person blocked
      // you is not something to confirm, and "no longer" is true either
      // way.
      if (error?.code === '42501') {
        return { error: 'You can no longer send messages in this conversation.' };
      }
      if (error) return { error: error.message };

      setMessages((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data as ChatMessageFromDB]));
      return { error: null };
    },
    [requestId]
  );

  const markRead = useCallback(
    async (fromSender: 'tenant' | 'landlord') => {
      const supabase = getSupabase();
      if (!supabase || !requestId) return;
      await supabase
        .from('chat_messages')
        .update({ read: true })
        .eq('request_id', requestId)
        .eq('sender', fromSender)
        .eq('read', false);
      setMessages((prev) => prev.map((m) => (m.sender === fromSender ? { ...m, read: true } : m)));
    },
    [requestId]
  );

  return { messages, loading, sendMessage, markRead, refresh };
}

export async function getUnreadCountsByRequest(
  requestIds: string[],
  fromSender: 'tenant' | 'landlord'
): Promise<Record<string, number>> {
  const supabase = getSupabase();
  if (!supabase || requestIds.length === 0) return {};

  const { data, error } = await supabase
    .from('chat_messages')
    .select('request_id')
    .in('request_id', requestIds)
    .eq('sender', fromSender)
    .eq('read', false);

  if (error || !data) return {};

  const counts: Record<string, number> = {};
  for (const row of data as { request_id: string }[]) {
    counts[row.request_id] = (counts[row.request_id] ?? 0) + 1;
  }
  return counts;
}

export async function getLastMessagesByRequest(
  requestIds: string[]
): Promise<Record<string, ChatMessageFromDB>> {
  const supabase = getSupabase();
  if (!supabase || requestIds.length === 0) return {};

  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .in('request_id', requestIds)
    .order('created_at', { ascending: false });

  if (error || !data) return {};

  const lastByRequest: Record<string, ChatMessageFromDB> = {};
  for (const row of data as ChatMessageFromDB[]) {
    if (!lastByRequest[row.request_id]) {
      lastByRequest[row.request_id] = row;
    }
  }
  return lastByRequest;
}

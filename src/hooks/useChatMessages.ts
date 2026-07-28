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

export function useChatMessages(requestId: string | undefined) {
  const [messages, setMessages] = useState<ChatMessageFromDB[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase || !requestId) {
      setMessages([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('request_id', requestId)
      .order('created_at', { ascending: true });

    if (error) {
      console.warn('Supabase chat_messages fetch error:', error.message);
      setMessages([]);
    } else {
      setMessages((data ?? []) as ChatMessageFromDB[]);
    }
    setLoading(false);
  }, [requestId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase || !requestId) return;

    const channel = supabase
      .channel(`chat_messages:${requestId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `request_id=eq.${requestId}` },
        (payload) => {
          // The sender's own insert already appends this row locally (see
          // sendMessage below) -- without this guard, the realtime INSERT
          // event echoes right back to the same client and the sender
          // sees their own message twice.
          const incoming = payload.new as ChatMessageFromDB;
          setMessages((prev) => (prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]));
        }
      )
      .subscribe();

    return () => {
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

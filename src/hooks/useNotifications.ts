import { useState, useEffect, useCallback } from 'react';
import { getSupabase, isSupabaseConnected } from '@/lib/supabase';

export interface NotificationFromDB {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  read: boolean | null;
  push_delivered: boolean | null;
  sms_delivered: boolean | null;
  email_delivered: boolean | null;
  read_at: string | null;
  action_url: string | null;
  created_at: string;
}

interface UseNotificationsReturn {
  notifications: NotificationFromDB[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
}

export function useNotifications(userId: string | undefined): UseNotificationsReturn {
  const [notifications, setNotifications] = useState<NotificationFromDB[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Exact unread total, independent of the 50-row display window below --
  // deriving it from that window undercounts once a user passes 50.
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = useCallback(async () => {
    if (!isSupabaseConnected() || !userId) {
      setLoading(false);
      return;
    }
    const supabase = getSupabase();
    if (!supabase) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error: dbError } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (dbError) {
      setError(dbError.message);
      setNotifications([]);
    } else {
      setNotifications((data as NotificationFromDB[]) ?? []);
      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('read', false);
      setUnreadCount(count ?? 0);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);


  const markAsRead = async (id: string) => {
    const supabase = getSupabase();
    if (!supabase || !userId) return;

    const { data, error } = await supabase
      .from('notifications')
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)
      .select('id');

    if (error) {
      console.warn('markAsRead failed:', error.message);
    } else if (data && data.length > 0) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    }
  };

  const markAllAsRead = async () => {
    const supabase = getSupabase();
    if (!supabase || !userId) return;

    const { error } = await supabase
      .from('notifications')
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('read', false);

    if (error) {
      console.warn('markAllAsRead failed:', error.message);
    } else {
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    }
  };

  return { notifications, unreadCount, loading, error, refresh: fetchNotifications, markAsRead, markAllAsRead };
}
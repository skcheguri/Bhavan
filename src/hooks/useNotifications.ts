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
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAsRead = async (id: string) => {
    const supabase = getSupabase();
    if (!supabase || !userId) return;

    const { error } = await supabase
      .from('notifications')
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId);

    if (!error) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
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

    if (!error) {
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    }
  };

  return { notifications, unreadCount, loading, error, refresh: fetchNotifications, markAsRead, markAllAsRead };
}
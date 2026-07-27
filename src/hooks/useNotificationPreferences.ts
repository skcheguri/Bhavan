import { useState, useEffect, useCallback } from 'react';
import { getSupabase } from '@/lib/supabase';

export type NotificationCategory = 'maintenance' | 'inquiries' | 'payments' | 'lease' | 'community' | 'platform';
export type NotificationChannel = 'push_enabled' | 'sms_enabled' | 'email_enabled';

export interface NotificationPreference {
  category: NotificationCategory;
  label: string;
  push_enabled: boolean;
  sms_enabled: boolean;
  email_enabled: boolean;
  criticalOnly?: boolean;
}

// Sensible defaults for a category the user has never touched -- the DB
// row only gets created the first time they flip a toggle.
const CATEGORY_DEFAULTS: Record<NotificationCategory, { label: string; push: boolean; sms: boolean; email: boolean; criticalOnly?: boolean }> = {
  inquiries: { label: 'Inquiries & Messages', push: true, sms: false, email: true },
  maintenance: { label: 'Maintenance Updates', push: true, sms: true, email: true, criticalOnly: true },
  payments: { label: 'Rent & Payment Alerts', push: true, sms: true, email: true, criticalOnly: true },
  lease: { label: 'Lease & Agreements', push: true, sms: false, email: true },
  community: { label: 'Community Activity', push: true, sms: false, email: false },
  platform: { label: 'Platform Announcements', push: false, sms: false, email: true },
};

const CATEGORY_ORDER: NotificationCategory[] = ['inquiries', 'maintenance', 'payments', 'lease', 'community', 'platform'];

export function useNotificationPreferences(userId: string | undefined) {
  const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    const supabase = getSupabase();
    if (!supabase) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      console.warn('Supabase notification_preferences fetch error:', error.message);
    }

    const rowByCategory = new Map(
      ((data ?? []) as Record<string, unknown>[]).map((r) => [r.category as NotificationCategory, r])
    );

    setPreferences(
      CATEGORY_ORDER.map((category) => {
        const row = rowByCategory.get(category);
        const def = CATEGORY_DEFAULTS[category];
        return {
          category,
          label: def.label,
          criticalOnly: def.criticalOnly,
          push_enabled: row ? Boolean(row.push_enabled) : def.push,
          sms_enabled: row ? Boolean(row.sms_enabled) : def.sms,
          email_enabled: row ? Boolean(row.email_enabled) : def.email,
        };
      })
    );
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = useCallback(
    async (category: NotificationCategory, channel: NotificationChannel) => {
      if (!userId) return;
      const current = preferences.find((p) => p.category === category);
      if (!current) return;

      const supabase = getSupabase();
      if (!supabase) return;

      const nextValue = !current[channel];
      const { error } = await supabase.from('notification_preferences').upsert(
        {
          user_id: userId,
          category,
          push_enabled: current.push_enabled,
          sms_enabled: current.sms_enabled,
          email_enabled: current.email_enabled,
          [channel]: nextValue,
        },
        { onConflict: 'user_id,category' }
      );

      if (!error) {
        setPreferences((prev) =>
          prev.map((p) => (p.category === category ? { ...p, [channel]: nextValue } : p))
        );
      }
    },
    [userId, preferences]
  );

  return { preferences, loading, toggle };
}

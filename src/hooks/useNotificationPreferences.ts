import { useState, useEffect, useCallback, useRef } from 'react';
import { getSupabase } from '@/lib/supabase';

export type NotificationCategory = 'maintenance' | 'inquiries' | 'payments' | 'lease' | 'booking' | 'platform';
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
  booking: { label: 'Booking updates', push: true, sms: false, email: true },
  platform: { label: 'Platform Announcements', push: false, sms: false, email: true },
};

const CATEGORY_ORDER: NotificationCategory[] = ['inquiries', 'maintenance', 'payments', 'lease', 'booking', 'platform'];

export function useNotificationPreferences(userId: string | undefined) {
  const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
  const [loading, setLoading] = useState(true);
  // Categories that already have a persisted row. A first toggle writes the
  // full row (the DB column defaults differ from CATEGORY_DEFAULTS, so a
  // single-column insert would reset the untouched channels); once the row
  // exists, later toggles write only their own column, so two rapid toggles
  // on different channels can't clobber each other in the DB.
  const persistedRef = useRef<Set<NotificationCategory>>(new Set());

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

    const rows = (data ?? []) as Record<string, unknown>[];
    persistedRef.current = new Set(rows.map((r) => r.category as NotificationCategory));
    const rowByCategory = new Map(rows.map((r) => [r.category as NotificationCategory, r]));

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

      // Once a row exists, write ONLY the toggled column, so a concurrent
      // toggle of a different channel (which reads the same pre-toggle
      // snapshot) can't overwrite this change. On the first toggle there is
      // no row yet, so write the full row from the currently-displayed
      // values -- a single-column insert would leave the untouched channels
      // at the DB column defaults, which differ from CATEGORY_DEFAULTS.
      const payload = persistedRef.current.has(category)
        ? { user_id: userId, category, [channel]: nextValue }
        : {
            user_id: userId,
            category,
            push_enabled: current.push_enabled,
            sms_enabled: current.sms_enabled,
            email_enabled: current.email_enabled,
            [channel]: nextValue,
          };

      const { error } = await supabase
        .from('notification_preferences')
        .upsert(payload, { onConflict: 'user_id,category' });

      if (error) {
        // Don't leave the toggle silently reverted with no trace; at least
        // record why it didn't take so a failing save is diagnosable.
        console.warn('notification preference update failed:', error.message);
        return;
      }
      persistedRef.current.add(category);
      setPreferences((prev) =>
        prev.map((p) => (p.category === category ? { ...p, [channel]: nextValue } : p))
      );
    },
    [userId, preferences]
  );

  return { preferences, loading, toggle };
}

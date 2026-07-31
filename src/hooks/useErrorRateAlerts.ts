import { useState, useEffect, useCallback } from 'react';
import { getSupabase } from '@/lib/supabase';

export interface ErrorRateAlert {
  id: string;
  windowStart: string;
  windowEnd: string;
  errorCount: number;
  thresholdCount: number;
  webhookNotified: boolean;
  webhookError: string | null;
  acknowledgedAt: string | null;
  createdAt: string;
}

export interface ErrorAlertSettings {
  thresholdCount: number;
  windowMinutes: number;
  webhookUrl: string | null;
}

function mapAlert(r: Record<string, unknown>): ErrorRateAlert {
  return {
    id: String(r.id),
    windowStart: String(r.window_start ?? ''),
    windowEnd: String(r.window_end ?? ''),
    errorCount: Number(r.error_count ?? 0),
    thresholdCount: Number(r.threshold_count ?? 0),
    webhookNotified: Boolean(r.webhook_notified),
    webhookError: (r.webhook_error as string | null) ?? null,
    acknowledgedAt: (r.acknowledged_at as string | null) ?? null,
    createdAt: String(r.created_at ?? ''),
  };
}

// Server-side alerting on client_error_logs (migration 059) -- a pg_cron
// job checks the error rate every 5 minutes and writes a row here when it
// crosses the configured threshold. This hook surfaces that state (and
// lets an admin acknowledge it or tune the threshold) rather than
// re-implementing any rate-checking client-side.
export function useErrorRateAlerts() {
  const [alerts, setAlerts] = useState<ErrorRateAlert[]>([]);
  const [settings, setSettings] = useState<ErrorAlertSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);

    const [alertsRes, settingsRes] = await Promise.all([
      supabase.from('error_rate_alerts').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('error_alert_settings').select('*').eq('id', true).maybeSingle(),
    ]);

    if (alertsRes.error) {
      console.warn('Supabase error_rate_alerts fetch error:', alertsRes.error.message);
      setAlerts([]);
    } else {
      setAlerts(((alertsRes.data ?? []) as Record<string, unknown>[]).map(mapAlert));
    }

    if (settingsRes.error || !settingsRes.data) {
      setSettings(null);
    } else {
      const s = settingsRes.data as Record<string, unknown>;
      setSettings({
        thresholdCount: Number(s.threshold_count ?? 10),
        windowMinutes: Number(s.window_minutes ?? 15),
        webhookUrl: (s.webhook_url as string | null) ?? null,
      });
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const acknowledge = useCallback(async (id: string): Promise<boolean> => {
    const supabase = getSupabase();
    if (!supabase) return false;
    const { error } = await supabase
      .from('error_rate_alerts')
      .update({ acknowledged_at: new Date().toISOString() })
      .eq('id', id);
    if (error) return false;
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, acknowledgedAt: new Date().toISOString() } : a)));
    return true;
  }, []);

  const updateSettings = useCallback(async (updates: Partial<ErrorAlertSettings>): Promise<{ error: string | null }> => {
    const supabase = getSupabase();
    if (!supabase) return { error: 'Supabase not connected' };

    const dbUpdates: Record<string, unknown> = {};
    if (updates.thresholdCount !== undefined) dbUpdates.threshold_count = updates.thresholdCount;
    if (updates.windowMinutes !== undefined) dbUpdates.window_minutes = updates.windowMinutes;
    if (updates.webhookUrl !== undefined) dbUpdates.webhook_url = updates.webhookUrl || null;

    const { error } = await supabase.from('error_alert_settings').update(dbUpdates).eq('id', true);
    if (error) return { error: error.message };

    setSettings((prev) => (prev ? { ...prev, ...updates } : prev));
    return { error: null };
  }, []);

  const activeAlerts = alerts.filter((a) => !a.acknowledgedAt);

  return { alerts, activeAlerts, settings, loading, refresh: load, acknowledge, updateSettings };
}

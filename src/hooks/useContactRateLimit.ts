import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getDeviceFingerprint } from '@/lib/fingerprint';
const SUPABASE_URL =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_PUBLIC_SUPABASE_URL) || '';
const SUPABASE_ANON_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY) || '';

function isSupabaseConnected(): boolean {
  return !!SUPABASE_URL && !!SUPABASE_ANON_KEY;
}

function getEdgeFunctionUrl(name: string): string {
  return `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/${name}`;
}

const STORAGE_KEY_PREFIX = 'bungalow_contacts_';
const STORAGE_KEY_DEVICE = 'bungalow_device_contacts_';
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const MAX_DAILY = 5;
const MAX_WEEKLY = 20;
const MAX_DEVICE_DAILY = 3;
const MAX_DEVICE_WEEKLY = 10;

// ---------------------------------------------------------------------------
// Layer 1: Client-side localStorage (fast, per userId)
// ---------------------------------------------------------------------------

function getUserKey(userId: string): string {
  return `${STORAGE_KEY_PREFIX}${userId}`;
}

function getUserTimestamps(userId: string): string[] {
  if (!userId) return [];
  try {
    const raw = localStorage.getItem(getUserKey(userId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveUserTimestamps(userId: string, timestamps: string[]) {
  if (!userId) return;
  const cutoff = new Date(Date.now() - 30 * DAY_MS).toISOString();
  const filtered = timestamps.filter((t) => t > cutoff);
  localStorage.setItem(getUserKey(userId), JSON.stringify(filtered));
}

// ---------------------------------------------------------------------------
// Layer 2: Device fingerprint localStorage (per device, survives incognito)
// ---------------------------------------------------------------------------

function getDeviceKey(): string {
  return `${STORAGE_KEY_DEVICE}${getDeviceFingerprint()}`;
}

function getDeviceTimestamps(): string[] {
  try {
    const raw = localStorage.getItem(getDeviceKey());
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveDeviceTimestamps(timestamps: string[]) {
  const cutoff = new Date(Date.now() - 30 * DAY_MS).toISOString();
  const filtered = timestamps.filter((t) => t > cutoff);
  localStorage.setItem(getDeviceKey(), JSON.stringify(filtered));
}

// ---------------------------------------------------------------------------
// Server types
// ---------------------------------------------------------------------------

interface ServerRateLimit {
  canSend: boolean;
  dailyCount: number;
  weeklyCount: number;
  dailyRemaining: number;
  weeklyRemaining: number;
  limitReason: string | null;
  ipDailyCount?: number;
  ipWeeklyCount?: number;
  deviceDailyCount?: number;
  deviceWeeklyCount?: number;
}

// ---------------------------------------------------------------------------
// Rate Limit Status Interface
// ---------------------------------------------------------------------------

export interface RateLimitStatus {
  dailyCount: number;
  weeklyCount: number;
  dailyRemaining: number;
  weeklyRemaining: number;
  canSend: boolean;
  limitReason: string | null;
  isServerEnforced: boolean;
  serverChecked: boolean;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function computeClientStatus(userId: string | undefined): RateLimitStatus {
  // For authenticated users, user-based limits
  if (userId) {
    const timestamps = getUserTimestamps(userId);
    const now = Date.now();
    const dailyCount = timestamps.filter((t) => now - new Date(t).getTime() < DAY_MS).length;
    const weeklyCount = timestamps.filter((t) => now - new Date(t).getTime() < WEEK_MS).length;
    const canSend = dailyCount < MAX_DAILY && weeklyCount < MAX_WEEKLY;
    let limitReason: string | null = null;
    if (dailyCount >= MAX_DAILY) {
      limitReason = `You have reached the limit of ${MAX_DAILY} landlord contacts per day. Please try again tomorrow.`;
    } else if (weeklyCount >= MAX_WEEKLY) {
      limitReason = `You have reached the limit of ${MAX_WEEKLY} landlord contacts per week. Please try again next week.`;
    }
    return {
      dailyCount,
      weeklyCount,
      dailyRemaining: Math.max(0, MAX_DAILY - dailyCount),
      weeklyRemaining: Math.max(0, MAX_WEEKLY - weeklyCount),
      canSend,
      limitReason,
      isServerEnforced: false,
      serverChecked: false,
    };
  }

  // For non-authenticated users, device-based limits
  const timestamps = getDeviceTimestamps();
  const now = Date.now();
  const dailyCount = timestamps.filter((t) => now - new Date(t).getTime() < DAY_MS).length;
  const weeklyCount = timestamps.filter((t) => now - new Date(t).getTime() < WEEK_MS).length;
  const canSend = dailyCount < MAX_DEVICE_DAILY && weeklyCount < MAX_DEVICE_WEEKLY;
  let limitReason: string | null = null;
  if (dailyCount >= MAX_DEVICE_DAILY) {
    limitReason = `This device has reached the daily contact limit. Please try again tomorrow.`;
  } else if (weeklyCount >= MAX_DEVICE_WEEKLY) {
    limitReason = `This device has reached the weekly contact limit. Please try again next week.`;
  }
  return {
    dailyCount,
    weeklyCount,
    dailyRemaining: Math.max(0, MAX_DEVICE_DAILY - dailyCount),
    weeklyRemaining: Math.max(0, MAX_DEVICE_WEEKLY - weeklyCount),
    canSend,
    limitReason,
    isServerEnforced: false,
    serverChecked: false,
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useContactRateLimit(userId: string | undefined) {
  const [serverStatus, setServerStatus] = useState<ServerRateLimit | null>(null);
  const [serverLoading, setServerLoading] = useState(false);
  const checkedRef = useRef(false);

  // Compute client-side status
  const clientStatus = useMemo(() => computeClientStatus(userId), [userId]);

  // Layer 3: Server check (only when Supabase is connected)
  useEffect(() => {
    if (!isSupabaseConnected()) return;
    if (checkedRef.current) return;
    checkedRef.current = true;

    const checkServer = async () => {
      setServerLoading(true);
      try {
        const fingerprint = getDeviceFingerprint();
        const response = await fetch(getEdgeFunctionUrl('check-contact-limit'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            userId: userId || undefined,
            deviceFingerprint: fingerprint,
          }),
        });
        if (response.ok) {
          const data = await response.json();
          setServerStatus(data);
        }
      } catch {
        // Network or CORS error — silently fall back to client-side limits
      } finally {
        setServerLoading(false);
      }
    };

    checkServer();
  }, [userId]);

  // Merge: server takes precedence when available
  const status: RateLimitStatus = useMemo(() => {
    if (serverStatus) {
      return {
        dailyCount: serverStatus.dailyCount,
        weeklyCount: serverStatus.weeklyCount,
        dailyRemaining: serverStatus.dailyRemaining,
        weeklyRemaining: serverStatus.weeklyRemaining,
        canSend: serverStatus.canSend,
        limitReason: serverStatus.limitReason,
        isServerEnforced: true,
        serverChecked: true,
      };
    }
    return { ...clientStatus, serverChecked: !serverLoading };
  }, [serverStatus, clientStatus, serverLoading]);

  // Record an attempt
  const record = useCallback(async (listingId?: string): Promise<boolean> => {
    if (!status.canSend) return false;

    // Always record client-side
    const now = new Date().toISOString();
    if (userId) {
      const timestamps = getUserTimestamps(userId);
      timestamps.push(now);
      saveUserTimestamps(userId, timestamps);
    }
    const deviceTimestamps = getDeviceTimestamps();
    deviceTimestamps.push(now);
    saveDeviceTimestamps(deviceTimestamps);

    // If server connected, also record server-side
    if (isSupabaseConnected() && SUPABASE_URL && SUPABASE_ANON_KEY) {
      try {
        const fingerprint = getDeviceFingerprint();
        await fetch(getEdgeFunctionUrl('record-contact'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            userId: userId || undefined,
            deviceFingerprint: fingerprint,
            listingId,
          }),
        });
      } catch {
        // Ignore network errors — client-side already recorded
      }
    }

    return true;
  }, [status.canSend, userId]);

  return { ...status, record };
}

// ---------------------------------------------------------------------------
// Standalone helpers (for non-component usage)
// ---------------------------------------------------------------------------

export function getContactLimitStatus(userId: string): RateLimitStatus {
  return computeClientStatus(userId || undefined);
}

export function recordContactAttempt(userId: string): boolean {
  const status = getContactLimitStatus(userId);
  if (!status.canSend) return false;
  const now = new Date().toISOString();
  const timestamps = getUserTimestamps(userId);
  timestamps.push(now);
  saveUserTimestamps(userId, timestamps);
  return true;
}
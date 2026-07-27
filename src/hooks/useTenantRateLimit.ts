import { useCallback, useMemo } from 'react';
import type { RateLimitStatus } from './useOwnerRateLimit';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

const CHAT_MAX_DAILY = 100;
const CHAT_MAX_WEEKLY = 500;
const CHAT_KEY_PREFIX = 'bungalow_tenant_chat_';

function getKey(userId: string): string {
  return `${CHAT_KEY_PREFIX}${userId}`;
}

function getTimestamps(userId: string): string[] {
  if (!userId) return [];
  try {
    const raw = localStorage.getItem(getKey(userId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveTimestamps(userId: string, timestamps: string[]) {
  if (!userId) return;
  const cutoff = new Date(Date.now() - 30 * DAY_MS).toISOString();
  localStorage.setItem(getKey(userId), JSON.stringify(timestamps.filter((t) => t > cutoff)));
}

function buildStatus(timestamps: string[]): RateLimitStatus {
  const now = Date.now();
  const dailyCount = timestamps.filter((t) => now - new Date(t).getTime() < DAY_MS).length;
  const weeklyCount = timestamps.filter((t) => now - new Date(t).getTime() < WEEK_MS).length;
  const dailyRemaining = Math.max(0, CHAT_MAX_DAILY - dailyCount);
  const weeklyRemaining = Math.max(0, CHAT_MAX_WEEKLY - weeklyCount);
  const canSend = dailyCount < CHAT_MAX_DAILY && weeklyCount < CHAT_MAX_WEEKLY;

  let limitReason: string | null = null;
  if (dailyCount >= CHAT_MAX_DAILY) {
    limitReason = `You have reached the daily limit of ${CHAT_MAX_DAILY} messages. Please try again tomorrow.`;
  } else if (weeklyCount >= CHAT_MAX_WEEKLY) {
    limitReason = `You have reached the weekly limit of ${CHAT_MAX_WEEKLY} messages. Please try again next week.`;
  }

  return { dailyCount, weeklyCount, dailyRemaining, weeklyRemaining, canSend, limitReason };
}

export function useTenantChatRateLimit(userId: string | undefined) {
  const chat = useMemo(() => buildStatus(getTimestamps(userId || '')), [userId]);

  const recordChat = useCallback((): boolean => {
    if (!userId) return false;
    const timestamps = getTimestamps(userId);
    const status = buildStatus(timestamps);
    if (!status.canSend) return false;
    timestamps.push(new Date().toISOString());
    saveTimestamps(userId, timestamps);
    return true;
  }, [userId]);

  return { chat, recordChat };
}

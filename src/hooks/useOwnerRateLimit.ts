import { useCallback, useMemo, useState } from 'react';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/* ───────── Inquiry Response Limits ───────── */
const INQUIRY_MAX_DAILY = 50;
const INQUIRY_MAX_WEEKLY = 200;
const INQUIRY_KEY_PREFIX = 'bhavan_owner_inquiry_responses_';

/* ───────── Shared helpers ───────── */
function getKey(userId: string, prefix: string): string {
  return `${prefix}${userId}`;
}

function getTimestamps(userId: string, prefix: string): string[] {
  if (!userId) return [];
  try {
    const raw = localStorage.getItem(getKey(userId, prefix));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveTimestamps(userId: string, prefix: string, timestamps: string[]) {
  if (!userId) return;
  const cutoff = new Date(Date.now() - 30 * DAY_MS).toISOString();
  const filtered = timestamps.filter((t) => t > cutoff);
  localStorage.setItem(getKey(userId, prefix), JSON.stringify(filtered));
}

export interface RateLimitStatus {
  dailyCount: number;
  weeklyCount: number;
  dailyRemaining: number;
  weeklyRemaining: number;
  canSend: boolean;
  limitReason: string | null;
}

function buildStatus(
  timestamps: string[],
  maxDaily: number,
  maxWeekly: number,
  actionName: string,
): RateLimitStatus {
  const now = Date.now();

  const dailyCount = timestamps.filter(
    (t) => now - new Date(t).getTime() < DAY_MS,
  ).length;
  const weeklyCount = timestamps.filter(
    (t) => now - new Date(t).getTime() < WEEK_MS,
  ).length;

  const dailyRemaining = Math.max(0, maxDaily - dailyCount);
  const weeklyRemaining = Math.max(0, maxWeekly - weeklyCount);
  const canSend = dailyCount < maxDaily && weeklyCount < maxWeekly;

  let limitReason: string | null = null;
  if (dailyCount >= maxDaily) {
    limitReason = `You have reached the daily limit of ${maxDaily} ${actionName}. Please try again tomorrow.`;
  } else if (weeklyCount >= maxWeekly) {
    limitReason = `You have reached the weekly limit of ${maxWeekly} ${actionName}. Please try again next week.`;
  }

  return { dailyCount, weeklyCount, dailyRemaining, weeklyRemaining, canSend, limitReason };
}

function recordAttempt(
  userId: string,
  prefix: string,
  maxDaily: number,
  maxWeekly: number,
  actionName: string,
): boolean {
  const timestamps = getTimestamps(userId, prefix);
  const status = buildStatus(timestamps, maxDaily, maxWeekly, actionName);
  if (!status.canSend) return false;

  timestamps.push(new Date().toISOString());
  saveTimestamps(userId, prefix, timestamps);
  return true;
}

/* ───────── Inquiry Responses ───────── */
export function getInquiryLimitStatus(userId: string): RateLimitStatus {
  return buildStatus(
    getTimestamps(userId, INQUIRY_KEY_PREFIX),
    INQUIRY_MAX_DAILY,
    INQUIRY_MAX_WEEKLY,
    'inquiry responses',
  );
}

export function recordInquiryResponse(userId: string): boolean {
  return recordAttempt(
    userId,
    INQUIRY_KEY_PREFIX,
    INQUIRY_MAX_DAILY,
    INQUIRY_MAX_WEEKLY,
    'inquiry responses',
  );
}

/* ───────── React Hook ───────── */
export interface OwnerRateLimits {
  inquiry: RateLimitStatus;
  recordInquiry: () => boolean;
}

export function useOwnerRateLimit(userId: string | undefined): OwnerRateLimits {
  // Bumped after each recorded response so the memo re-reads localStorage;
  // without it the count and canSend were frozen at mount-time values and
  // only moved after a full reload.
  const [version, setVersion] = useState(0);
  // version is a deliberate invalidation key so the memo re-reads localStorage.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const inquiry = useMemo(() => getInquiryLimitStatus(userId || ''), [userId, version]);

  const recordInquiry = useCallback((): boolean => {
    if (!userId) return false;
    const ok = recordInquiryResponse(userId);
    if (ok) setVersion((v) => v + 1);
    return ok;
  }, [userId]);

  return { inquiry, recordInquiry };
}
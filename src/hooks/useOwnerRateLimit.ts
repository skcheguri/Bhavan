import { useCallback, useMemo } from 'react';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/* ───────── Inquiry Response Limits ───────── */
const INQUIRY_MAX_DAILY = 50;
const INQUIRY_MAX_WEEKLY = 200;
const INQUIRY_KEY_PREFIX = 'bungalow_owner_inquiry_responses_';

/* ───────── Chat Message Limits ───────── */
const CHAT_MAX_DAILY = 100;
const CHAT_MAX_WEEKLY = 500;
const CHAT_KEY_PREFIX = 'bungalow_owner_chat_';

/* ───────── Community Post Limits ───────── */
const COMMUNITY_MAX_DAILY = 5;
const COMMUNITY_MAX_WEEKLY = 15;
const COMMUNITY_KEY_PREFIX = 'bungalow_owner_community_';

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

/* ───────── Chat Messages ───────── */
export function getChatLimitStatus(userId: string): RateLimitStatus {
  return buildStatus(
    getTimestamps(userId, CHAT_KEY_PREFIX),
    CHAT_MAX_DAILY,
    CHAT_MAX_WEEKLY,
    'messages',
  );
}

export function recordChatMessage(userId: string): boolean {
  return recordAttempt(
    userId,
    CHAT_KEY_PREFIX,
    CHAT_MAX_DAILY,
    CHAT_MAX_WEEKLY,
    'messages',
  );
}

/* ───────── Community Posts ───────── */
export function getCommunityLimitStatus(userId: string): RateLimitStatus {
  return buildStatus(
    getTimestamps(userId, COMMUNITY_KEY_PREFIX),
    COMMUNITY_MAX_DAILY,
    COMMUNITY_MAX_WEEKLY,
    'community posts',
  );
}

export function recordCommunityPost(userId: string): boolean {
  return recordAttempt(
    userId,
    COMMUNITY_KEY_PREFIX,
    COMMUNITY_MAX_DAILY,
    COMMUNITY_MAX_WEEKLY,
    'community posts',
  );
}

/* ───────── React Hook ───────── */
export interface OwnerRateLimits {
  inquiry: RateLimitStatus;
  chat: RateLimitStatus;
  community: RateLimitStatus;
  recordInquiry: () => boolean;
  recordChat: () => boolean;
  recordCommunity: () => boolean;
}

export function useOwnerRateLimit(userId: string | undefined): OwnerRateLimits {
  const inquiry = useMemo(
    () => getInquiryLimitStatus(userId || ''),
    [userId],
  );
  const chat = useMemo(
    () => getChatLimitStatus(userId || ''),
    [userId],
  );
  const community = useMemo(
    () => getCommunityLimitStatus(userId || ''),
    [userId],
  );

  const recordInquiry = useCallback((): boolean => {
    if (!userId) return false;
    return recordInquiryResponse(userId);
  }, [userId]);

  const recordChat = useCallback((): boolean => {
    if (!userId) return false;
    return recordChatMessage(userId);
  }, [userId]);

  const recordCommunity = useCallback((): boolean => {
    if (!userId) return false;
    return recordCommunityPost(userId);
  }, [userId]);

  return { inquiry, chat, community, recordInquiry, recordChat, recordCommunity };
}
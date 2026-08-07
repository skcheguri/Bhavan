import { Preferences } from '@capacitor/preferences';

/**
 * A small, deliberately narrow offline store.
 *
 * WHAT IS CACHED, AND WHY NOT MORE
 *
 * Only things the user explicitly kept: saved listings, and rental
 * agreements and receipts they have already opened.
 *
 * A general "cache everything you browsed" store was considered and
 * rejected. In a rental marketplace, a listing that has been withdrawn or
 * repriced is not stale data, it is wrong data -- someone travels across a
 * city for a flat that is gone, or budgets against a rent that changed.
 * And nearly everything here is RLS-gated per user, so a shared cache
 * would either leak between accounts or need per-account partitioning that
 * buys nothing. Showing less, accurately, beats showing more, wrongly.
 *
 * Cached reads are always labelled with their age at the UI, never
 * presented as live. That is the whole justification for this file: it is
 * honest about being a snapshot.
 *
 * Storage is @capacitor/preferences, which is the OS key-value store on
 * device and localStorage on web. Not for secrets -- it is plain text
 * (see biometricAuth.ts, which deliberately does not use it).
 */

const PREFIX = 'bhavan.offline.';

/** Namespaced per user: two accounts on one phone must not see each other's data. */
function keyFor(namespace: string, userId: string): string {
  return `${PREFIX}${namespace}.${userId}`;
}

interface Envelope<T> {
  cachedAt: number;
  data: T;
}

export interface CachedRead<T> {
  data: T | null;
  /** When this snapshot was taken. Null when nothing is cached. */
  cachedAt: Date | null;
}

export async function writeCache<T>(namespace: string, userId: string, data: T): Promise<void> {
  try {
    const envelope: Envelope<T> = { cachedAt: Date.now(), data };
    await Preferences.set({ key: keyFor(namespace, userId), value: JSON.stringify(envelope) });
  } catch {
    // A full or unavailable store must never break the online path, which
    // is working perfectly well without the cache.
  }
}

export async function readCache<T>(namespace: string, userId: string): Promise<CachedRead<T>> {
  try {
    const { value } = await Preferences.get({ key: keyFor(namespace, userId) });
    if (!value) return { data: null, cachedAt: null };
    const envelope = JSON.parse(value) as Envelope<T>;
    return { data: envelope.data, cachedAt: new Date(envelope.cachedAt) };
  } catch {
    // Corrupt or from an older shape -- treat as absent rather than
    // crashing a screen the user is trying to read offline.
    return { data: null, cachedAt: null };
  }
}

/**
 * Wipes every cached namespace for a user. Called on sign-out and account
 * deletion: a shared phone must not show the previous person's saved flats
 * or, worse, their rental agreement.
 */
export async function clearCacheForUser(userId: string): Promise<void> {
  try {
    const { keys } = await Preferences.keys();
    const suffix = `.${userId}`;
    await Promise.all(
      keys
        .filter((k) => k.startsWith(PREFIX) && k.endsWith(suffix))
        .map((key) => Preferences.remove({ key }))
    );
  } catch {
    // Nothing readable to clear.
  }
}

/** "2 hours ago" for the cached-data label. Short and non-alarming. */
export function describeAge(cachedAt: Date | null): string {
  if (!cachedAt) return '';
  const minutes = Math.round((Date.now() - cachedAt.getTime()) / 60000);
  if (minutes < 2) return 'just now';
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}

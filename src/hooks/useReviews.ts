import { useState, useEffect, useCallback } from 'react';
import { getSupabase } from '@/lib/supabase';

export type FeedbackRole = 'owner_on_renter' | 'renter_on_owner';

// Type alias (not interface) so it stays assignable to the json column
// type on insert.
export type ReviewAnswer = {
  question: string;
  value: boolean | null;
};

export interface ReviewFromDB {
  id: string;
  role: FeedbackRole;
  reviewer_id: string;
  reviewer_name: string;
  reviewer_avatar: string;
  subject_id: string | null;
  subject_name: string;
  subject_avatar: string;
  property: string;
  location: string;
  tenancy_period: string;
  overall_rating: number;
  answers: ReviewAnswer[];
  comment: string;
  created_at: string;
}

function mapReview(r: Record<string, unknown>): ReviewFromDB {
  const reviewer = r.reviewer as { name?: string; avatar_url?: string } | null;
  const subject = r.subject as { name?: string; avatar_url?: string } | null;
  return {
    id: String(r.id),
    role: r.role as FeedbackRole,
    reviewer_id: String(r.reviewer_id ?? ''),
    reviewer_name: reviewer?.name ?? 'Unknown',
    reviewer_avatar: reviewer?.avatar_url ?? '/placeholders/avatar.svg',
    subject_id: (r.subject_id as string | null) ?? null,
    subject_name: subject?.name ?? (r.subject_name as string | null) ?? 'Unknown',
    subject_avatar: subject?.avatar_url ?? '/placeholders/avatar.svg',
    property: (r.property_name as string | null) ?? '',
    location: (r.location as string | null) ?? '',
    tenancy_period: (r.tenancy_period as string | null) ?? '',
    overall_rating: Number(r.overall_rating ?? 0),
    answers: (r.answers as ReviewAnswer[] | null) ?? [],
    comment: (r.comment as string | null) ?? '',
    created_at: String(r.created_at),
  };
}

const REVIEW_SELECT =
  '*, reviewer:users_public!reviews_reviewer_id_fkey(name, avatar_url), subject:users_public!reviews_subject_id_fkey(name, avatar_url)';

interface UseReviewsReturn {
  reviews: ReviewFromDB[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useReviews(): UseReviewsReturn {
  const [reviews, setReviews] = useState<ReviewFromDB[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReviews = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    const { data, error: dbError } = await supabase
      .from('reviews')
      .select(REVIEW_SELECT)
      .order('created_at', { ascending: false });

    if (dbError) {
      setError(dbError.message);
      setReviews([]);
    } else {
      setReviews(((data ?? []) as unknown as Record<string, unknown>[]).map(mapReview));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  return { reviews, loading, error, refresh: fetchReviews };
}

// Reviews written ABOUT a specific real user (subject_id-linked only).
export function useSubjectReviews(subjectId: string | undefined) {
  const [reviews, setReviews] = useState<ReviewFromDB[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase || !subjectId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('reviews')
      .select(REVIEW_SELECT)
      .eq('subject_id', subjectId)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Supabase reviews (by subject) fetch error:', error.message);
      setReviews([]);
    } else {
      setReviews(((data ?? []) as unknown as Record<string, unknown>[]).map(mapReview));
    }
    setLoading(false);
  }, [subjectId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { reviews, loading, refresh };
}

// Reviews written BY a specific real user.
export function useReviewerReviews(reviewerId: string | undefined) {
  const [reviews, setReviews] = useState<ReviewFromDB[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase || !reviewerId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('reviews')
      .select(REVIEW_SELECT)
      .eq('reviewer_id', reviewerId)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Supabase reviews (by reviewer) fetch error:', error.message);
      setReviews([]);
    } else {
      setReviews(((data ?? []) as unknown as Record<string, unknown>[]).map(mapReview));
    }
    setLoading(false);
  }, [reviewerId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { reviews, loading, refresh };
}

export async function hasReviewed(reviewerId: string, subjectId: string): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  const { count } = await supabase
    .from('reviews')
    .select('id', { count: 'exact', head: true })
    .eq('reviewer_id', reviewerId)
    .eq('subject_id', subjectId);
  return (count ?? 0) > 0;
}

// subject_id is required: reviews.subject_id is NOT NULL and reviews are
// RLS-restricted to real tenant-owner relationships, so a review must
// name an actual account. The old signature also inserted a subject_name
// column that doesn't exist in the database -- every submission through
// this path failed at runtime with a column-not-found error until the
// generated types surfaced it.
export async function createReview(payload: {
  reviewer_id: string;
  subject_id: string;
  role: FeedbackRole;
  property_name: string;
  tenancy_period: string;
  overall_rating: number;
  answers: ReviewAnswer[];
  comment: string;
}): Promise<{ error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { error: 'Supabase not connected' };

  const { error } = await supabase.from('reviews').insert({
    reviewer_id: payload.reviewer_id,
    subject_id: payload.subject_id,
    role: payload.role,
    property_name: payload.property_name,
    tenancy_period: payload.tenancy_period,
    overall_rating: payload.overall_rating,
    answers: payload.answers,
    comment: payload.comment,
  });

  if (error) return { error: error.message };
  return { error: null };
}

/**
 * The tenancies the signed-in user may review, and everything a review
 * needs, taken from the agreement rather than typed in.
 *
 * Three things were wrong with asking for it:
 *
 * The reviewer chose their own role from a pair of tabs, so a tenant
 * could file a review as "owner on tenant". Which side you are on is a
 * fact of the agreement, not a preference.
 *
 * Name, property and tenancy period were free text, so a review could
 * name a flat nobody rented for a period that never happened. They are
 * columns on the agreement.
 *
 * And a review needs a real tenancy behind it. An approved enquiry --
 * which is all the RLS on `reviews` requires -- means somebody was
 * allowed to make contact, not that they ever rented anything.
 */
export interface ReviewableTenancy {
  agreementId: string;
  subjectId: string;
  subjectName: string;
  role: FeedbackRole;
  propertyName: string;
  tenancyPeriod: string;
  alreadyReviewed: boolean;
}

function periodLabel(start: string | null, end: string | null): string {
  const fmt = (d: string) =>
    new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  if (!start) return 'Dates not recorded';
  return end ? `${fmt(start)} – ${fmt(end)}` : `${fmt(start)} – ongoing`;
}

export function useReviewableTenancies(userId: string | undefined) {
  const [tenancies, setTenancies] = useState<ReviewableTenancy[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase || !userId) {
      setTenancies([]);
      setLoading(false);
      return;
    }
    setLoading(true);

    // Both sides in one query: an agreement is reviewable by whichever
    // of the two people is signed in.
    const { data, error } = await supabase
      .from('rental_agreements')
      .select('id, owner_id, tenant_id, tenant_name, landlord_name, property_address, flat_number, lease_start_date, lease_end_date')
      .or(`owner_id.eq.${userId},tenant_id.eq.${userId}`)
      .order('lease_start_date', { ascending: false });

    if (error || !data) {
      setTenancies([]);
      setLoading(false);
      return;
    }

    const { data: written } = await supabase
      .from('reviews')
      .select('subject_id')
      .eq('reviewer_id', userId);
    const reviewed = new Set((written ?? []).map((r) => r.subject_id as string));

    setTenancies(
      (data as Record<string, unknown>[])
        .map((a): ReviewableTenancy | null => {
          const iAmOwner = a.owner_id === userId;
          const subjectId = (iAmOwner ? a.tenant_id : a.owner_id) as string | null;
          // An agreement drafted before the tenant had an account has no
          // counterparty to attach a review to.
          if (!subjectId) return null;
          const flat = String(a.flat_number ?? '').trim();
          const address = String(a.property_address ?? '').trim();
          return {
            agreementId: String(a.id),
            subjectId,
            subjectName: String((iAmOwner ? a.tenant_name : a.landlord_name) ?? '') || 'Unnamed',
            role: iAmOwner ? 'owner_on_renter' : 'renter_on_owner',
            propertyName: [flat, address].filter(Boolean).join(', ') || 'Property not recorded',
            tenancyPeriod: periodLabel(
              a.lease_start_date as string | null,
              a.lease_end_date as string | null
            ),
            alreadyReviewed: reviewed.has(subjectId),
          };
        })
        .filter((t): t is ReviewableTenancy => t !== null)
    );
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { tenancies, loading, refresh: load };
}

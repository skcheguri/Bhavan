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
  edited_at: string | null;
}

/**
 * A review may be corrected for an hour, then it stands. The same hour is
 * enforced by RLS and by enforce_review_edit_window() (migration 109) --
 * this constant only decides whether the UI offers the button, and must
 * not be relaxed on its own.
 */
export const REVIEW_EDIT_WINDOW_MS = 60 * 60 * 1000;

export function editWindowClosesAt(createdAt: string): number {
  return new Date(createdAt).getTime() + REVIEW_EDIT_WINDOW_MS;
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
    edited_at: (r.edited_at as string | null) ?? null,
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

// hasReviewed(reviewer, subject) used to gate the "Write a Review"
// button. It asked the wrong question: a review belongs to a tenancy,
// and two people can share several, so one review of a person hid the
// button for every tenancy they ever shared. useReviewableTenancies
// answers per tenancy instead.

// subject_id is required: reviews.subject_id is NOT NULL and reviews are
// RLS-restricted to real tenant-owner relationships, so a review must
// name an actual account. The old signature also inserted a subject_name
// column that doesn't exist in the database -- every submission through
// this path failed at runtime with a column-not-found error until the
// generated types surfaced it.
export async function createReview(payload: {
  reviewer_id: string;
  subject_id: string;
  agreement_id?: string | null;
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
    agreement_id: payload.agreement_id ?? null,
    role: payload.role,
    property_name: payload.property_name,
    tenancy_period: payload.tenancy_period,
    overall_rating: payload.overall_rating,
    answers: payload.answers,
    comment: payload.comment,
  });

  // A second review of the same tenancy is caught by the
  // reviews_one_per_tenancy index. The reviewer sees this when their
  // picker is out of date -- another tab, or a submission earlier in the
  // same session -- and "duplicate key value violates unique constraint"
  // is not something to put in front of them.
  if (error?.code === '23505') {
    return { error: 'You have already reviewed this tenancy. Each tenancy can be reviewed once.' };
  }
  if (error) return { error: error.message };
  return { error: null };
}

/**
 * Correct a review inside its edit window.
 *
 * Only the verdict is sent. Who the review is about, which side it speaks
 * from and which tenancy it belongs to are pinned server-side, so sending
 * them would be at best ignored.
 *
 * The zero-row case matters: an UPDATE that RLS filters out is not an
 * error. PostgREST returns success having changed nothing, so a reviewer
 * whose hour ran out while the modal was open would otherwise be told
 * their edit saved. `.select()` is what makes the difference visible.
 */
export async function updateReview(
  id: string,
  payload: { overall_rating: number; answers: ReviewAnswer[]; comment: string }
): Promise<{ error: string | null }> {
  const supabase = getSupabase();
  if (!supabase) return { error: 'Supabase not connected' };

  const { data, error } = await supabase
    .from('reviews')
    .update({
      overall_rating: payload.overall_rating,
      answers: payload.answers,
      comment: payload.comment,
    })
    .eq('id', id)
    .select('id');

  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: 'This review can no longer be edited — reviews can only be changed within an hour of writing them.' };
  }
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

/**
 * The name to show for the other party on a tenancy.
 *
 * rental_agreements stores the counterparty's name as text, and on some
 * agreements that text is an email address -- so the picker offered
 * "skrockster@gmail.com | Your tenant", putting an address on screen
 * where a person's name belongs. The linked account usually has a real
 * name, so prefer whichever of the two is not an email. If both are,
 * show the part before the @ rather than the whole address.
 */
export function partyName(agreementName: unknown, accountName: unknown): string {
  const isEmail = (s: string) => /\S+@\S+\.\S+/.test(s);
  const candidates = [agreementName, accountName]
    .map((s) => String(s ?? '').trim())
    .filter(Boolean);

  return (
    candidates.find((c) => !isEmail(c)) ??
    candidates[0]?.split('@')[0] ??
    'Unnamed'
  );
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
      .select(
        'id, owner_id, tenant_id, tenant_name, landlord_name, property_address, flat_number, lease_start_date, lease_end_date,' +
          ' owner:users_public!rental_agreements_owner_id_fkey(name),' +
          ' tenant:users_public!rental_agreements_tenant_id_fkey(name)'
      )
      .or(`owner_id.eq.${userId},tenant_id.eq.${userId}`)
      .order('lease_start_date', { ascending: false });

    if (error || !data) {
      setTenancies([]);
      setLoading(false);
      return;
    }

    const { data: written } = await supabase
      .from('reviews')
      .select('agreement_id')
      .eq('reviewer_id', userId)
      .not('agreement_id', 'is', null);
    const reviewed = new Set((written ?? []).map((r) => r.agreement_id as string));

    setTenancies(
      // Cast through unknown: the generated types cannot express an embed
      // from users_public, which is a view over the table the foreign key
      // actually points at. Same treatment as REVIEW_SELECT above.
      (data as unknown as Record<string, unknown>[])
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
            subjectName: partyName(
              iAmOwner ? a.tenant_name : a.landlord_name,
              ((iAmOwner ? a.tenant : a.owner) as { name?: string } | null)?.name
            ),
            role: iAmOwner ? 'owner_on_renter' : 'renter_on_owner',
            propertyName: [flat, address].filter(Boolean).join(', ') || 'Property not recorded',
            tenancyPeriod: periodLabel(
              a.lease_start_date as string | null,
              a.lease_end_date as string | null
            ),
            alreadyReviewed: reviewed.has(String(a.id)),
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

import { useState, useEffect, useCallback } from 'react';
import { getSupabase } from '@/lib/supabase';

export type FeedbackRole = 'owner_on_renter' | 'renter_on_owner';

export interface ReviewAnswer {
  question: string;
  value: boolean | null;
}

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

export async function createReview(payload: {
  reviewer_id: string;
  subject_id?: string | null;
  subject_name: string;
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
    subject_id: payload.subject_id ?? null,
    subject_name: payload.subject_name,
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

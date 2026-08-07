import { useDismissableLayer } from '@/hooks/useDismissableLayer';
import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useSubjectReviews, hasReviewed, type FeedbackRole } from '@/hooks/useReviews';
import FeedbackModal from '@/pages/feedback/components/FeedbackModal';

interface BasicProfile {
  name: string;
  avatar_url: string | null;
  verified_aadhaar: boolean;
  created_at: string;
}

interface UserProfileModalProps {
  userId: string;
  roleLabel: string;
  reviewRole: FeedbackRole;
  canReview: boolean;
  onClose: () => void;
}

export default function UserProfileModal({ userId, roleLabel, reviewRole, canReview, onClose }: UserProfileModalProps) {
  useDismissableLayer(onClose);
  const { user: currentUser } = useAuth();
  const [profile, setProfile] = useState<BasicProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [alreadyReviewed, setAlreadyReviewed] = useState(false);
  const [checkingReviewed, setCheckingReviewed] = useState(true);
  const [reviewOpen, setReviewOpen] = useState(false);
  const { reviews, loading: reviewsLoading, refresh: refreshReviews } = useSubjectReviews(userId);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      setLoadingProfile(false);
      return;
    }
    supabase
      .from('users_public')
      .select('name, avatar_url, verified_aadhaar, created_at')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data }) => {
        setProfile(data as BasicProfile | null);
        setLoadingProfile(false);
      });
  }, [userId]);

  useEffect(() => {
    if (!currentUser) {
      setCheckingReviewed(false);
      return;
    }
    hasReviewed(currentUser.id, userId).then((result) => {
      setAlreadyReviewed(result);
      setCheckingReviewed(false);
    });
  }, [currentUser, userId]);

  const avgRating = reviews.length > 0 ? reviews.reduce((s, r) => s + r.overall_rating, 0) / reviews.length : 0;
  const initials = (profile?.name ?? '?').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-black/5 flex items-start justify-between">
          {loadingProfile ? (
            <p className="text-sm text-charcoal/40">Loading profile…</p>
          ) : profile ? (
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-amber-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt={profile.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xl font-bold text-amber-600">{initials}</span>
                )}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-bold text-charcoal">{profile.name}</h2>
                  {profile.verified_aadhaar && (
                    <span className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-600">
                      <i className="ri-shield-check-fill text-sm" /> Verified
                    </span>
                  )}
                </div>
                <p className="text-xs text-charcoal/60 mt-0.5">{roleLabel}</p>
                <p className="text-xs text-charcoal/40 mt-0.5">
                  Member since {new Date(profile.created_at).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-charcoal/40">Profile not found.</p>
          )}
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-lightgray transition-colors cursor-pointer flex-shrink-0">
            <i className="ri-close-line text-charcoal/60" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {reviews.length > 0 && (
            <div className="flex items-center gap-3 bg-amber-50 rounded-xl p-4">
              <span className="text-2xl font-bold text-charcoal">{avgRating.toFixed(1)}</span>
              <div>
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <i key={n} className={`text-sm ${n <= Math.round(avgRating) ? 'ri-star-fill text-amber-400' : 'ri-star-line text-charcoal/30'}`} />
                  ))}
                </div>
                <p className="text-xs text-charcoal/60 mt-0.5">{reviews.length} review{reviews.length !== 1 ? 's' : ''}</p>
              </div>
            </div>
          )}

          {canReview && (
            <div>
              {checkingReviewed ? null : alreadyReviewed ? (
                <div className="flex items-center gap-2 text-xs text-charcoal/60 bg-lightgray rounded-xl px-4 py-3">
                  <i className="ri-checkbox-circle-line text-emerald-500" />
                  You've already reviewed this person.
                </div>
              ) : (
                <button
                  onClick={() => setReviewOpen(true)}
                  className="w-full flex items-center justify-center gap-2 bg-amber-500 text-white text-sm font-semibold px-4 py-2.5 rounded-full hover:bg-amber-600 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-star-line" /> Write a Review
                </button>
              )}
            </div>
          )}

          <div>
            <h3 className="text-sm font-bold text-charcoal mb-3">Reviews</h3>
            {reviewsLoading ? (
              <p className="text-xs text-charcoal/40">Loading reviews…</p>
            ) : reviews.length === 0 ? (
              <p className="text-xs text-charcoal/40">No reviews yet.</p>
            ) : (
              <div className="space-y-3">
                {reviews.map((r) => (
                  <div key={r.id} className="border border-black/5 rounded-xl p-4">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <p className="text-sm font-semibold text-charcoal">{r.reviewer_name}</p>
                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <i key={n} className={`text-xs ${n <= r.overall_rating ? 'ri-star-fill text-amber-400' : 'ri-star-line text-charcoal/30'}`} />
                        ))}
                      </div>
                    </div>
                    {r.comment && <p className="text-xs text-charcoal/70 leading-relaxed">{r.comment}</p>}
                    <p className="text-[10px] text-charcoal/40 mt-2">
                      {new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {reviewOpen && profile && (
        <FeedbackModal
          role={reviewRole}
          lockedSubject={{ id: userId, name: profile.name }}
          onClose={() => setReviewOpen(false)}
          onSubmit={() => {
            setReviewOpen(false);
            setAlreadyReviewed(true);
            refreshReviews();
          }}
        />
      )}
    </div>
  );
}

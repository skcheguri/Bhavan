import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useReviewerReviews, hasReviewed } from '@/hooks/useReviews';
import { useTenantEligibleOwners } from '@/hooks/useReviewEligibility';
import StarRating from '@/pages/feedback/components/StarRating';
import FeedbackModal from '@/pages/feedback/components/FeedbackModal';

function initialsOf(name: string) {
  return name.trim().split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
}

export default function MyReviewsTab() {
  const { user } = useAuth();
  const { reviews, loading, refresh } = useReviewerReviews(user?.id);
  const { contacts: eligibleOwners, loading: contactsLoading } = useTenantEligibleOwners(user?.id);

  const [reviewedIds, setReviewedIds] = useState<Set<string>>(new Set());
  const [checkingReviewed, setCheckingReviewed] = useState(true);
  const [reviewTarget, setReviewTarget] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (!user?.id || eligibleOwners.length === 0) {
      setCheckingReviewed(false);
      return;
    }
    let cancelled = false;
    setCheckingReviewed(true);
    Promise.all(eligibleOwners.map((o) => hasReviewed(user.id, o.id).then((done) => [o.id, done] as const))).then((results) => {
      if (cancelled) return;
      setReviewedIds(new Set(results.filter(([, done]) => done).map(([id]) => id)));
      setCheckingReviewed(false);
    });
    return () => { cancelled = true; };
  }, [user?.id, eligibleOwners]);

  const unreviewedOwners = eligibleOwners.filter((o) => !reviewedIds.has(o.id));

  return (
    <div className="space-y-6">
      {/* Owners you can review */}
      {!contactsLoading && !checkingReviewed && unreviewedOwners.length > 0 && (
        <div className="bg-white rounded-3xl border border-black/5 p-6">
          <h2 className="text-base font-bold text-charcoal mb-1">Owners you can review</h2>
          <p className="text-sm text-charcoal/60 mb-4">Approved connections you haven't reviewed yet</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {unreviewedOwners.map((owner) => (
              <div key={owner.id} className="flex items-center gap-3 p-3 bg-offwhite rounded-xl">
                <div className="w-10 h-10 rounded-full bg-brand/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {owner.avatar ? (
                    <img src={owner.avatar} alt={owner.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-sm font-bold text-brand">{initialsOf(owner.name)}</span>
                  )}
                </div>
                <p className="text-sm font-semibold text-charcoal flex-1 min-w-0 truncate">{owner.name}</p>
                <button
                  onClick={() => setReviewTarget({ id: owner.id, name: owner.name })}
                  className="flex-shrink-0 px-3 py-1.5 rounded-full bg-brand text-white text-xs font-semibold hover:bg-brand-dark transition-colors cursor-pointer whitespace-nowrap"
                >
                  Write Review
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reviews written */}
      <div>
        <h2 className="text-base font-bold text-charcoal mb-1">My Reviews</h2>
        <p className="text-sm text-charcoal/60 mb-4">Reviews you've written about property owners</p>

        {loading ? (
          <div className="bg-white rounded-3xl border border-black/5 p-12 text-center text-sm text-charcoal/40">
            Loading your reviews…
          </div>
        ) : reviews.length === 0 ? (
          <div className="bg-white rounded-3xl border border-black/5 p-12 text-center">
            <div className="w-14 h-14 flex items-center justify-center mx-auto mb-4 bg-amber-50 rounded-full">
              <i className="ri-star-line text-2xl text-amber-500" />
            </div>
            <h3 className="text-base font-bold text-charcoal mb-2">No reviews yet</h3>
            <p className="text-sm text-charcoal/60">
              {eligibleOwners.length === 0
                ? 'Once an owner approves your connection, you can review them here.'
                : 'Write a review for one of the owners above.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {reviews.map((r) => (
              <div key={r.id} className="bg-white rounded-3xl border border-black/5 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-brand/10 flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {r.subject_avatar ? (
                        <img src={r.subject_avatar} alt={r.subject_name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-sm font-bold text-brand">{initialsOf(r.subject_name)}</span>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-charcoal">{r.subject_name}</p>
                      <p className="text-xs text-charcoal/40">{new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                    </div>
                  </div>
                  <StarRating value={r.overall_rating} readonly size="sm" />
                </div>
                {r.comment && <p className="text-sm text-charcoal/70 leading-relaxed mt-3">{r.comment}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {reviewTarget && (
        <FeedbackModal
          role="renter_on_owner"
          lockedSubject={reviewTarget}
          onClose={() => setReviewTarget(null)}
          onSubmit={() => { setReviewTarget(null); refresh(); }}
        />
      )}
    </div>
  );
}

import { useDismissableLayer } from '@/hooks/useDismissableLayer';
import { useEffect, useMemo, useState } from 'react';
import { getSupabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { useSubjectReviews, useReviewableTenancies, type FeedbackRole } from '@/hooks/useReviews';
import FeedbackModal from '@/pages/feedback/components/FeedbackModal';
import { useIsBlocked, useLiveTenancyWith, blockUser, unblockUser } from '@/hooks/useBlocks';
import { ConfirmInline } from '@/components/feature/ConfirmInline';
import { useToast } from '@/hooks/useToast';

interface BasicProfile {
  name: string;
  avatar_url: string | null;
  verified_aadhaar: boolean;
  created_at: string;
}

interface UserProfileModalProps {
  userId: string;
  roleLabel: string;
  /**
   * Only meaningful when `canReview` -- and then only as a fallback,
   * since the tenancy the reviewer picks decides the real side. Omitted
   * where the two people have no landlord/renter relationship at all,
   * such as two owners in the same society.
   */
  reviewRole?: FeedbackRole;
  canReview: boolean;
  onClose: () => void;
}

export default function UserProfileModal({ userId, roleLabel, reviewRole = 'renter_on_owner', canReview, onClose }: UserProfileModalProps) {
  useDismissableLayer(onClose);
  const { user: currentUser } = useAuth();
  const { addToast } = useToast();
  const [profile, setProfile] = useState<BasicProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [confirmingBlock, setConfirmingBlock] = useState(false);
  const [blockBusy, setBlockBusy] = useState(false);
  const { reviews, loading: reviewsLoading, refresh: refreshReviews } = useSubjectReviews(userId);
  const { blocked, refresh: refreshBlocked } = useIsBlocked(userId);
  const liveTenancy = useLiveTenancyWith(userId, currentUser?.id);

  // Reviewing from a profile used to mean "you two have an approved
  // connection, so type a property name" -- which let the same person be
  // reviewed over and over, each review naming a flat nothing checked.
  // The tenancies shared with this particular person are the same list
  // /feedback offers, narrowed to them.
  const { tenancies, loading: tenanciesLoading, refresh: refreshTenancies } =
    useReviewableTenancies(currentUser?.id);
  const shared = useMemo(
    () => tenancies.filter((t) => t.subjectId === userId),
    [tenancies, userId]
  );
  const unreviewed = shared.filter((t) => !t.alreadyReviewed);

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
              {tenanciesLoading ? null : shared.length === 0 ? (
                // Offering the button here would have sent them into a
                // form the database was always going to refuse, since a
                // review needs a rental agreement behind it.
                <div className="flex items-start gap-2 text-xs text-charcoal/60 bg-lightgray rounded-xl px-4 py-3">
                  <i className="ri-information-line text-charcoal/40 mt-px" />
                  <span>You can review this person once you have a rental agreement with them on Bhavan.</span>
                </div>
              ) : unreviewed.length === 0 ? (
                <div className="flex items-start gap-2 text-xs text-charcoal/60 bg-lightgray rounded-xl px-4 py-3">
                  <i className="ri-checkbox-circle-line text-emerald-500 mt-px" />
                  <span>
                    You&apos;ve reviewed {shared.length === 1 ? 'your tenancy' : 'every tenancy'} with this person.
                  </span>
                </div>
              ) : (
                <button
                  onClick={() => setReviewOpen(true)}
                  className="w-full flex items-center justify-center gap-2 bg-amber-500 text-white text-sm font-semibold px-4 py-2.5 rounded-full hover:bg-amber-600 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-star-line" />
                  Write a Review
                  {shared.length > 1 && (
                    <span className="text-white/70 font-normal">
                      ({unreviewed.length} of {shared.length} tenancies)
                    </span>
                  )}
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

          {/* Understated, at the bottom, below everything useful -- the
              same treatment the society danger zone gets. */}
          {currentUser && currentUser.id !== userId && (
            <div className="pt-4 border-t border-black/5">
              {blocked ? (
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-xs text-charcoal/60">
                    <i className="ri-forbid-line mr-1" />
                    You blocked {profile?.name ?? 'this person'}. Neither of you can start an
                    enquiry or send messages.
                  </p>
                  <button
                    onClick={async () => {
                      setBlockBusy(true);
                      const { error } = await unblockUser(currentUser.id, userId);
                      setBlockBusy(false);
                      if (error) addToast(error, 'error');
                      else {
                        addToast('Unblocked.', 'success');
                        await refreshBlocked();
                      }
                    }}
                    disabled={blockBusy}
                    className="text-xs font-semibold text-charcoal/60 hover:text-charcoal disabled:opacity-40"
                  >
                    Unblock
                  </button>
                </div>
              ) : confirmingBlock ? (
                <ConfirmInline
                  message={
                    `Block ${profile?.name ?? 'this person'}? Neither of you will be able to start an enquiry or send messages. Anything already sent stays readable, and you can undo this whenever you like.` +
                    // Not a reason to forbid it -- someone who needs to
                    // cut contact with their landlord is often exactly
                    // the person who most needs to -- but they should
                    // know they are closing the channel rent and repairs
                    // are arranged through.
                    (liveTenancy
                      ? ' You have a tenancy with them that has not ended: rent reminders and maintenance messages go through this channel, so you will need another way to reach each other.'
                      : '')
                  }
                  confirmLabel="Block"
                  busy={blockBusy}
                  onConfirm={async () => {
                    setBlockBusy(true);
                    const { error } = await blockUser(currentUser.id, userId);
                    setBlockBusy(false);
                    setConfirmingBlock(false);
                    if (error) addToast(error, 'error');
                    else {
                      addToast(`${profile?.name ?? 'They'} can no longer contact you.`, 'success');
                      await refreshBlocked();
                    }
                  }}
                  onCancel={() => setConfirmingBlock(false)}
                />
              ) : (
                <button
                  onClick={() => setConfirmingBlock(true)}
                  className="text-xs text-gray-400 hover:text-red-600"
                >
                  Block this person
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {reviewOpen && profile && (
        <FeedbackModal
          role={reviewRole}
          tenancies={shared}
          onClose={() => { setReviewOpen(false); void refreshTenancies(); }}
          onSubmit={() => {
            setReviewOpen(false);
            refreshReviews();
            // Same reason as on /feedback: without this the tenancy just
            // reviewed is still on offer, and the second attempt meets
            // the one-per-tenancy index instead of "already reviewed".
            void refreshTenancies();
          }}
        />
      )}
    </div>
  );
}

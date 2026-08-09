import { useDismissableLayer } from '@/hooks/useDismissableLayer';
import { useState, useEffect, useCallback } from 'react';
import { ownerOnRenterQuestions, renterOnOwnerQuestions } from '@/lib/content/feedbackQuestions';
import StarRating from './StarRating';
import {
  createReview,
  updateReview,
  type FeedbackRole,
  type ReviewableTenancy,
  type ReviewFromDB,
} from '@/hooks/useReviews';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';

interface FeedbackModalProps {
  role: FeedbackRole;
  onClose: () => void;
  onSubmit: () => void;
  // When set, this review is tied to a real connected account (opened from
  // a profile view reachable only via an approved connection) instead of
  // the generic public /feedback page's free-text name entry.
  lockedSubject?: { id: string; name: string };
  /**
   * The signed-in user's real tenancies. When supplied, the reviewer
   * picks one instead of typing a name, a property and a period that
   * nothing checks -- and their side of that agreement decides the
   * role, so a tenant cannot file a review as an owner.
   */
  tenancies?: ReviewableTenancy[];
  /**
   * An existing review being corrected inside its one-hour window. The
   * tenancy is already settled, so the picker is skipped -- only the
   * verdict is up for revision.
   */
  editing?: ReviewFromDB;
}

export default function FeedbackModal({ role, onClose, onSubmit, lockedSubject, tenancies, editing }: FeedbackModalProps) {
  useDismissableLayer(onClose);
  const { user } = useAuth();
  const { addToast } = useToast();
  // Editing skips the picker: the tenancy is already decided and pinned
  // server-side, so there is nothing to choose on step one.
  const [step, setStep] = useState<'info' | 'questionnaire' | 'rating' | 'done'>(
    editing ? 'questionnaire' : 'info'
  );
  const [tenancyId, setTenancyId] = useState<string>('');
  const chosen = tenancies?.find((t) => t.agreementId === tenancyId) ?? null;

  // Which side of the agreement the reviewer is on decides the role,
  // and the role decides which questionnaire they answer. The `role`
  // prop is only the fallback for the profile-view path, where the
  // caller already knows.
  const effectiveRole: FeedbackRole = editing?.role ?? chosen?.role ?? role;
  const isOwner = effectiveRole === 'owner_on_renter';
  const questions = isOwner ? ownerOnRenterQuestions : renterOnOwnerQuestions;

  const [subjectName, setSubjectName] = useState(lockedSubject?.name ?? '');
  const [property, setProperty] = useState('');
  const [period, setPeriod] = useState('');
  // Stored answers are keyed by the question's wording, not its id, so an
  // edit has to match them back up by label. A question that has since
  // been reworded simply comes back unanswered rather than mismatched.
  const blankOrExisting = useCallback(
    (qs: typeof questions) =>
      Object.fromEntries(
        qs.map((q) => [q.id, editing?.answers.find((a) => a.question === q.label)?.value ?? null])
      ),
    [editing]
  );

  const [answers, setAnswers] = useState<Record<string, boolean | null>>(() =>
    blankOrExisting(questions)
  );
  const [comment, setComment] = useState(editing?.comment ?? '');
  const [submitting, setSubmitting] = useState(false);

  // Picking a tenancy on the other side of the relationship swaps the
  // questionnaire, so answers keyed to the old questions have to go --
  // otherwise a half-filled owner questionnaire counts toward a tenant's
  // rating.
  useEffect(() => {
    // `questions` is one of two module-level constants and
    // `blankOrExisting` is keyed to a prop that does not change for the
    // life of the modal, so this cannot loop.
    setAnswers(blankOrExisting(questions));
  }, [questions, blankOrExisting]);

  const calculateAutoRating = (role: FeedbackRole, ans: Record<string, boolean | null>) => {
    const qs = role === 'owner_on_renter' ? ownerOnRenterQuestions : renterOnOwnerQuestions;
    const total = qs.length;
    const positive = qs.reduce((acc, q) => {
      const val = ans[q.id];
      if (val === null) return acc;
      const isGood = q.negative ? !val : val;
      return acc + (isGood ? 1 : 0);
    }, 0);
    return Math.max(1, Math.round((positive / total) * 5));
  };

  const satisfiedCount = questions.reduce((acc, q) => {
    const val = answers[q.id];
    if (val === null) return acc;
    const isGood = q.negative ? !val : val;
    return acc + (isGood ? 1 : 0);
  }, 0);

  const autoRating = calculateAutoRating(effectiveRole, answers);

  const handleAnswer = (id: string, val: boolean) => {
    setAnswers((prev) => ({ ...prev, [id]: val }));
  };

  const stepOrder: string[] = editing
    ? ['questionnaire', 'rating']
    : ['info', 'questionnaire', 'rating'];

  const allAnswered = Object.values(answers).every((v) => v !== null);
  const infoValid = tenancies
    ? Boolean(chosen)
    : Boolean(subjectName.trim() && property.trim() && period.trim());

  const handleSubmit = async () => {
    if (!user) {
      addToast('Please sign in to submit a review', 'error');
      return;
    }
    // Reviews must name a real account (NOT NULL subject_id + the
    // relationship-scoped RLS from migration-era task "restrict reviews
    // to actual tenant-owner relationships"). Without a locked subject
    // there is nobody to attach the review to.
    if (editing) {
      setSubmitting(true);
      const { error: editError } = await updateReview(editing.id, {
        overall_rating: autoRating,
        answers: questions.map((q) => ({ question: q.label, value: answers[q.id] })),
        comment,
      });
      setSubmitting(false);
      if (editError) {
        addToast(editError, 'error');
        return;
      }
      setStep('done');
      return;
    }
    if (!chosen && !lockedSubject?.id) {
      addToast('Reviews can only be written about someone you have an actual rental relationship with — open this from your Inquiries or My Reviews tab.', 'error');
      return;
    }
    setSubmitting(true);
    const { error } = await createReview({
      reviewer_id: user.id,
      subject_id: chosen ? chosen.subjectId : lockedSubject.id,
      agreement_id: chosen?.agreementId ?? null,
      role: effectiveRole,
      property_name: chosen ? chosen.propertyName : property,
      tenancy_period: chosen ? chosen.tenancyPeriod : period,
      overall_rating: autoRating,
      answers: questions.map((q) => ({ question: q.label, value: answers[q.id] })),
      comment,
    });
    setSubmitting(false);
    if (error) {
      addToast(`Failed to submit review: ${error}`, 'error');
      return;
    }
    setStep('done');
  };

  if (step === 'done') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
        <div className="bg-white rounded-2xl p-10 max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
            <i className="ri-check-double-line text-emerald-500 text-3xl" />
          </div>
          <h3 className="mt-5 text-xl font-bold text-charcoal">
            {editing ? 'Review Updated' : 'Feedback Submitted!'}
          </h3>
          <p className="mt-2 text-sm text-charcoal/60">
            {editing
              ? 'Your changes have been saved.'
              : 'Your review has been recorded. It helps build a trustworthy rental community.'}
          </p>
          <button
            type="button"
            onClick={onSubmit}
            className="mt-6 bg-brand text-white font-medium px-8 py-3 rounded-full hover:bg-brand-dark transition-colors whitespace-nowrap cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className={`px-6 py-5 border-b flex items-center justify-between ${isOwner ? 'bg-brand/5' : 'bg-teal-50'}`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isOwner ? 'bg-brand/20' : 'bg-teal-100'}`}>
              <i className={`${isOwner ? 'ri-home-4-line text-brand' : 'ri-user-line text-teal-600'} text-lg`} />
            </div>
            <div>
              <h2 className="font-bold text-charcoal text-base">
                {editing
                  ? 'Edit your review'
                  : tenancies && !chosen
                    ? 'Write a review'
                    : isOwner
                      ? 'Review Your Tenant'
                      : 'Review Your Owner'}
              </h2>
              <p className="text-xs text-charcoal/60">
                {editing
                  ? `${editing.subject_name} · ${editing.property}`
                  : tenancies && !chosen
                    ? 'Pick the tenancy you want to review'
                    : isOwner
                      ? 'Help future landlords make informed decisions'
                      : 'Help future tenants find trustworthy owners'}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-lightgray cursor-pointer">
            <i className="ri-close-line text-charcoal/60 text-lg" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="px-6 pt-5">
          <div className="flex items-center gap-2">
            {stepOrder.map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  step === s ? (isOwner ? 'bg-brand text-white' : 'bg-teal-500 text-white')
                  : stepOrder.indexOf(step) > i ? 'bg-emerald-500 text-white' : 'bg-lightgray text-charcoal/40'
                }`}>
                  {stepOrder.indexOf(step) > i ? <i className="ri-check-line" /> : i + 1}
                </div>
                <span className="text-xs text-charcoal/60 hidden sm:block">
                  {s === 'info' ? 'Details' : s === 'questionnaire' ? 'Questionnaire' : 'Rating'}
                </span>
                {i < stepOrder.length - 1 && <div className="w-8 h-px bg-gray-200 mx-1" />}
              </div>
            ))}
          </div>
        </div>

        <div className="px-6 py-5">
          {/* Step 1: Basic Info */}
          {step === 'info' && (
            <div className="space-y-4">
              <h3 className="font-semibold text-charcoal">
                {tenancies ? 'Which tenancy are you reviewing?' : isOwner ? 'Who are you reviewing?' : 'Which owner are you reviewing?'}
              </h3>

              {tenancies ? (
                tenancies.length === 0 ? (
                  <p className="text-sm text-charcoal/60 leading-relaxed">
                    You can review someone once you have a rental agreement with them on Bhavan.
                    Reviews are tied to a real tenancy, which is what makes them worth reading.
                  </p>
                ) : (
                  <>
                    <div className="space-y-2">
                      {tenancies.map((t) => {
                        const on = t.agreementId === tenancyId;
                        return (
                          <button
                            key={t.agreementId}
                            type="button"
                            disabled={t.alreadyReviewed}
                            onClick={() => setTenancyId(t.agreementId)}
                            className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
                              on
                                ? 'border-brand bg-brand/5'
                                : 'border-black/10 hover:border-brand/40'
                            } ${t.alreadyReviewed ? 'opacity-45 cursor-not-allowed' : 'cursor-pointer'}`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold text-charcoal">{t.subjectName}</span>
                              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-lightgray text-charcoal/60">
                                {t.role === 'owner_on_renter' ? 'Your tenant' : 'Your owner'}
                              </span>
                              {t.alreadyReviewed && (
                                <span className="text-[11px] text-charcoal/40 ml-auto">Already reviewed</span>
                              )}
                            </div>
                            <p className="text-xs text-charcoal/60 mt-1">{t.propertyName}</p>
                            <p className="text-xs text-charcoal/40">{t.tenancyPeriod}</p>
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-xs text-charcoal/40">
                      Taken from your rental agreement, so a review always names a tenancy that
                      actually happened.
                    </p>
                  </>
                )
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-charcoal mb-1.5">
                      {isOwner ? "Tenant's Full Name" : "Owner's Full Name"}
                    </label>
                    {lockedSubject ? (
                      <div className="w-full border border-black/10 rounded-lg px-4 py-2.5 text-sm bg-lightgray text-charcoal flex items-center gap-2">
                        <i className="ri-shield-check-line text-emerald-500" />
                        {lockedSubject.name}
                        <span className="text-xs text-charcoal/40 ml-auto">Verified connection</span>
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={subjectName}
                        onChange={(e) => setSubjectName(e.target.value)}
                        placeholder={isOwner ? 'e.g. Arjun Mehta' : 'e.g. Priya Sharma'}
                        className="w-full border border-black/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-brand"
                      />
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-charcoal mb-1.5">Property Name / Address</label>
                    <input
                      type="text"
                      value={property}
                      onChange={(e) => setProperty(e.target.value)}
                      placeholder="e.g. Sunny 2BHK in Bandra West"
                      className="w-full border border-black/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-brand"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-charcoal mb-1.5">Tenancy Period</label>
                    <input
                      type="text"
                      value={period}
                      onChange={(e) => setPeriod(e.target.value)}
                      placeholder="e.g. Jan 2025 – Mar 2026"
                      className="w-full border border-black/10 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-brand"
                    />
                  </div>
                </>
              )}

              <button
                type="button"
                disabled={!infoValid}
                onClick={() => setStep('questionnaire')}
                className={`w-full py-3 rounded-full font-medium text-sm transition-colors whitespace-nowrap cursor-pointer ${
                  infoValid ? (isOwner ? 'bg-brand text-white hover:bg-brand-dark' : 'bg-teal-500 text-white hover:bg-teal-600') : 'bg-lightgray text-charcoal/40 cursor-not-allowed'
                }`}
              >
                Continue to Questionnaire
              </button>
            </div>
          )}

          {/* Step 2: Questionnaire */}
          {step === 'questionnaire' && (
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-charcoal">Answer the questionnaire</h3>
                <p className="text-xs text-charcoal/60 mt-1">Be honest — your answers help the community make better decisions</p>
              </div>
              <div className="space-y-3">
                {questions.map((q) => (
                  <div key={q.id} className="border border-black/5 rounded-xl p-4">
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-8 h-8 rounded-full bg-lightgray flex items-center justify-center flex-shrink-0">
                        <i className={`${q.icon} text-charcoal/60 text-sm`} />
                      </div>
                      <p className="text-sm font-medium text-charcoal leading-snug pt-1">{q.label}</p>
                    </div>
                    <div className="flex gap-3 ml-11">
                      <button
                        type="button"
                        onClick={() => handleAnswer(q.id, true)}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                          answers[q.id] === true
                            ? 'bg-emerald-500 text-white border-emerald-500'
                            : 'border-black/10 text-charcoal/70 hover:border-emerald-300 hover:bg-emerald-50'
                        }`}
                      >
                        <i className="ri-check-line mr-1.5" />
                        Yes
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAnswer(q.id, false)}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                          answers[q.id] === false
                            ? 'bg-red-500 text-white border-red-500'
                            : 'border-black/10 text-charcoal/70 hover:border-red-300 hover:bg-red-50'
                        }`}
                      >
                        <i className="ri-close-line mr-1.5" />
                        No
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => (editing ? onClose() : setStep('info'))}
                  className="flex-1 py-3 rounded-full font-medium text-sm border border-black/10 text-charcoal/70 hover:bg-lightgray transition-colors cursor-pointer whitespace-nowrap"
                >
                  {editing ? 'Cancel' : 'Back'}
                </button>
                <button
                  type="button"
                  disabled={!allAnswered}
                  onClick={() => setStep('rating')}
                  className={`flex-1 py-3 rounded-full font-medium text-sm transition-colors cursor-pointer whitespace-nowrap ${
                    allAnswered ? (isOwner ? 'bg-brand text-white hover:bg-brand-dark' : 'bg-teal-500 text-white hover:bg-teal-600') : 'bg-lightgray text-charcoal/40 cursor-not-allowed'
                  }`}
                >
                  Continue to Rating
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Rating & Comment */}
          {step === 'rating' && (
            <div className="space-y-5">
              <div>
                <h3 className="font-semibold text-charcoal">Overall Rating</h3>
                <p className="text-xs text-charcoal/60 mt-1">Based on your questionnaire answers</p>
              </div>
              <div className="bg-lightgray rounded-xl p-5 text-center">
                <div className="flex justify-center items-center gap-2">
                  <span className="text-2xl font-bold text-charcoal">{autoRating}</span>
                  <StarRating value={autoRating} readonly size="lg" />
                </div>
                <p className="text-xs text-charcoal/40 mt-2">
                  {satisfiedCount} of {questions.length} criteria satisfied
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">
                  Write a Review <span className="text-charcoal/40 font-normal">(optional)</span>
                </label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value.slice(0, 500))}
                  rows={4}
                  placeholder={isOwner
                    ? 'Share your experience with this tenant — what went well, what could have been better...'
                    : 'Share your experience with this owner — was the property as described, how was communication...'
                  }
                  className="w-full border border-black/10 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-brand resize-none"
                />
                <p className="text-xs text-charcoal/40 text-right mt-1">{comment.length}/500</p>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep('questionnaire')}
                  className="flex-1 py-3 rounded-full font-medium text-sm border border-black/10 text-charcoal/70 hover:bg-lightgray transition-colors cursor-pointer whitespace-nowrap"
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleSubmit}
                  className={`flex-1 py-3 rounded-full font-medium text-sm transition-colors cursor-pointer whitespace-nowrap ${
                    !submitting ? (isOwner ? 'bg-brand text-white hover:bg-brand-dark' : 'bg-teal-500 text-white hover:bg-teal-600') : 'bg-lightgray text-charcoal/40 cursor-not-allowed'
                  }`}
                >
                  {submitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <i className="ri-loader-4-line animate-spin" />
                      {editing ? 'Saving...' : 'Submitting...'}
                    </span>
                  ) : editing ? 'Save Changes' : 'Submit Review'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import type { ReviewFromDB } from '@/hooks/useReviews';
import StarRating from './StarRating';

interface ReviewCardProps {
  entry: ReviewFromDB;
  /**
   * Supplied only for the signed-in user's own reviews that are still
   * inside their edit window. Absent means the review stands as written.
   */
  onEdit?: () => void;
  minutesLeftToEdit?: number;
}

export default function ReviewCard({ entry, onEdit, minutesLeftToEdit }: ReviewCardProps) {
  const [expanded, setExpanded] = useState(false);

  const positiveAnswers = entry.answers.filter((a) => a.value === true);
  const negativeAnswers = entry.answers.filter((a) => a.value === false);

  const isOwnerReview = entry.role === 'owner_on_renter';

  const ratingColors: Record<number, string> = {
    1: 'bg-red-50 border-red-200',
    2: 'bg-orange-50 border-orange-200',
    3: 'bg-yellow-50 border-yellow-200',
    4: 'bg-green-50 border-green-200',
    5: 'bg-emerald-50 border-emerald-200',
  };

  const ratingBadge: Record<number, { label: string; color: string }> = {
    1: { label: 'Poor', color: 'bg-red-100 text-red-700' },
    2: { label: 'Fair', color: 'bg-orange-100 text-orange-700' },
    3: { label: 'Good', color: 'bg-yellow-100 text-yellow-700' },
    4: { label: 'Very Good', color: 'bg-green-100 text-green-700' },
    5: { label: 'Excellent', color: 'bg-emerald-100 text-emerald-700' },
  };

  return (
    <div className={`rounded-2xl border p-6 transition duration-300 ${ratingColors[entry.overall_rating]}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        {/* Reviewer */}
        <div className="flex items-center gap-3 flex-1">
          <div className="relative flex-shrink-0">
            <img
              src={entry.reviewer_avatar}
              alt={entry.reviewer_name}
              className="w-12 h-12 rounded-full object-cover"
            />
            <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center ${isOwnerReview ? 'bg-brand' : 'bg-teal-500'}`}>
              <i className={`${isOwnerReview ? 'ri-home-4-line' : 'ri-user-line'} text-white text-xs`} />
            </div>
          </div>
          <div>
            <p className="font-semibold text-charcoal text-sm">{entry.reviewer_name}</p>
            <p className="text-xs text-charcoal/60">{isOwnerReview ? 'Property Owner' : 'Tenant'}</p>
          </div>
        </div>

        {/* Arrow */}
        <div className="hidden sm:flex items-center justify-center w-8 h-8 flex-shrink-0 mt-2">
          <i className="ri-arrow-right-line text-charcoal/40 text-lg" />
        </div>

        {/* Subject */}
        <div className="flex items-center gap-3 flex-1">
          <img
            src={entry.subject_avatar}
            alt={entry.subject_name}
            className="w-12 h-12 rounded-full object-cover flex-shrink-0"
          />
          <div>
            <p className="font-semibold text-charcoal text-sm">{entry.subject_name}</p>
            <p className="text-xs text-charcoal/60">{isOwnerReview ? 'Tenant' : 'Property Owner'}</p>
          </div>
        </div>

        {/* Rating badge */}
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <StarRating value={entry.overall_rating} readonly size="sm" />
          <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${ratingBadge[entry.overall_rating].color}`}>
            {ratingBadge[entry.overall_rating].label}
          </span>
        </div>
      </div>

      {/* Property info */}
      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-charcoal/60">
        <span className="flex items-center gap-1">
          <i className="ri-home-line" />
          {entry.property}
        </span>
        <span className="flex items-center gap-1">
          <i className="ri-map-pin-line" />
          {entry.location}
        </span>
        <span className="flex items-center gap-1">
          <i className="ri-calendar-line" />
          {entry.tenancy_period}
        </span>
      </div>

      {/* Comment */}
      <p className="mt-4 text-sm text-charcoal/80 leading-relaxed italic">&ldquo;{entry.comment}&rdquo;</p>

      {/* Expand toggle */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="mt-4 flex items-center gap-1.5 text-xs font-medium text-brand hover:text-brand-dark transition-colors cursor-pointer"
      >
        <i className={`ri-${expanded ? 'subtract' : 'add'}-circle-line`} />
        {expanded ? 'Hide questionnaire answers' : 'View questionnaire answers'}
      </button>

      {/* Questionnaire answers */}
      {expanded && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
          {entry.answers.map((ans, idx) => (
            <div
              key={idx}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium ${
                ans.value
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-red-50 text-red-600 border border-red-200'
              }`}
            >
              <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                <i className={ans.value ? 'ri-checkbox-circle-fill text-emerald-500' : 'ri-close-circle-fill text-red-400'} />
              </div>
              <span>{ans.question}</span>
            </div>
          ))}
        </div>
      )}

      {/* Summary chips */}
      {!expanded && (
        <div className="mt-3 flex flex-wrap gap-2">
          {positiveAnswers.slice(0, 3).map((a, i) => (
            <span key={i} className="flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full">
              <i className="ri-check-line text-emerald-500" />
              {a.question}
            </span>
          ))}
          {negativeAnswers.length > 0 && (
            <span className="flex items-center gap-1 text-xs bg-red-50 text-red-600 border border-red-200 px-2.5 py-1 rounded-full">
              <i className="ri-close-line text-red-400" />
              {negativeAnswers.length} concern{negativeAnswers.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
      )}

      {/* Date */}
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="text-xs text-charcoal/40">
          Reviewed on {new Date(entry.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
          {/* A review people may already have read, then changed, says so
              -- otherwise the date above quietly vouches for wording that
              was not there when it was written. */}
          {entry.edited_at && ' · edited'}
        </p>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="ml-auto flex items-center gap-1.5 text-xs font-medium text-brand hover:text-brand-dark transition-colors cursor-pointer"
          >
            <i className="ri-pencil-line" />
            Edit
            {typeof minutesLeftToEdit === 'number' && (
              <span className="text-charcoal/40 font-normal">
                ({minutesLeftToEdit < 1 ? 'under a minute' : `${minutesLeftToEdit} min`} left)
              </span>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

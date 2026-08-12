import { useState, useMemo, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  useReviews,
  useReviewableTenancies,
  editWindowClosesAt,
  type ReviewFromDB,
} from '@/hooks/useReviews';
import { useAuth } from '@/hooks/useAuth';
import ReviewCard from './components/ReviewCard';
import FeedbackModal from './components/FeedbackModal';
import StarRating from './components/StarRating';

type Tab = 'owner_on_renter' | 'renter_on_owner';
type SortOption = 'newest' | 'highest' | 'lowest';

export default function FeedbackPage() {
  // A review notification names the tab its review is on. Validated
  // rather than trusted: an unknown value falls back to the default
  // rather than filtering the list down to nothing.
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<Tab>(
    tabParam === 'renter_on_owner' || tabParam === 'owner_on_renter' ? tabParam : 'owner_on_renter'
  );
  const [sort, setSort] = useState<SortOption>('newest');
  const [filterRating, setFilterRating] = useState<number>(0);
  const [modalRole, setModalRole] = useState<Tab | null>(null);
  const { user } = useAuth();
  // The reviewer's own tenancies. Which one they pick decides who is
  // being reviewed and from which side -- the browse tabs above only
  // filter what is on screen.
  const { tenancies, refresh: refreshTenancies } = useReviewableTenancies(user?.id);
  const { reviews: entries, loading, refresh } = useReviews();
  const [editingReview, setEditingReview] = useState<ReviewFromDB | null>(null);

  // The edit window closes while the page is open, so the button has to
  // go on its own rather than waiting for a reload to withdraw an offer
  // the server would refuse.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const filtered = useMemo(() => {
    let list = entries.filter((e) => e.role === activeTab);
    if (filterRating > 0) list = list.filter((e) => e.overall_rating === filterRating);
    if (sort === 'newest') list = [...list].sort((a, b) => b.created_at.localeCompare(a.created_at));
    if (sort === 'highest') list = [...list].sort((a, b) => b.overall_rating - a.overall_rating);
    if (sort === 'lowest') list = [...list].sort((a, b) => a.overall_rating - b.overall_rating);
    return list;
  }, [entries, activeTab, sort, filterRating]);

  const allForTab = entries.filter((e) => e.role === activeTab);
  const avgRating = allForTab.length
    ? allForTab.reduce((sum, e) => sum + e.overall_rating, 0) / allForTab.length
    : 0;

  const ratingDist = [5, 4, 3, 2, 1].map((r) => ({
    star: r,
    count: allForTab.filter((e) => e.overall_rating === r).length,
    pct: allForTab.length ? (allForTab.filter((e) => e.overall_rating === r).length / allForTab.length) * 100 : 0,
  }));

  const handleModalSubmit = () => {
    setModalRole(null);
    refresh();
    // Without this the picker still offers the tenancy that was just
    // reviewed -- it was loaded before the review existed. Reopening it
    // and submitting again hits reviews_one_per_tenancy, so the reviewer
    // meets a database error where they should have seen "Already
    // reviewed" and an Edit button.
    void refreshTenancies();
  };

  return (
    <div className="min-h-screen bg-offwhite">
      {/* Hero */}
      <section className="relative pt-8 pb-16 md:pt-12 md:pb-20 overflow-hidden">
        {/* Intentional brand gradient rather than a placeholder stock
            photo -- nothing here pretends to be a real image. */}
        <div className="absolute inset-0 bg-gradient-to-br from-charcoal via-charcoal to-brand-dark" />
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_20%_20%,white,transparent_45%)]" />
        <div className="relative z-10 w-full px-4 md:px-8 lg:px-12">
          <div className="max-w-2xl">
            <span className="inline-block px-4 py-1.5 bg-brand/80 text-white text-xs font-semibold rounded-full uppercase tracking-wide mb-4">
              Mutual Feedback System
            </span>
            <h1 className="text-3xl md:text-5xl font-bold text-white leading-tight">
              Build Trust Through<br />Honest Reviews
            </h1>
            <p className="mt-4 text-white/85 text-base md:text-lg leading-relaxed max-w-xl">
              Owners review tenants. Tenants review owners. A transparent, questionnaire-based system that helps everyone make better rental decisions.
            </p>
            {/* One way in. Which side you are reviewing from is a fact of
                the tenancy you pick inside, not a button you press out
                here -- offering "Review a Tenant" to a tenant was how a
                renter could file a review as though they were the owner. */}
            <div className="mt-8">
              <button
                type="button"
                onClick={() => setModalRole('renter_on_owner')}
                className="bg-brand text-white font-medium px-7 py-3.5 rounded-full hover:bg-brand-dark transition-colors whitespace-nowrap cursor-pointer"
              >
                <i className="ri-star-line mr-2" />
                Write a review
              </button>
            </div>
          </div>
        </div>
      </section>

      <div className="w-full px-4 md:px-8 lg:px-12 py-12">
        <div className="max-w-6xl mx-auto">
          {/* Tab switcher */}
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between mb-8">
            <div className="inline-flex bg-white border border-black/10 rounded-full p-1">
              <button
                type="button"
                onClick={() => { setActiveTab('owner_on_renter'); setFilterRating(0); }}
                className={`px-5 py-2 rounded-full text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  activeTab === 'owner_on_renter' ? 'bg-brand text-white' : 'text-charcoal/70 hover:text-charcoal'
                }`}
              >
                <i className="ri-home-4-line mr-1.5" />
                Owner on Tenant
              </button>
              <button
                type="button"
                onClick={() => { setActiveTab('renter_on_owner'); setFilterRating(0); }}
                className={`px-5 py-2 rounded-full text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  activeTab === 'renter_on_owner' ? 'bg-teal-500 text-white' : 'text-charcoal/70 hover:text-charcoal'
                }`}
              >
                <i className="ri-user-line mr-1.5" />
                Tenant on Owner
              </button>
            </div>

            <button
              type="button"
              onClick={() => setModalRole(activeTab)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'owner_on_renter'
                  ? 'bg-brand text-white hover:bg-brand-dark'
                  : 'bg-teal-500 text-white hover:bg-teal-600'
              }`}
            >
              <i className="ri-add-line" />
              Write a Review
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* Sidebar */}
            <div className="lg:col-span-1 space-y-5">
              {/* Rating summary */}
              <div className="bg-white rounded-3xl border border-black/5 p-5">
                <h3 className="font-semibold text-charcoal text-sm mb-4">
                  {activeTab === 'owner_on_renter' ? 'Tenant Ratings' : 'Owner Ratings'}
                </h3>
                <div className="text-center mb-4">
                  <div className="text-5xl font-bold text-charcoal">{avgRating.toFixed(1)}</div>
                  <div className="flex justify-center mt-2">
                    <StarRating value={Math.round(avgRating)} readonly size="sm" />
                  </div>
                  <p className="text-xs text-charcoal/60 mt-1">{allForTab.length} review{allForTab.length !== 1 ? 's' : ''}</p>
                </div>
                <div className="space-y-2">
                  {ratingDist.map((r) => (
                    <button
                      key={r.star}
                      type="button"
                      onClick={() => setFilterRating(filterRating === r.star ? 0 : r.star)}
                      className={`w-full flex items-center gap-2 group cursor-pointer rounded-lg px-2 py-1 transition-colors ${filterRating === r.star ? 'bg-amber-50' : 'hover:bg-lightgray'}`}
                    >
                      <span className="text-xs text-charcoal/60 w-3">{r.star}</span>
                      <i className="ri-star-fill text-amber-400 text-xs" />
                      <div className="flex-1 h-1.5 bg-lightgray rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-400 rounded-full transition duration-500"
                          style={{ width: `${r.pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-charcoal/40 w-4 text-right">{r.count}</span>
                    </button>
                  ))}
                </div>
                {filterRating > 0 && (
                  <button
                    type="button"
                    onClick={() => setFilterRating(0)}
                    className="mt-3 w-full text-xs text-brand font-medium hover:underline cursor-pointer"
                  >
                    Clear filter
                  </button>
                )}
              </div>

              {/* Sort */}
              <div className="bg-white rounded-3xl border border-black/5 p-5">
                <h3 className="font-semibold text-charcoal text-sm mb-3">Sort By</h3>
                <div className="space-y-2">
                  {([
                    { val: 'newest', label: 'Most Recent', icon: 'ri-time-line' },
                    { val: 'highest', label: 'Highest Rated', icon: 'ri-arrow-up-line' },
                    { val: 'lowest', label: 'Lowest Rated', icon: 'ri-arrow-down-line' },
                  ] as { val: SortOption; label: string; icon: string }[]).map((opt) => (
                    <button
                      key={opt.val}
                      type="button"
                      onClick={() => setSort(opt.val)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer ${
                        sort === opt.val ? 'bg-brand/10 text-brand font-medium' : 'text-charcoal/70 hover:bg-lightgray'
                      }`}
                    >
                      <i className={opt.icon} />
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* How it works */}
              <div className="bg-white rounded-3xl border border-black/5 p-5">
                <h3 className="font-semibold text-charcoal text-sm mb-3">How It Works</h3>
                <div className="space-y-3">
                  {[
                    { icon: 'ri-questionnaire-line', text: 'Answer a structured questionnaire about your experience' },
                    { icon: 'ri-star-line', text: 'Give an overall 1–5 star rating' },
                    { icon: 'ri-chat-quote-line', text: 'Add an optional written comment' },
                    { icon: 'ri-shield-check-line', text: 'Reviews are visible to the community' },
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <div className="w-6 h-6 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <i className={`${item.icon} text-brand text-sm`} />
                      </div>
                      <p className="text-xs text-charcoal/70 leading-relaxed">{item.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Reviews list */}
            <div className="lg:col-span-3">
              {loading ? (
                <div className="bg-white rounded-3xl border border-black/5 p-12 text-center text-sm text-charcoal/40">
                  Loading reviews…
                </div>
              ) : !user ? (
                // Reviews name real people and real addresses, so reading
                // them requires signing in (migration 118) -- without this
                // branch a visitor would see "No reviews found", which
                // reads as an empty product rather than a closed door.
                <div className="bg-white rounded-3xl border border-black/5 p-12 text-center">
                  <div className="w-14 h-14 rounded-full bg-lightgray flex items-center justify-center mx-auto">
                    <i className="ri-lock-line text-charcoal/30 text-2xl" />
                  </div>
                  <p className="mt-4 text-charcoal/60 text-sm max-w-sm mx-auto">
                    Reviews mention real people and properties, so they&apos;re only visible to signed-in members.
                  </p>
                  <Link
                    to="/login"
                    className="inline-block mt-5 bg-brand text-white text-sm font-medium px-6 py-2.5 rounded-full hover:bg-brand-dark transition-colors whitespace-nowrap"
                  >
                    Sign in to read reviews
                  </Link>
                </div>
              ) : filtered.length === 0 ? (
                <div className="bg-white rounded-3xl border border-black/5 p-12 text-center">
                  <div className="w-14 h-14 rounded-full bg-lightgray flex items-center justify-center mx-auto">
                    <i className="ri-chat-off-line text-charcoal/30 text-2xl" />
                  </div>
                  <p className="mt-4 text-charcoal/60 text-sm">No reviews found for the selected filters.</p>
                  <button
                    type="button"
                    onClick={() => setFilterRating(0)}
                    className="mt-3 text-brand text-sm font-medium hover:underline cursor-pointer"
                  >
                    Clear filters
                  </button>
                </div>
              ) : (
                <div className="space-y-5">
                  {filtered.map((entry) => {
                    const closesAt = editWindowClosesAt(entry.created_at);
                    const editable = user?.id === entry.reviewer_id && now < closesAt;
                    return (
                      <ReviewCard
                        key={entry.id}
                        entry={entry}
                        onEdit={editable ? () => setEditingReview(entry) : undefined}
                        minutesLeftToEdit={editable ? Math.floor((closesAt - now) / 60_000) : undefined}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* CTA Banner */}
      <section className="bg-white border-t border-black/5 py-14">
        <div className="w-full px-4 md:px-8 lg:px-12">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-2xl md:text-3xl font-bold text-charcoal">Had a rental experience recently?</h2>
            <p className="mt-3 text-charcoal/60 text-sm md:text-base max-w-xl mx-auto">
              Your honest review helps thousands of renters and owners make better decisions. It only takes 2 minutes.
            </p>
            <div className="mt-7 flex flex-col sm:flex-row gap-4 justify-center">
              <button
                type="button"
                onClick={() => setModalRole('owner_on_renter')}
                className="bg-brand text-white font-medium px-8 py-3.5 rounded-full hover:bg-brand-dark transition-colors whitespace-nowrap cursor-pointer"
              >
                <i className="ri-home-4-line mr-2" />
                I&apos;m an Owner — Review My Tenant
              </button>
              <button
                type="button"
                onClick={() => setModalRole('renter_on_owner')}
                className="bg-teal-500 text-white font-medium px-8 py-3.5 rounded-full hover:bg-teal-600 transition-colors whitespace-nowrap cursor-pointer"
              >
                <i className="ri-user-line mr-2" />
                I&apos;m a Tenant — Review My Owner
              </button>
            </div>
          </div>
        </div>
      </section>

      {modalRole && (
        <FeedbackModal
          role={modalRole}
          tenancies={tenancies}
          onClose={() => { setModalRole(null); void refreshTenancies(); }}
          onSubmit={handleModalSubmit}
        />
      )}

      {editingReview && (
        <FeedbackModal
          role={editingReview.role}
          editing={editingReview}
          onClose={() => setEditingReview(null)}
          onSubmit={() => { setEditingReview(null); refresh(); }}
        />
      )}
    </div>
  );
}

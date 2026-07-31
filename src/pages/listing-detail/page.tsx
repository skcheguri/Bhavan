import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { useListingDetail } from '@/hooks/useListingDetail';
import { applySeo } from '@/lib/seo';
import { useSaveListing } from '@/hooks/useSaveListing';
import { useListings } from '@/hooks/useListings';
import { useCreateConnectionRequest, useTenantConnectionRequests } from '@/hooks/useConnectionRequests';
import { useContactRateLimit, getContactLimitStatus } from '@/hooks/useContactRateLimit';
import { useBrokerReport } from '@/hooks/useBrokerReport';
import { useListingReservedDates, useCreateVacationBooking } from '@/hooks/useVacationBookings';
import { useTenantPropertyVisits, useCreatePropertyVisit } from '@/hooks/usePropertyVisits';
import { isValidIndianPhone, formatIndianPhoneInput } from '@/lib/validation';
import VacationCalendar from './components/VacationCalendar';
import SoftBlockModal from './components/SoftBlockModal';
import ReportListingModal from './components/ReportListingModal';

function formatListedDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = d.toLocaleDateString('en-IN', { month: 'short' }).toUpperCase();
  return `${day}-${month}-${d.getFullYear()}`;
}

export default function ListingDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { listing, loading, error } = useListingDetail(id);

  // Real per-listing SEO once the data is in: descriptive title, listing
  // photo for og:image, and RealEstateListing structured data. Runs after
  // the route-level default in App.tsx, so it wins.
  useEffect(() => {
    if (!listing) return;
    applySeo({
      title: `${listing.title} — ₹${listing.price.toLocaleString('en-IN')}/mo in ${listing.location}`,
      description:
        (listing.description || `${listing.title}, available for rent in ${listing.location}.`).slice(0, 160) +
        ' Broker-free on Bhavan.',
      image: listing.images?.[0] ?? null,
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'RealEstateListing',
        name: listing.title,
        description: listing.description || undefined,
        url: window.location.origin + `/listings/${listing.id}`,
        image: listing.images?.length ? listing.images : undefined,
        offers: {
          '@type': 'Offer',
          price: listing.price,
          priceCurrency: 'INR',
          availability: 'https://schema.org/InStock',
        },
        address: {
          '@type': 'PostalAddress',
          addressLocality: listing.location,
          addressCountry: 'IN',
        },
      },
    });
  }, [listing]);

  // All state hooks MUST be declared before any conditional returns
  const [activeImage, setActiveImage] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const { savedIds, save, unsave, saving: savingBookmark } = useSaveListing(user?.id);
  const saved = savedIds.includes(id ?? '');
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestSent, setRequestSent] = useState(false);
  const [reqName, setReqName] = useState('');
  const [reqPhone, setReqPhone] = useState('');
  const [reqMessage, setReqMessage] = useState('Hi, I am interested in this property. Is it still available?');
  const [reqOccupation, setReqOccupation] = useState('');
  const [reqMoveIn, setReqMoveIn] = useState('');
  const [visitOpen, setVisitOpen] = useState(false);
  const [visitSubmitted, setVisitSubmitted] = useState(false);
  const [visitDate, setVisitDate] = useState('');
  const [visitTime, setVisitTime] = useState('');
  const [visitName, setVisitName] = useState('');
  const [visitPhone, setVisitPhone] = useState('');
  const [visitEmail, setVisitEmail] = useState('');
  const [visitNote, setVisitNote] = useState('');
  const [visitSubmitting, setVisitSubmitting] = useState(false);
  const [visitError, setVisitError] = useState('');
  const [visitPhoneError, setVisitPhoneError] = useState('');
  const [reqPhoneError, setReqPhoneError] = useState('');
  // Rate limit state
  const [rateLimitError, setRateLimitError] = useState('');
  const contactRate = useContactRateLimit(user?.id);
  const brokerReport = useBrokerReport(user?.id);
  const { create: createConnectionRequest, submitting: submittingRequest } = useCreateConnectionRequest();
  const { requests: tenantRequests, refresh: refreshTenantRequests } = useTenantConnectionRequests(user?.id);
  const { visits: tenantVisits, refresh: refreshTenantVisits } = useTenantPropertyVisits(user?.id);
  const { create: createPropertyVisit } = useCreatePropertyVisit();
  const { listings: allListings } = useListings();
  const [softBlockModalOpen, setSoftBlockModalOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  // Vacation booking state
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [guestCount, setGuestCount] = useState(1);
  const [bookingSubmitted, setBookingSubmitted] = useState(false);
  const [bookingError, setBookingError] = useState('');
  const { reservedDates, refresh: refreshReservedDates } = useListingReservedDates(id);
  const { create: createVacationBooking, creating: bookingSubmitting } = useCreateVacationBooking();

  // Keyboard nav for the photo lightbox -- declared unconditionally
  // (before the loading/error/not-found early returns below) since hooks
  // can't be called conditionally; it just no-ops until both a listing
  // and the lightbox are actually open.
  useEffect(() => {
    if (!lightboxOpen || !listing) return;
    const total = listing.images.length > 0 ? listing.images.length : 1;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxOpen(false);
      else if (e.key === 'ArrowLeft') setActiveImage((prev) => (prev - 1 + total) % total);
      else if (e.key === 'ArrowRight') setActiveImage((prev) => (prev + 1) % total);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [lightboxOpen, listing]);

  const timeSlots = [
    '9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM',
    '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', '6:00 PM',
  ];

  const today = new Date().toISOString().split('T')[0];

  const handleVisitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!visitDate || !visitTime || !visitName || !visitPhone || !visitEmail || !user || !listing) {
      setVisitError('Please fill in all required fields.');
      return;
    }
    if (!isValidIndianPhone(visitPhone)) {
      setVisitPhoneError('Enter a valid 10-digit Indian mobile number.');
      return;
    }
    setVisitPhoneError('');
    setVisitError('');
    setVisitSubmitting(true);

    const { error: visitCreateError } = await createPropertyVisit({
      tenantId: user.id,
      listingId: listing.id,
      visitDate,
      visitTime,
      visitorName: visitName,
      visitorPhone: visitPhone,
      visitorEmail: visitEmail,
      note: visitNote,
    });

    setVisitSubmitting(false);

    if (visitCreateError) {
      setVisitError(visitCreateError);
      return;
    }

    await refreshTenantVisits();
    setVisitSubmitted(true);
    setVisitOpen(false);
    setTimeout(() => setVisitSubmitted(false), 5000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-offwhite flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 flex items-center justify-center mx-auto mb-4">
            <i className="ri-loader-4-line animate-spin text-brand text-3xl" />
          </div>
          <p className="text-charcoal/60 text-sm">Loading property details...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-offwhite flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 flex items-center justify-center mx-auto mb-4 bg-red-50 rounded-full">
            <i className="ri-error-warning-line text-2xl text-red-400" />
          </div>
          <h2 className="text-xl font-bold text-charcoal mb-2">Error loading listing</h2>
          <p className="text-charcoal/60 text-sm mb-6">{error}</p>
          <Link to="/listings" className="bg-brand text-white px-6 py-3 rounded-full text-sm font-medium hover:bg-brand-dark transition-colors whitespace-nowrap">
            Browse Listings
          </Link>
        </div>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="min-h-screen bg-offwhite flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 flex items-center justify-center mx-auto mb-4 bg-lightgray rounded-full">
            <i className="ri-home-line text-2xl text-charcoal/40" />
          </div>
          <h2 className="text-xl font-bold text-charcoal mb-2">Property not found</h2>
          <p className="text-charcoal/60 text-sm mb-6">This listing may have been removed or the link is incorrect.</p>
          <Link to="/listings" className="bg-brand text-white px-6 py-3 rounded-full text-sm font-medium hover:bg-brand-dark transition-colors whitespace-nowrap">
            Browse Listings
          </Link>
        </div>
      </div>
    );
  }

  const isVacation = listing.category === 'vacation';
  const allImages = listing.images.length > 0 ? listing.images : ['/placeholders/photo.svg'];
  const amenities = listing.amenities ?? [];
  const nearby = listing.nearby ?? [];

  // Vacation booking helpers
  const nightCount = (() => {
    if (!checkIn || !checkOut) return 0;
    const diff = new Date(checkOut).getTime() - new Date(checkIn).getTime();
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
  })();
  const totalPrice = nightCount * listing.price;
  // listings has no real per-property guest-capacity column yet -- this
  // is a placeholder default, not a wired value, kept consistent across
  // every place it's shown rather than three different hardcoded guesses.
  const maxGuests = 2;

  const rangeOverlapsBlocked = (from: string, to: string): boolean => {
    if (!from || !to) return false;
    const start = new Date(from);
    const end = new Date(to);
    return reservedDates.some(({ from: rf, to: rt }) => {
      const rStart = new Date(rf);
      const rEnd = new Date(rt);
      return start < rEnd && end > rStart;
    });
  };

  const handleVacationBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkIn || !checkOut || nightCount < 1 || !user) return;
    if (rangeOverlapsBlocked(checkIn, checkOut)) {
      setBookingError('Your selected dates overlap with an existing reservation. Please choose different dates.');
      return;
    }
    setBookingError('');
    const { success, error } = await createVacationBooking({
      listingId: listing.id,
      tenantId: user.id,
      ownerId: listing.owner_id,
      checkIn,
      checkOut,
      guestCount,
      totalPrice: Math.round(totalPrice * 1.05),
    });
    if (!success) {
      setBookingError(error || 'Failed to submit booking request. Please try again.');
      await refreshReservedDates();
      return;
    }
    await refreshReservedDates();
    setBookingSubmitted(true);
  };

  const handleSendRequest = async () => {
    if (!reqName.trim() || !reqPhone.trim() || !listing) return;
    if (!isValidIndianPhone(reqPhone)) {
      setReqPhoneError('Enter a valid 10-digit Indian mobile number.');
      return;
    }
    setReqPhoneError('');
    if (brokerReport.isSoftBlocked) {
      setSoftBlockModalOpen(true);
      return;
    }
    if (!contactRate.canSend) {
      setRateLimitError(contactRate.limitReason || 'Contact limit reached.');
      return;
    }

    // Try to save to Supabase first
    const { success, error: createError } = await createConnectionRequest({
      listingId: listing.id,
      listingTitle: listing.title,
      listingLocation: listing.location,
      listingPrice: listing.price,
      ownerId: listing.owner_id,
      message: reqMessage.trim(),
      moveInDate: reqMoveIn || undefined,
      occupation: reqOccupation || undefined,
      scannedViaQR: false,
    });

    if (!success) {
      setRateLimitError(createError || 'Failed to send request. Please try again.');
      return;
    }

    await contactRate.record(listing.id);
    await refreshTenantRequests();
    setRequestSent(true);
    setRequestOpen(false);
    setTimeout(() => setRequestSent(false), 5000);
  };

  // Check if current user has a request for this listing
  const userRequest = user
    ? tenantRequests.find((r) => r.listingId === listing.id)
    : undefined;
  const hasApprovedRequest = userRequest?.status === 'approved';
  const hasPendingRequest = userRequest?.status === 'pending';
  const hasDeclinedRequest = userRequest?.status === 'declined';

  const existingVisit = user
    ? tenantVisits.find((v) => v.listing_id === listing.id && (v.status === 'requested' || v.status === 'confirmed'))
    : undefined;
  const hasActiveVisitRequest = Boolean(existingVisit);

  const similarListings = listing
    ? allListings.filter((l) => l.id !== listing.id && l.property_type === listing.property_type).slice(0, 3)
    : [];

  return (
    <div className="min-h-screen bg-offwhite pb-16">
      {/* Rate limit toast */}
      {rateLimitError && (
        <div className="fixed top-24 right-6 z-50 bg-red-600 text-white px-5 py-3 rounded-xl text-sm font-medium flex items-start gap-2 max-w-sm">
          <i className="ri-error-warning-line flex-shrink-0 mt-0.5" />
          <span>{rateLimitError}</span>
          <button onClick={() => setRateLimitError('')} className="ml-1 flex-shrink-0 cursor-pointer">
            <i className="ri-close-line" />
          </button>
        </div>
      )}

      {/* Visit booked toast */}
      {visitSubmitted && (
        <div className="fixed top-24 right-6 z-50 bg-brand text-white px-5 py-3 rounded-xl text-sm font-medium flex items-center gap-2 animate-fade-in">
          <i className="ri-calendar-check-line" /> Visit scheduled! We&apos;ll confirm shortly.
        </div>
      )}

      {/* Schedule Visit Modal */}
      {visitOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-base font-bold text-charcoal">Schedule a Visit</h3>
                <p className="text-xs text-charcoal/40 mt-0.5">{listing.title}</p>
              </div>
              <button onClick={() => setVisitOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-lightgray transition-colors cursor-pointer">
                <i className="ri-close-line text-charcoal/60" />
              </button>
            </div>

            <form id="schedule-visit-form" onSubmit={handleVisitSubmit} className="space-y-4">
              {/* Date & Time */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="visit-date" className="block text-xs font-semibold text-charcoal/60 mb-1.5 uppercase tracking-wide">Preferred Date <span className="text-red-400">*</span></label>
                  <input
                    id="visit-date"
                    type="date"
                    name="date"
                    min={today}
                    value={visitDate}
                    onChange={(e) => setVisitDate(e.target.value)}
                    className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 cursor-pointer"
                  />
                </div>
                <div>
                  <label htmlFor="visit-time" className="block text-xs font-semibold text-charcoal/60 mb-1.5 uppercase tracking-wide">Preferred Time <span className="text-red-400">*</span></label>
                  <select
                    id="visit-time"
                    name="time"
                    value={visitTime}
                    onChange={(e) => setVisitTime(e.target.value)}
                    className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 cursor-pointer"
                  >
                    <option value="">Select time</option>
                    {timeSlots.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Quick time chips */}
              <div>
                <p className="text-xs text-charcoal/40 mb-2">Quick select</p>
                <div className="flex flex-wrap gap-2">
                  {timeSlots.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setVisitTime(t)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                        visitTime === t
                          ? 'bg-brand text-white'
                          : 'bg-offwhite text-charcoal/70 hover:bg-brand/10 hover:text-brand'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Personal details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="visit-name" className="block text-xs font-semibold text-charcoal/60 mb-1.5 uppercase tracking-wide">Full Name <span className="text-red-400">*</span></label>
                  <input
                    id="visit-name"
                    type="text"
                    name="name"
                    placeholder="Your full name"
                    value={visitName}
                    onChange={(e) => setVisitName(e.target.value)}
                    className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                  />
                </div>
                <div>
                  <label htmlFor="visit-phone" className="block text-xs font-semibold text-charcoal/60 mb-1.5 uppercase tracking-wide">Phone <span className="text-red-400">*</span></label>
                  <input
                    id="visit-phone"
                    type="tel"
                    name="phone"
                    placeholder="+91 XXXXX XXXXX"
                    value={visitPhone}
                    onChange={(e) => { setVisitPhone(formatIndianPhoneInput(e.target.value)); setVisitPhoneError(''); }}
                    className={`w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 ${visitPhoneError ? 'ring-2 ring-red-300' : 'focus:ring-brand/30'}`}
                  />
                  {visitPhoneError && <p className="text-xs text-red-500 mt-1">{visitPhoneError}</p>}
                </div>
              </div>
              <div>
                <label htmlFor="visit-email" className="block text-xs font-semibold text-charcoal/60 mb-1.5 uppercase tracking-wide">Email <span className="text-red-400">*</span></label>
                <input
                  id="visit-email"
                  type="email"
                  name="email"
                  placeholder="your@email.com"
                  value={visitEmail}
                  onChange={(e) => setVisitEmail(e.target.value)}
                  className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
              </div>
              <div>
                <label htmlFor="visit-note" className="block text-xs font-semibold text-charcoal/60 mb-1.5 uppercase tracking-wide">Additional Note <span className="text-charcoal/30">(optional)</span></label>
                <textarea
                  id="visit-note"
                  name="note"
                  placeholder="Any specific questions or requirements..."
                  value={visitNote}
                  onChange={(e) => setVisitNote(e.target.value)}
                  rows={3}
                  maxLength={500}
                  className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 resize-none"
                />
                <p className="text-xs text-charcoal/40 mt-1 text-right">{visitNote.length}/500</p>
              </div>

              {visitError && (
                <p className="text-xs text-red-500 flex items-center gap-1">
                  <i className="ri-error-warning-line" /> {visitError}
                </p>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setVisitOpen(false)}
                  className="flex-1 px-4 py-2.5 rounded-full border border-black/10 text-sm font-medium text-charcoal/60 hover:bg-lightgray transition-colors cursor-pointer whitespace-nowrap"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={visitSubmitting}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-brand text-white text-sm font-semibold hover:bg-brand-dark transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60"
                >
                  {visitSubmitting ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-calendar-check-line" />}
                  {visitSubmitting ? 'Booking...' : 'Confirm Visit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Request sent toast */}
      {requestSent && (
        <div className="fixed top-24 right-6 z-50 bg-green-600 text-white px-5 py-3 rounded-xl text-sm font-medium flex items-center gap-2">
          <i className="ri-check-line" /> Request sent! Owner will review and approve.
        </div>
      )}

      {/* Request to Connect Modal */}
      {requestOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-base font-bold text-charcoal">Request to Connect</h3>
                <p className="text-xs text-charcoal/40 mt-0.5">{listing.landlord_name} will review before you can chat</p>
              </div>
              <button onClick={() => setRequestOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-lightgray transition-colors cursor-pointer">
                <i className="ri-close-line text-charcoal/60" />
              </button>
            </div>
            <div className="mb-4 p-3 bg-brand/5 rounded-xl border border-brand/10">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-charcoal">
                  {contactRate.dailyRemaining}/{contactRate.dailyCount} daily contacts used
                </span>
                <span className="text-xs font-semibold text-charcoal">
                  {contactRate.weeklyRemaining}/{contactRate.weeklyCount} weekly contacts used
                </span>
              </div>
              {contactRate.isServerEnforced && (
                <p className="text-xs text-green-600 mt-1 font-medium">· Server-enforced</p>
              )}
              {!contactRate.canSend && (
                <p className="text-xs text-red-500 mt-1.5 flex items-start gap-1">
                  <i className="ri-error-warning-line flex-shrink-0 mt-0.5" />
                  {contactRate.limitReason}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3 mb-5 p-3 bg-offwhite rounded-xl">
              <img src={listing.landlord_avatar} alt={listing.landlord_name} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
              <div>
                <p className="text-sm font-bold text-charcoal">{listing.landlord_name}</p>
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <i className="ri-shield-check-fill text-sm" /> Aadhaar Verified Owner
                </p>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label htmlFor="req-name" className="block text-xs font-semibold text-charcoal/60 mb-1.5 uppercase tracking-wide">Your Name <span className="text-red-400">*</span></label>
                <input
                  id="req-name"
                  value={reqName}
                  onChange={(e) => setReqName(e.target.value)}
                  className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                  placeholder="Enter your name"
                />
              </div>
              <div>
                <label htmlFor="req-phone" className="block text-xs font-semibold text-charcoal/60 mb-1.5 uppercase tracking-wide">Phone Number <span className="text-red-400">*</span></label>
                <input
                  id="req-phone"
                  type="tel"
                  value={reqPhone}
                  onChange={(e) => { setReqPhone(formatIndianPhoneInput(e.target.value)); setReqPhoneError(''); }}
                  className={`w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 ${reqPhoneError ? 'ring-2 ring-red-300' : 'focus:ring-brand/30'}`}
                  placeholder="+91 98765 43210"
                />
                {reqPhoneError && <p className="text-xs text-red-500 mt-1">{reqPhoneError}</p>}
              </div>
              <div>
                <label htmlFor="req-occupation" className="block text-xs font-semibold text-charcoal/60 mb-1.5 uppercase tracking-wide">Occupation</label>
                <input
                  id="req-occupation"
                  value={reqOccupation}
                  onChange={(e) => setReqOccupation(e.target.value)}
                  className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                  placeholder="e.g. Software Engineer, Doctor, Student"
                />
              </div>
              <div>
                <label htmlFor="req-move-in" className="block text-xs font-semibold text-charcoal/60 mb-1.5 uppercase tracking-wide">Preferred Move-in Date</label>
                <input
                  id="req-move-in"
                  value={reqMoveIn}
                  onChange={(e) => setReqMoveIn(e.target.value)}
                  className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                  placeholder="e.g. May 2026, Immediate"
                />
              </div>
              <div>
                <label htmlFor="req-message" className="block text-xs font-semibold text-charcoal/60 mb-1.5 uppercase tracking-wide">Message to Owner</label>
                <textarea
                  id="req-message"
                  value={reqMessage}
                  onChange={(e) => setReqMessage(e.target.value)}
                  rows={3}
                  maxLength={500}
                  className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 resize-none"
                />
                <p className="text-xs text-charcoal/40 mt-1 text-right">{reqMessage.length}/500</p>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setRequestOpen(false)}
                className="flex-1 px-4 py-2.5 rounded-full border border-black/10 text-sm font-medium text-charcoal/60 hover:bg-lightgray transition-colors cursor-pointer whitespace-nowrap"
              >
                Cancel
              </button>
              <button
                onClick={handleSendRequest}
                disabled={!reqName.trim() || !reqPhone.trim() || !contactRate.canSend || submittingRequest}
                className="flex-1 px-4 py-2.5 rounded-full bg-brand text-white text-sm font-medium hover:bg-brand-dark transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
              >
                {submittingRequest ? 'Sending...' : 'Send Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 md:px-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-charcoal/60 mb-5">
          <Link to="/" className="hover:text-brand transition-colors">Home</Link>
          <i className="ri-arrow-right-s-line text-charcoal/30" />
          <Link to="/listings" className="hover:text-brand transition-colors">Listings</Link>
          <i className="ri-arrow-right-s-line text-charcoal/30" />
          <span className="text-charcoal font-medium truncate max-w-[200px]">{listing.title}</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left: Main content */}
          <div className="lg:col-span-2 space-y-6">

            {/* Image Gallery */}
            <div className="bg-white rounded-3xl border border-black/5 overflow-hidden">
              <div className="relative aspect-[16/9] overflow-hidden">
                <img
                  src={allImages[activeImage]}
                  alt={listing.title}
                  onClick={() => setLightboxOpen(true)}
                  className="w-full h-full object-cover object-top transition-opacity duration-300 cursor-zoom-in"
                />
                <div className="absolute bottom-3 left-3 flex items-center gap-1 bg-black/50 text-white text-xs px-2.5 py-1 rounded-full pointer-events-none">
                  <i className="ri-zoom-in-line" /> Tap to view
                </div>
                {listing.verified && (
                  <span className="absolute top-4 left-4 flex items-center gap-1 text-xs font-bold px-3 py-1 rounded-full bg-green-500 text-white">
                    <i className="ri-shield-check-fill text-sm" /> Verified
                  </span>
                )}
                <span className="absolute top-4 right-4 bg-white/90 text-charcoal text-xs font-semibold px-3 py-1 rounded-full capitalize">
                  {listing.property_type}
                </span>
                {/* Nav arrows */}
                {allImages.length > 1 && (
                  <>
                    <button
                      onClick={() => setActiveImage((prev) => (prev - 1 + allImages.length) % allImages.length)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full bg-white/90 hover:bg-white transition-colors cursor-pointer"
                    >
                      <i className="ri-arrow-left-s-line text-charcoal text-lg" />
                    </button>
                    <button
                      onClick={() => setActiveImage((prev) => (prev + 1) % allImages.length)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full bg-white/90 hover:bg-white transition-colors cursor-pointer"
                    >
                      <i className="ri-arrow-right-s-line text-charcoal text-lg" />
                    </button>
                  </>
                )}
                <div className="absolute bottom-3 right-3 bg-black/50 text-white text-xs px-2 py-1 rounded-full">
                  {activeImage + 1} / {allImages.length}
                </div>
              </div>
              {/* Thumbnails */}
              <div className="flex gap-2 p-3 overflow-x-auto">
                {allImages.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveImage(idx)}
                    className={`flex-shrink-0 w-20 h-14 rounded-lg overflow-hidden border-2 transition cursor-pointer ${
                      activeImage === idx ? 'border-brand' : 'border-transparent opacity-60 hover:opacity-100'
                    }`}
                  >
                    <img src={img} alt={`View ${idx + 1}`} className="w-full h-full object-cover object-top" />
                  </button>
                ))}
              </div>
            </div>

            {/* Title & Key Info */}
            <div className="bg-white rounded-3xl border border-black/5 p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-charcoal">{listing.title}</h1>
                  <p className="text-charcoal/60 flex items-center gap-1.5 mt-1.5">
                    <i className="ri-map-pin-line text-brand" />
                    {listing.location}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  {isVacation ? (
                    <>
                      <p className="text-2xl font-bold text-sage">₹{listing.price.toLocaleString('en-IN')}</p>
                      <p className="text-xs text-charcoal/40">per night</p>
                    </>
                  ) : (
                    <>
                      <p className="text-2xl font-bold text-brand">₹{listing.price.toLocaleString('en-IN')}</p>
                      <p className="text-xs text-charcoal/40">per month</p>
                    </>
                  )}
                </div>
              </div>

              {/* Key specs -- sized to match the Amenities list below
                  (small icon + text row) rather than the old large
                  centered-icon boxes. */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
                {(isVacation ? [
                  { label: `${maxGuests} Guests`, sublabel: 'Max Capacity', icon: 'ri-group-line', color: 'text-sage bg-sage-light' },
                  { label: `${listing.bedrooms} Bed${listing.bedrooms > 1 ? 's' : ''}`, sublabel: 'Bedrooms', icon: 'ri-hotel-bed-line', color: 'text-brand bg-brand/10' },
                  { label: `${listing.bathrooms} Bath${listing.bathrooms > 1 ? 's' : ''}`, sublabel: 'Bathrooms', icon: 'ri-drop-line', color: 'text-teal-600 bg-teal-50' },
                  { label: `${listing.area} sqft`, sublabel: 'Area', icon: 'ri-ruler-line', color: 'text-amber-600 bg-amber-50' },
                ] : [
                  { label: listing.bedrooms === 0 ? 'Studio' : `${listing.bedrooms} BHK`, sublabel: 'Bedrooms', icon: 'ri-hotel-bed-line', color: 'text-brand bg-brand/10' },
                  { label: `${listing.bathrooms} Bath`, sublabel: 'Bathrooms', icon: 'ri-drop-line', color: 'text-teal-600 bg-teal-50' },
                  { label: `${listing.area} sqft`, sublabel: 'Area', icon: 'ri-ruler-line', color: 'text-amber-600 bg-amber-50' },
                  { label: listing.furnished ? 'Furnished' : 'Unfurnished', sublabel: 'Furnishing', icon: 'ri-sofa-line', color: listing.furnished ? 'text-green-600 bg-green-50' : 'text-charcoal/60 bg-lightgray' },
                ]).map((spec) => (
                  <div key={spec.label} className="flex items-center gap-2.5 p-3 bg-offwhite rounded-xl">
                    <div className={`w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0 ${spec.color}`}>
                      <i className={`${spec.icon} text-base`} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-charcoal truncate">{spec.label}</p>
                      <p className="text-[11px] text-charcoal/40 truncate">{spec.sublabel}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-2 mt-4">
                {isVacation ? (
                  <>
                    <span className="flex items-center gap-1.5 text-xs bg-sage-light text-sage-dark px-3 py-1.5 rounded-full font-medium">
                      <i className="ri-sun-line text-sm" />
                      {listing.property_type.charAt(0).toUpperCase() + listing.property_type.slice(1)}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs bg-offwhite text-charcoal/70 px-3 py-1.5 rounded-full font-medium">
                      <i className="ri-eye-line text-sm" />
                      {listing.views_count} views
                    </span>
                  </>
                ) : (
                  <>
                    {listing.parking !== 'none' && (
                      <span className="flex items-center gap-1.5 text-xs bg-amber-50 text-amber-700 px-3 py-1.5 rounded-full font-medium">
                        <i className="ri-parking-line text-sm" />
                        {listing.parking === 'both' ? '2W + 4W Parking' : listing.parking === '4-wheeler' ? '4-Wheeler Parking' : '2-Wheeler Parking'}
                      </span>
                    )}
                    <span className="flex items-center gap-1.5 text-xs bg-offwhite text-charcoal/70 px-3 py-1.5 rounded-full font-medium">
                      <i className="ri-calendar-line text-sm" />
                      Listed {formatListedDate(listing.created_at)}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs bg-offwhite text-charcoal/70 px-3 py-1.5 rounded-full font-medium">
                      <i className="ri-eye-line text-sm" />
                      {listing.views_count} views
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Description */}
            <div className="bg-white rounded-3xl border border-black/5 p-6">
              <h2 className="text-base font-bold text-charcoal mb-3 flex items-center gap-2">
                <div className="w-6 h-6 flex items-center justify-center">
                  <i className="ri-file-text-line text-brand" />
                </div>
                About this Property
              </h2>
              <p className="text-sm text-charcoal/70 leading-relaxed">{listing.description}</p>
            </div>

            {/* Amenities */}
            <div className="bg-white rounded-3xl border border-black/5 p-6">
              <h2 className="text-base font-bold text-charcoal mb-4 flex items-center gap-2">
                <div className="w-6 h-6 flex items-center justify-center">
                  <i className="ri-star-line text-brand" />
                </div>
                Amenities
              </h2>
              {amenities.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {amenities.map((amenity) => (
                    <div key={amenity} className="flex items-center gap-2.5 p-3 bg-offwhite rounded-xl">
                      <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
                        <i className="ri-checkbox-circle-fill text-green-500 text-base" />
                      </div>
                      <span className="text-sm text-charcoal font-medium">{amenity}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-charcoal/40">No amenities listed for this property.</p>
              )}
            </div>

            {/* Nearby Places */}
            <div className="bg-white rounded-3xl border border-black/5 p-6">
              <h2 className="text-base font-bold text-charcoal mb-4 flex items-center gap-2">
                <div className="w-6 h-6 flex items-center justify-center">
                  <i className="ri-map-pin-2-line text-brand" />
                </div>
                Nearby Places
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {nearby.map((place) => (
                  <div key={place.label} className="flex items-center justify-between p-3 bg-offwhite rounded-xl">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 flex items-center justify-center rounded-lg bg-brand/10 flex-shrink-0">
                        <i className={`${place.icon} text-sm text-brand`} />
                      </div>
                      <span className="text-sm text-charcoal font-medium">{place.label}</span>
                    </div>
                    <span className="text-xs font-semibold text-charcoal/60 bg-white px-2 py-0.5 rounded-full border border-black/5">
                      {place.distance}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Map placeholder */}
            <div className="bg-white rounded-3xl border border-black/5 p-6">
              <h2 className="text-base font-bold text-charcoal mb-4 flex items-center gap-2">
                <div className="w-6 h-6 flex items-center justify-center">
                  <i className="ri-road-map-line text-brand" />
                </div>
                Location
              </h2>
              <div className="w-full h-56 rounded-xl overflow-hidden bg-offwhite flex items-center justify-center border border-black/5">
                <iframe
                  title="Property Location"
                  width="100%"
                  height="100%"
                  style={{ border: 0 }}
                  loading="lazy"
                  allowFullScreen
                  src={`https://maps.google.com/maps?q=${encodeURIComponent(listing.location)}&output=embed`}
                />
              </div>
              <p className="text-xs text-charcoal/40 mt-2 flex items-center gap-1">
                <i className="ri-map-pin-line text-sm" /> {listing.location}
              </p>
            </div>

            {/* Schedule a Visit (residential/commercial only) OR Booking Widget (vacation) */}
            {isVacation ? (
              <div id="vacation-booking-section" className="bg-white rounded-2xl border border-sage-light p-6">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-sage-light flex-shrink-0">
                    <i className="ri-calendar-2-line text-xl text-sage" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-charcoal">Book Your Stay</h2>
                    <p className="text-xs text-charcoal/40 mt-0.5">Select dates and confirm your booking instantly</p>
                  </div>
                </div>

                {bookingSubmitted ? (
                  <div className="text-center py-6">
                    <div className="w-14 h-14 rounded-full bg-sage-light flex items-center justify-center mx-auto mb-4">
                      <i className="ri-check-line text-sage text-2xl" />
                    </div>
                    <h3 className="text-base font-bold text-charcoal">Booking Request Sent!</h3>
                    <p className="text-sm text-charcoal/60 mt-2 leading-relaxed">
                      {listing.landlord_name} will confirm your stay within 24 hours. Check your email for details.
                    </p>
                    <button
                      onClick={() => { setBookingSubmitted(false); setCheckIn(''); setCheckOut(''); setGuestCount(1); setBookingError(''); }}
                      className="mt-4 text-sm text-sage font-medium hover:text-sage-dark cursor-pointer"
                    >
                      Book different dates
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleVacationBook} className="space-y-4">
                    {/* Availability Calendar */}
                    <div className="bg-offwhite rounded-xl p-4">
                      <VacationCalendar
                        reservedDates={reservedDates}
                        checkIn={checkIn}
                        checkOut={checkOut}
                        onCheckInChange={(d) => { setCheckIn(d); setCheckOut(''); }}
                        onCheckOutChange={setCheckOut}
                      />
                    </div>

                    {/* Selected dates summary */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-offwhite rounded-xl px-3 py-2.5">
                        <p className="text-[10px] font-semibold text-charcoal/40 uppercase tracking-wide mb-0.5">Check-in</p>
                        <p className={`text-sm font-bold ${checkIn ? 'text-charcoal' : 'text-charcoal/30'}`}>
                          {checkIn ? new Date(checkIn + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not selected'}
                        </p>
                      </div>
                      <div className="bg-offwhite rounded-xl px-3 py-2.5">
                        <p className="text-[10px] font-semibold text-charcoal/40 uppercase tracking-wide mb-0.5">Check-out</p>
                        <p className={`text-sm font-bold ${checkOut ? 'text-charcoal' : 'text-charcoal/30'}`}>
                          {checkOut ? new Date(checkOut + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Not selected'}
                        </p>
                      </div>
                    </div>

                    {/* Guests */}
                    <div>
                      <label className="block text-xs font-semibold text-charcoal/60 uppercase tracking-wide mb-1.5">Guests</label>
                      <div className="flex items-center gap-3 bg-offwhite rounded-xl px-4 py-2.5">
                        <button
                          type="button"
                          onClick={() => setGuestCount((g) => Math.max(1, g - 1))}
                          className="w-7 h-7 flex items-center justify-center rounded-full bg-white border border-black/10 text-charcoal hover:border-sage/40 transition-colors cursor-pointer"
                        >
                          <i className="ri-subtract-line text-sm" />
                        </button>
                        <span className="flex-1 text-center text-sm font-semibold text-charcoal">{guestCount} Guest{guestCount > 1 ? 's' : ''}</span>
                        <button
                          type="button"
                          onClick={() => setGuestCount((g) => Math.min(maxGuests, g + 1))}
                          className="w-7 h-7 flex items-center justify-center rounded-full bg-white border border-black/10 text-charcoal hover:border-sage/40 transition-colors cursor-pointer"
                        >
                          <i className="ri-add-line text-sm" />
                        </button>
                      </div>
                      <p className="text-xs text-charcoal/40 mt-1">Max {maxGuests} guests allowed</p>
                    </div>

                    {/* Price breakdown */}
                    {nightCount > 0 && (
                      <div className="bg-sage-light rounded-xl p-4 space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-charcoal/70">₹{listing.price.toLocaleString('en-IN')} × {nightCount} night{nightCount > 1 ? 's' : ''}</span>
                          <span className="font-semibold text-charcoal">₹{totalPrice.toLocaleString('en-IN')}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-charcoal/70">Service fee</span>
                          <span className="font-semibold text-charcoal">₹{Math.round(totalPrice * 0.05).toLocaleString('en-IN')}</span>
                        </div>
                        <div className="border-t border-sage/30 pt-2 flex justify-between">
                          <span className="text-sm font-bold text-charcoal">Total</span>
                          <span className="text-sm font-bold text-sage">₹{Math.round(totalPrice * 1.05).toLocaleString('en-IN')}</span>
                        </div>
                      </div>
                    )}

                    {/* Owner info */}
                    <div className="flex items-center gap-3 p-3 bg-offwhite rounded-xl">
                      <img src={listing.landlord_avatar} alt={listing.landlord_name} className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-charcoal">{listing.landlord_name}</p>
                        <p className="text-xs text-green-600 flex items-center gap-1"><i className="ri-shield-check-fill text-sm" /> Verified Owner</p>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-green-600 font-semibold flex-shrink-0">
                        <div className="w-2 h-2 rounded-full bg-green-500" />
                        Active
                      </div>
                    </div>

                    {bookingError && (
                      <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                        <i className="ri-error-warning-line text-red-500 mt-0.5 flex-shrink-0" />
                        <p className="text-xs text-red-600">{bookingError}</p>
                      </div>
                    )}

                    {user?.role === 'owner' ? (
                      <button
                        disabled
                        className="w-full flex items-center justify-center gap-2 bg-lightgray text-charcoal/40 text-sm font-semibold px-4 py-3 rounded-full cursor-not-allowed whitespace-nowrap"
                      >
                        <i className="ri-building-4-line" /> Owners cannot book stays
                      </button>
                    ) : user ? (
                      <button
                        type="submit"
                        disabled={!checkIn || !checkOut || nightCount < 1 || bookingSubmitting}
                        className="w-full flex items-center justify-center gap-2 bg-sage text-white text-sm font-semibold px-4 py-3 rounded-full hover:bg-sage-dark transition-colors cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {bookingSubmitting ? <><i className="ri-loader-4-line animate-spin" /> Sending Request...</> : <><i className="ri-calendar-check-line" /> Request to Book</>}
                      </button>
                    ) : (
                      <Link
                        to="/login"
                        className="w-full flex items-center justify-center gap-2 bg-sage text-white text-sm font-semibold px-4 py-3 rounded-full hover:bg-sage-dark transition-colors whitespace-nowrap"
                      >
                        <i className="ri-login-circle-line" /> Sign In to Book
                      </Link>
                    )}
                    <p className="text-xs text-center text-charcoal/40">You won&apos;t be charged yet — owner confirms first</p>
                  </form>
                )}
              </div>
            ) : null}

            {/* Similar Listings */}
            {similarListings.length > 0 && (
              <div className="bg-white rounded-3xl border border-black/5 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-bold text-charcoal">Similar Properties</h2>
                  <Link to="/listings" className="text-sm text-brand font-medium hover:text-brand-dark whitespace-nowrap">View all</Link>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {similarListings.map((sim) => (
                    <Link
                      key={sim.id}
                      to={`/listings/${sim.id}`}
                      className="group block rounded-xl overflow-hidden border border-black/5 hover:border-brand/30 transition"
                    >
                      <div className="relative h-32 overflow-hidden">
                        <img
                          src={sim.images && sim.images.length > 0 ? sim.images[0] : '/placeholders/photo.svg'}
                          alt={sim.title}
                          className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300"
                        />
                        {sim.verified && (
                          <span className="absolute top-2 left-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-green-500 text-white">
                            Verified
                          </span>
                        )}
                      </div>
                      <div className="p-3">
                        <p className="text-xs font-bold text-brand">₹{sim.price.toLocaleString('en-IN')}/mo</p>
                        <p className="text-xs font-semibold text-charcoal mt-0.5 line-clamp-1">{sim.title}</p>
                        <p className="text-[10px] text-charcoal/40 flex items-center gap-0.5 mt-0.5">
                          <i className="ri-map-pin-line text-[10px]" /> {sim.location}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {user && listing.owner_id !== user.id && (
              <button
                type="button"
                onClick={() => setReportModalOpen(true)}
                className="flex items-center gap-1.5 text-xs text-charcoal/40 hover:text-red-600 transition-colors cursor-pointer"
              >
                <i className="ri-flag-2-line" /> Report this listing
              </button>
            )}
          </div>

          {/* Right: Sticky sidebar */}
          <div className="space-y-5">
            {/* Price card */}
            <div className="bg-white rounded-3xl border border-black/5 p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  {isVacation ? (
                    <>
                      <p className="text-2xl font-bold text-sage">₹{listing.price.toLocaleString('en-IN')}</p>
                      <p className="text-xs text-charcoal/40">per night</p>
                    </>
                  ) : (
                    <>
                      <p className="text-2xl font-bold text-brand">₹{listing.price.toLocaleString('en-IN')}</p>
                      <p className="text-xs text-charcoal/40">per month</p>
                    </>
                  )}
                </div>
                <button
                  onClick={() => {
                    if (!id) return;
                    if (saved) {
                      unsave(id);
                    } else {
                      save(id);
                    }
                  }}
                  disabled={savingBookmark}
                  className={`w-10 h-10 flex items-center justify-center rounded-full border transition cursor-pointer ${
                    saved ? 'bg-brand/10 border-brand/30 text-brand' : 'border-black/10 text-charcoal/40 hover:border-brand/30 hover:text-brand'
                  }`}
                >
                  <i className={saved ? 'ri-bookmark-fill' : 'ri-bookmark-line'} />
                </button>
              </div>

              {/* Property Info */}
              {user?.role === 'owner' && listing.owner_id === user.id && (
                <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <div className="flex items-start gap-2">
                    <i className="ri-shield-star-line text-amber-600 mt-0.5 text-sm flex-shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-amber-700">You Own This Property</p>
                      <p className="text-xs text-amber-600 mt-0.5 leading-relaxed">
                        This listing is registered under your verified ownership.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Landlord */}
              <div className="flex items-center gap-3 p-3 bg-offwhite rounded-xl mb-4">
                <img src={listing.landlord_avatar} alt={listing.landlord_name} className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-charcoal truncate">{listing.landlord_name}</p>
                  <p className="text-xs text-green-600 flex items-center gap-1">
                    <i className="ri-shield-check-fill text-sm" /> Aadhaar Verified
                  </p>
                </div>
                <div className="w-8 h-8 flex items-center justify-center rounded-full bg-green-50 flex-shrink-0">
                  <i className="ri-user-star-line text-sm text-green-600" />
                </div>
              </div>

              {user?.role === 'owner' ? (
                <button
                  disabled
                  className="w-full bg-lightgray text-charcoal/40 text-sm font-semibold px-4 py-3 rounded-full cursor-not-allowed whitespace-nowrap"
                >
                  <i className="ri-building-4-line mr-2" />
                  Owners cannot connect with listings
                </button>
              ) : isVacation ? (
                user ? (
                  <button
                    onClick={() => { const el = document.getElementById('vacation-booking-section'); el?.scrollIntoView({ behavior: 'smooth' }); }}
                    className="w-full bg-sage text-white text-sm font-semibold px-4 py-3 rounded-full hover:bg-sage-dark transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <i className="ri-calendar-2-line mr-2" />
                    Check Availability
                  </button>
                ) : (
                  <Link
                    to="/login"
                    className="w-full flex items-center justify-center gap-2 bg-sage text-white text-sm font-semibold px-4 py-3 rounded-full hover:bg-sage-dark transition-colors whitespace-nowrap"
                  >
                    <i className="ri-login-circle-line" />
                    Sign In to Book
                  </Link>
                )
              ) : hasApprovedRequest ? (
                <button
                  disabled
                  className="w-full flex items-center justify-center gap-2 bg-green-50 border border-green-200 text-green-700 text-sm font-semibold px-4 py-3 rounded-full cursor-not-allowed whitespace-nowrap"
                >
                  <i className="ri-checkbox-circle-line" />
                  Request Approved
                </button>
              ) : hasPendingRequest ? (
                <div className="space-y-1.5">
                  <button
                    disabled
                    className="w-full flex items-center justify-center gap-2 bg-lightgray text-charcoal/40 text-sm font-semibold px-4 py-3 rounded-full cursor-not-allowed whitespace-nowrap"
                  >
                    <i className="ri-time-line" />
                    Request Sent
                  </button>
                  <p className="text-xs text-center text-charcoal/40">Waiting for the owner to respond.</p>
                </div>
              ) : hasDeclinedRequest ? (
                <button
                  disabled
                  className="w-full flex items-center justify-center gap-2 bg-lightgray text-charcoal/40 text-sm font-semibold px-4 py-3 rounded-full cursor-not-allowed whitespace-nowrap"
                >
                  <i className="ri-close-circle-line" />
                  Request Declined
                </button>
              ) : (
                user ? (
                  <button
                    onClick={() => {
                      if (brokerReport.isSoftBlocked) {
                        setSoftBlockModalOpen(true);
                        return;
                      }
                      if (!contactRate.canSend) {
                        setRateLimitError(contactRate.limitReason || 'Contact limit reached.');
                        return;
                      }
                      setRequestOpen(true);
                    }}
                    className="w-full bg-brand text-white text-sm font-semibold px-4 py-3 rounded-full hover:bg-brand-dark transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <i className="ri-user-add-line mr-2" />
                    Request to Connect
                  </button>
                ) : (
                  <Link
                    to="/login"
                    className="w-full flex items-center justify-center gap-2 bg-brand text-white text-sm font-semibold px-4 py-3 rounded-full hover:bg-brand-dark transition-colors whitespace-nowrap"
                  >
                    <i className="ri-login-circle-line" />
                    Sign In to Connect
                  </Link>
                )
              )}

              <div className="mt-4 pt-4 border-t border-black/5 space-y-2.5">
                {(isVacation ? [
                  { icon: 'ri-time-line', label: 'Min. stay', value: '1 night' },
                  { icon: 'ri-group-line', label: 'Max guests', value: `${maxGuests} guests` },
                  { icon: 'ri-shield-check-line', label: 'Cancellation', value: 'Flexible' },
                ] : [
                  { icon: 'ri-calendar-check-line', label: 'Available from', value: 'Immediately' },
                  { icon: 'ri-time-line', label: 'Minimum lease', value: '11 months' },
                  { icon: 'ri-money-rupee-circle-line', label: 'Security deposit', value: listing.deposit > 0 ? `₹${listing.deposit.toLocaleString('en-IN')}` : 'Not specified' },
                ]).map((item) => (
                  <div key={item.label} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 text-charcoal/60">
                      <div className="w-5 h-5 flex items-center justify-center">
                        <i className={`${item.icon} text-xs`} />
                      </div>
                      {item.label}
                    </div>
                    <span className="font-semibold text-charcoal">{item.value}</span>
                  </div>
                ))}
              </div>

              <div className="mt-4 pt-4 border-t border-black/5 space-y-2">
                {!isVacation && user?.role !== 'owner' && (
                  hasActiveVisitRequest ? (
                    <div className="space-y-1">
                      <div className="w-full flex items-center justify-center gap-2 bg-lightgray text-charcoal/40 text-sm font-semibold px-4 py-2.5 rounded-full whitespace-nowrap cursor-not-allowed">
                        <i className="ri-calendar-check-line text-sm" />
                        Visit Requested
                      </div>
                      <p className="text-xs text-center text-charcoal/40">Waiting for the owner to confirm your visit.</p>
                    </div>
                  ) : hasApprovedRequest ? (
                    <button
                      onClick={() => setVisitOpen(true)}
                      className="w-full flex items-center justify-center gap-2 bg-brand/10 text-brand text-sm font-semibold px-4 py-2.5 rounded-full hover:bg-brand/20 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <i className="ri-calendar-check-line text-sm" />
                      Schedule a Visit
                    </button>
                  ) : hasPendingRequest ? (
                    <div className="w-full flex items-center justify-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 text-sm font-semibold px-4 py-2.5 rounded-full whitespace-nowrap">
                      <i className="ri-time-line text-sm" />
                      Visit Locked — Pending
                    </div>
                  ) : hasDeclinedRequest ? (
                    <div className="w-full flex items-center justify-center gap-2 bg-red-50 border border-red-200 text-red-600 text-sm font-semibold px-4 py-2.5 rounded-full whitespace-nowrap">
                      <i className="ri-close-circle-line text-sm" />
                      Request Declined
                    </div>
                  ) : user ? (
                    <button
                      onClick={() => {
                        if (brokerReport.isSoftBlocked) {
                          setSoftBlockModalOpen(true);
                          return;
                        }
                        if (!contactRate.canSend) {
                          setRateLimitError(contactRate.limitReason || 'Contact limit reached.');
                          return;
                        }
                        setRequestOpen(true);
                      }}
                      className={`w-full flex items-center justify-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-full transition-colors cursor-pointer whitespace-nowrap ${
                        brokerReport.isSoftBlocked || !contactRate.canSend
                          ? 'bg-lightgray text-charcoal/40 cursor-not-allowed'
                          : 'bg-brand/10 text-brand hover:bg-brand/20'
                      }`}
                      disabled={brokerReport.isSoftBlocked || !contactRate.canSend}
                    >
                      <i className="ri-user-add-line text-sm" />
                      {brokerReport.isSoftBlocked ? 'Account Restricted' : contactRate.canSend ? 'Request to Connect' : 'Limit Reached'}
                    </button>
                  ) : (
                    <Link
                      to="/login"
                      className="w-full flex items-center justify-center gap-2 bg-brand/10 text-brand text-sm font-semibold px-4 py-2.5 rounded-full hover:bg-brand/20 transition-colors whitespace-nowrap"
                    >
                      <i className="ri-login-circle-line text-sm" />
                      Sign In to Connect
                    </Link>
                  )
                )}
                <button
                  onClick={() => navigate(-1)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-full border border-black/10 text-sm font-medium text-charcoal/60 hover:bg-lightgray transition-colors cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-arrow-left-line text-sm" /> Back to Listings
                </button>
              </div>
            </div>

            {/* Safety tips */}
            <div className={`border rounded-2xl p-4 ${isVacation ? 'bg-sage-light border-sage-light' : 'bg-amber-50 border-amber-100'}`}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 flex items-center justify-center">
                  <i className={`ri-shield-star-line ${isVacation ? 'text-sage' : 'text-amber-600'}`} />
                </div>
                <h3 className={`text-sm font-bold ${isVacation ? 'text-sage-dark' : 'text-amber-800'}`}>
                  {isVacation ? 'Booking Tips' : 'Safety Tips'}
                </h3>
              </div>
              <ul className="space-y-1.5">
                {(isVacation ? [
                  'Owner confirms within 24 hours',
                  'You won\'t be charged until confirmed',
                  'Free cancellation up to 48h before check-in',
                  'Govt. ID required at check-in',
                ] : [
                  'Always verify Aadhaar before meeting',
                  'Never pay without a signed agreement',
                  'Visit the property in person first',
                  'Use Bhavan for all payments',
                ]).map((tip) => (
                  <li key={tip} className={`text-xs flex items-start gap-1.5 ${isVacation ? 'text-sage-dark' : 'text-amber-700'}`}>
                    <i className={`ri-check-line mt-0.5 flex-shrink-0 ${isVacation ? 'text-sage' : 'text-amber-500'}`} />
                    {tip}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
      <SoftBlockModal
        open={softBlockModalOpen}
        onClose={() => setSoftBlockModalOpen(false)}
        tenantId={user?.id ?? ''}
        tenantName={user?.name ?? ''}
      />
      <ReportListingModal
        open={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        listingId={listing.id}
        reporterId={user?.id ?? ''}
      />
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            onClick={() => setLightboxOpen(false)}
            aria-label="Close"
            className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
          >
            <i className="ri-close-line text-xl" />
          </button>

          {allImages.length > 1 && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveImage((prev) => (prev - 1 + allImages.length) % allImages.length);
                }}
                aria-label="Previous photo"
                className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
              >
                <i className="ri-arrow-left-s-line text-2xl" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveImage((prev) => (prev + 1) % allImages.length);
                }}
                aria-label="Next photo"
                className="absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
              >
                <i className="ri-arrow-right-s-line text-2xl" />
              </button>
            </>
          )}

          <img
            src={allImages[activeImage]}
            alt={listing.title}
            onClick={(e) => e.stopPropagation()}
            className="max-w-[92vw] max-h-[85vh] object-contain"
          />

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/10 text-white text-xs px-3 py-1 rounded-full">
            {activeImage + 1} / {allImages.length}
          </div>
        </div>
      )}
    </div>
  );
}
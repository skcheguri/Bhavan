import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useListingDetail } from '@/hooks/useListingDetail';
import { recordScan, recordConversion } from '@/hooks/useQrAnalytics';
import { useCreateConnectionRequest, useTenantConnectionRequests } from '@/hooks/useConnectionRequests';
import { useContactRateLimit, getContactLimitStatus } from '@/hooks/useContactRateLimit';
import { useBrokerReport } from '@/hooks/useBrokerReport';
import { useTenantPropertyVisits, useCreatePropertyVisit } from '@/hooks/usePropertyVisits';
import { isValidIndianPhone, formatIndianPhoneInput } from '@/lib/validation';
import SoftBlockModal from '@/pages/listing-detail/components/SoftBlockModal';

export default function ScanLanding() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formMessage, setFormMessage] = useState('');
  const [formMoveIn, setFormMoveIn] = useState('');
  const [formOccupation, setFormOccupation] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [rateLimitError, setRateLimitError] = useState('');
  const [currentImage, setCurrentImage] = useState(0);
  const contactRate = useContactRateLimit(user?.id);
  const brokerReport = useBrokerReport(user?.id);
  const [softBlockModalOpen, setSoftBlockModalOpen] = useState(false);
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
  const [formPhoneError, setFormPhoneError] = useState('');

  const { listing, loading: listingLoading } = useListingDetail(id);
  const { create: createConnectionRequest } = useCreateConnectionRequest();
  const { requests: tenantRequests, refresh: refreshTenantRequests } = useTenantConnectionRequests(user?.id);
  const { visits: tenantVisits, refresh: refreshTenantVisits } = useTenantPropertyVisits(user?.id);
  const { create: createPropertyVisit } = useCreatePropertyVisit();

  // Check if user has a request for this listing
  const userRequest = user && listing
    ? tenantRequests.find((r) => r.listingId === listing.id)
    : undefined;
  const hasApprovedRequest = userRequest?.status === 'approved';
  const hasPendingRequest = userRequest?.status === 'pending';
  const hasDeclinedRequest = userRequest?.status === 'declined';

  const existingVisit = user && listing
    ? tenantVisits.find((v) => v.listing_id === listing.id && (v.status === 'requested' || v.status === 'confirmed'))
    : undefined;
  const hasActiveVisitRequest = Boolean(existingVisit);

  const timeSlots = [
    '9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM',
    '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', '6:00 PM',
  ];
  const today = new Date().toISOString().split('T')[0];

  // Record scan analytics
  useEffect(() => {
    if (id) {
      recordScan(id);
    }
  }, [id]);

  if (listingLoading) {
    return (
      <div className="min-h-screen bg-offwhite flex items-center justify-center px-4">
        <i className="ri-loader-4-line animate-spin text-brand text-3xl" />
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="min-h-screen bg-offwhite flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 flex items-center justify-center mx-auto mb-4 bg-lightgray rounded-full">
            <i className="ri-qr-code-line text-2xl text-charcoal/40" />
          </div>
          <h2 className="text-xl font-bold text-charcoal mb-2">Listing Not Found</h2>
          <p className="text-sm text-charcoal/60 mb-6">This QR code may be expired or the listing has been removed.</p>
          <Link
            to="/listings"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 transition-colors whitespace-nowrap"
          >
            <i className="ri-search-line text-sm" /> Browse Listings
          </Link>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidIndianPhone(formPhone)) {
      setFormPhoneError('Enter a valid 10-digit Indian mobile number.');
      return;
    }
    setFormPhoneError('');
    if (brokerReport.isSoftBlocked) {
      setSoftBlockModalOpen(true);
      return;
    }
    if (user && !contactRate.canSend) {
      setRateLimitError(getContactLimitStatus(user.id).limitReason || 'Contact limit reached.');
      return;
    }
    // For non-logged-in users, check device limits
    if (!user && !contactRate.canSend) {
      setRateLimitError(contactRate.limitReason || 'Contact limit reached.');
      return;
    }
    setRateLimitError('');

    const { success, error: createError } = await createConnectionRequest({
      listingId: listing.id,
      listingTitle: listing.title,
      listingLocation: listing.location,
      listingPrice: listing.price,
      ownerId: listing.owner_id,
      message: formMessage,
      moveInDate: formMoveIn || undefined,
      occupation: formOccupation || undefined,
      scannedViaQR: true,
    });

    if (!success) {
      setRateLimitError(createError || 'Failed to send request. Please try again.');
      return;
    }

    if (id) await recordConversion(id);
    await contactRate.record(listing.id);
    await refreshTenantRequests();
    setSubmitted(true);
  };

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

  const nextImage = () => setCurrentImage((prev) => (prev + 1) % listing.images.length);
  const prevImage = () => setCurrentImage((prev) => (prev - 1 + listing.images.length) % listing.images.length);

  return (
    <div className="min-h-screen bg-offwhite">

      {/* Rate limit toast */}
      {rateLimitError && (
        <div className="fixed top-6 right-6 z-50 bg-red-600 text-white px-5 py-3 rounded-xl text-sm font-medium flex items-start gap-2 max-w-sm">
          <i className="ri-error-warning-line flex-shrink-0 mt-0.5" />
          <span>{rateLimitError}</span>
          <button onClick={() => setRateLimitError('')} className="ml-1 flex-shrink-0 cursor-pointer">
            <i className="ri-close-line" />
          </button>
        </div>
      )}

      {/* Visit booked toast */}
      {visitSubmitted && (
        <div className="fixed top-6 right-6 z-50 bg-green-600 text-white px-5 py-3 rounded-xl text-sm font-medium flex items-center gap-2">
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
            <form id="scan-visit-form" onSubmit={handleVisitSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-charcoal/60 mb-1.5 uppercase tracking-wide">Preferred Date <span className="text-red-400">*</span></label>
                  <input type="date" name="date" min={today} value={visitDate} onChange={(e) => setVisitDate(e.target.value)}
                    className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 cursor-pointer" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-charcoal/60 mb-1.5 uppercase tracking-wide">Preferred Time <span className="text-red-400">*</span></label>
                  <select name="time" value={visitTime} onChange={(e) => setVisitTime(e.target.value)}
                    className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 cursor-pointer">
                    <option value="">Select time</option>
                    {timeSlots.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-charcoal/60 mb-1.5 uppercase tracking-wide">Full Name <span className="text-red-400">*</span></label>
                  <input type="text" name="name" placeholder="Your full name" value={visitName} onChange={(e) => setVisitName(e.target.value)}
                    className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-charcoal/60 mb-1.5 uppercase tracking-wide">Phone <span className="text-red-400">*</span></label>
                  <input type="tel" name="phone" placeholder="+91 XXXXX XXXXX" value={visitPhone} onChange={(e) => { setVisitPhone(formatIndianPhoneInput(e.target.value)); setVisitPhoneError(''); }}
                    className={`w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 ${visitPhoneError ? 'ring-2 ring-red-300' : 'focus:ring-brand/30'}`} />
                  {visitPhoneError && <p className="text-xs text-red-500 mt-1">{visitPhoneError}</p>}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-charcoal/60 mb-1.5 uppercase tracking-wide">Email <span className="text-red-400">*</span></label>
                <input type="email" name="email" placeholder="your@email.com" value={visitEmail} onChange={(e) => setVisitEmail(e.target.value)}
                  className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-charcoal/60 mb-1.5 uppercase tracking-wide">Note <span className="text-charcoal/30">(optional)</span></label>
                <textarea name="note" placeholder="Any questions?" value={visitNote} onChange={(e) => setVisitNote(e.target.value)} rows={3} maxLength={500}
                  className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 resize-none" />
              </div>
              {visitError && <p className="text-xs text-red-500 flex items-center gap-1"><i className="ri-error-warning-line" /> {visitError}</p>}
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setVisitOpen(false)}
                  className="flex-1 px-4 py-2.5 rounded-full border border-black/10 text-sm font-medium text-charcoal/60 hover:bg-lightgray transition-colors cursor-pointer whitespace-nowrap">
                  Cancel
                </button>
                <button type="submit" disabled={visitSubmitting}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60">
                  {visitSubmitting ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-calendar-check-line" />}
                  {visitSubmitting ? 'Booking...' : 'Confirm Visit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Top bar */}
      <div className="bg-white border-b border-black/5">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-7 h-7 flex items-center justify-center rounded-lg bg-amber-500">
              <i className="ri-home-4-line text-white text-sm" />
            </div>
            <span className="text-sm font-bold text-charcoal">Bhavan</span>
          </Link>
          <Link
            to="/listings"
            className="text-xs font-medium text-amber-600 hover:text-amber-700 whitespace-nowrap"
          >
            Browse All
          </Link>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {/* Scanned via QR badge */}
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-xl px-4 py-2.5">
          <div className="w-6 h-6 flex items-center justify-center rounded-full bg-amber-100 flex-shrink-0">
            <i className="ri-qr-scan-line text-amber-600 text-xs" />
          </div>
          <p className="text-xs text-amber-700 font-medium">
            You scanned a QR code at this property. All conversations happen inside the app — no phone number needed.
          </p>
        </div>

        {/* Image gallery */}
        <div className="bg-white rounded-3xl border border-black/5 overflow-hidden">
          <div className="relative h-64 md:h-80">
            <img
              src={listing.images[currentImage]}
              alt={listing.title}
              className="w-full h-full object-cover object-top"
            />
            {listing.images.length > 1 && (
              <>
                <button
                  onClick={prevImage}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full bg-white/90 hover:bg-white transition-colors cursor-pointer"
                >
                  <i className="ri-arrow-left-s-line text-charcoal/80" />
                </button>
                <button
                  onClick={nextImage}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center rounded-full bg-white/90 hover:bg-white transition-colors cursor-pointer"
                >
                  <i className="ri-arrow-right-s-line text-charcoal/80" />
                </button>
              </>
            )}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
              {listing.images.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentImage(i)}
                  className={`w-2 h-2 rounded-full transition-colors cursor-pointer ${i === currentImage ? 'bg-white' : 'bg-white/50'}`}
                />
              ))}
            </div>
            <span className="absolute top-3 left-3 text-xs font-bold text-white bg-black/50 px-2 py-0.5 rounded-full">
              {listing.property_type.charAt(0).toUpperCase() + listing.property_type.slice(1)}
            </span>
          </div>

          <div className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-lg font-bold text-charcoal">{listing.title}</h1>
                <p className="text-sm text-charcoal/60 flex items-center gap-1 mt-1">
                  <i className="ri-map-pin-line text-sm" /> {listing.location}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-lg font-bold text-amber-600">₹{listing.price.toLocaleString('en-IN')}</p>
                <p className="text-xs text-charcoal/40">per month</p>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-3 mt-4">
              {[
                { label: 'Bedrooms', value: listing.bedrooms === 0 ? 'Studio' : `${listing.bedrooms} BHK`, icon: 'ri-hotel-bed-line' },
                { label: 'Bathrooms', value: `${listing.bathrooms}`, icon: 'ri-drop-line' },
                { label: 'Area', value: `${listing.area} sqft`, icon: 'ri-ruler-line' },
                { label: 'Furnished', value: listing.furnished ? 'Yes' : 'No', icon: 'ri-sofa-line' },
              ].map((item) => (
                <div key={item.label} className="bg-offwhite rounded-xl p-3 text-center">
                  <div className="w-5 h-5 flex items-center justify-center mx-auto mb-1">
                    <i className={`${item.icon} text-xs text-amber-600`} />
                  </div>
                  <p className="text-sm font-bold text-charcoal">{item.value}</p>
                  <p className="text-[10px] text-charcoal/40">{item.label}</p>
                </div>
              ))}
            </div>

            {/* Amenities */}
            {listing.amenities && listing.amenities.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-bold text-charcoal mb-2">Amenities</h3>
                <div className="flex flex-wrap gap-2">
                  {listing.amenities.map((amenity) => (
                    <span
                      key={amenity}
                      className="text-xs font-medium px-2.5 py-1 rounded-full bg-lightgray text-charcoal/70"
                    >
                      {amenity}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Description */}
            {listing.description && (
              <div className="mt-4">
                <h3 className="text-sm font-bold text-charcoal mb-2">About this property</h3>
                <p className="text-sm text-charcoal/70 leading-relaxed">{listing.description}</p>
              </div>
            )}
          </div>
        </div>

        {/* Owner card */}
        <div className="bg-white rounded-3xl border border-black/5 p-5">
          <div className="flex items-center gap-3">
            <img
              src={listing.landlord_avatar}
              alt={listing.landlord_name}
              className="w-12 h-12 rounded-full object-cover flex-shrink-0"
            />
            <div className="flex-1">
              <p className="text-sm font-bold text-charcoal">{listing.landlord_name}</p>
              <p className="text-xs text-charcoal/60">Property Owner · Aadhaar Verified</p>
            </div>
            <div className="flex items-center gap-1 text-xs text-green-600 font-medium">
              <i className="ri-shield-check-fill text-sm" /> Verified
            </div>
          </div>
          <div className="mt-3 p-3 bg-offwhite rounded-xl">
            <p className="text-xs text-charcoal/60 leading-relaxed">
              <i className="ri-information-line text-amber-500 mr-1" />
              This owner uses Bhavan for all tenant communication. Your phone number stays private — chat happens securely inside the app.
            </p>
          </div>
        </div>

        {/* Rate limit warning on scan page */}
        {!contactRate.canSend && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-5 flex items-center gap-3">
            <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-red-100 flex-shrink-0">
              <i className="ri-error-warning-line text-xl text-red-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-red-700">Contact limit reached</p>
              <p className="text-xs text-red-600 mt-0.5">{contactRate.limitReason}</p>
              {contactRate.isServerEnforced && (
                <p className="text-xs text-charcoal/60 mt-0.5">This limit is enforced server-side and cannot be bypassed.</p>
              )}
            </div>
          </div>
        )}

        {/* Request to Connect CTA */}
        {userRequest ? (
          <div className="bg-white rounded-3xl border border-black/5 p-5 text-center">
            <button
              disabled
              className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-full text-sm font-semibold bg-lightgray text-charcoal/40 cursor-not-allowed whitespace-nowrap"
            >
              <i className="ri-user-add-line text-sm" />
              {hasApprovedRequest ? 'Request Approved' : hasDeclinedRequest ? 'Request Declined' : 'Request Sent'}
            </button>
            {hasPendingRequest && <p className="text-xs text-charcoal/40 mt-2">Waiting for the owner to respond.</p>}
          </div>
        ) : !submitted ? (
          <div className="bg-white rounded-3xl border border-black/5 p-5">
            {!showRequestForm ? (
              <div className="text-center">
                <h3 className="text-base font-bold text-charcoal mb-1">Interested in this property?</h3>
                <p className="text-sm text-charcoal/60 mb-4">Send a connection request. The owner will review and approve before you can chat.</p>

                {/* Rate-limit counter on scan landing */}
                <div className="mb-4 p-3 bg-amber-50 rounded-xl border border-amber-100">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-charcoal">
                      {contactRate.dailyRemaining} of {user ? 5 : 3} daily contacts remaining
                    </span>
                    <span className="text-xs font-semibold text-charcoal">
                      {contactRate.weeklyRemaining} of {user ? 20 : 10} weekly contacts remaining
                    </span>
                  </div>
                  {contactRate.isServerEnforced && (
                    <p className="text-xs text-green-600 mt-1 font-medium">· Server-enforced</p>
                  )}
                  {!contactRate.canSend && (
                    <p className="text-xs text-red-500 mt-1.5 flex items-start gap-1 text-left">
                      <i className="ri-error-warning-line flex-shrink-0 mt-0.5" />
                      {contactRate.limitReason}
                    </p>
                  )}
                </div>

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
                    setShowRequestForm(true);
                  }}
                  className={`w-full flex items-center justify-center gap-2 px-6 py-3 rounded-full text-sm font-semibold transition-colors whitespace-nowrap ${
                    brokerReport.isSoftBlocked || !contactRate.canSend
                      ? 'bg-lightgray text-charcoal/40 cursor-not-allowed'
                      : 'bg-amber-500 text-white hover:bg-amber-600 cursor-pointer'
                  }`}
                  disabled={brokerReport.isSoftBlocked || !contactRate.canSend}
                >
                  <i className="ri-user-add-line text-sm" />
                  {brokerReport.isSoftBlocked ? 'Account Restricted' : !contactRate.canSend ? 'Limit Reached' : 'Request to Connect'}
                </button>
                <button
                  onClick={() => navigate(`/listings/${listing.id}`)}
                  className="mt-3 text-xs font-medium text-amber-600 hover:text-amber-700 whitespace-nowrap"
                >
                  View full listing page →
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <h3 className="text-base font-bold text-charcoal mb-1">Request to Connect</h3>
                  <p className="text-xs text-charcoal/60">The owner will review your request and approve before you can chat. No phone number is shared.</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-charcoal/60 mb-1.5 uppercase tracking-wide">Your Name</label>
                  <input
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    required
                    className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                    placeholder="Enter your name"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-charcoal/60 mb-1.5 uppercase tracking-wide">Phone Number</label>
                  <input
                    type="tel"
                    value={formPhone}
                    onChange={(e) => { setFormPhone(formatIndianPhoneInput(e.target.value)); setFormPhoneError(''); }}
                    required
                    className={`w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 ${formPhoneError ? 'ring-2 ring-red-300' : 'focus:ring-amber-300'}`}
                    placeholder="+91 98765 43210"
                  />
                  {formPhoneError && <p className="text-xs text-red-500 mt-1">{formPhoneError}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-charcoal/60 mb-1.5 uppercase tracking-wide">Occupation</label>
                  <input
                    value={formOccupation}
                    onChange={(e) => setFormOccupation(e.target.value)}
                    className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                    placeholder="e.g. Software Engineer, Doctor, Student"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-charcoal/60 mb-1.5 uppercase tracking-wide">Preferred Move-in Date</label>
                  <input
                    value={formMoveIn}
                    onChange={(e) => setFormMoveIn(e.target.value)}
                    className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                    placeholder="e.g. May 2026, Immediate"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-charcoal/60 mb-1.5 uppercase tracking-wide">Message to Owner</label>
                  <textarea
                    value={formMessage}
                    onChange={(e) => setFormMessage(e.target.value)}
                    rows={3}
                    maxLength={500}
                    className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none"
                    placeholder="Hi, I'm interested in this property. Is it still available?"
                  />
                  <p className="text-[10px] text-charcoal/40 text-right mt-1">{formMessage.length}/500</p>
                </div>
                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowRequestForm(false)}
                    className="px-5 py-2.5 rounded-full border border-black/10 text-sm font-medium text-charcoal/60 hover:bg-lightgray transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={brokerReport.isSoftBlocked || !contactRate.canSend}
                    className={`flex-1 flex items-center justify-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-colors whitespace-nowrap ${
                      brokerReport.isSoftBlocked || !contactRate.canSend
                        ? 'bg-lightgray text-charcoal/40 cursor-not-allowed'
                        : 'bg-amber-500 text-white hover:bg-amber-600 cursor-pointer'
                    }`}
                  >
                    <i className="ri-send-plane-line text-sm" /> Send Request
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : (
          <div className="bg-green-50 border border-green-100 rounded-2xl p-6 text-center">
            <div className="w-14 h-14 flex items-center justify-center mx-auto mb-3 bg-green-100 rounded-full">
              <i className="ri-check-double-line text-2xl text-green-600" />
            </div>
            <h3 className="text-base font-bold text-green-800 mb-1">Request Sent!</h3>
            <p className="text-sm text-green-700 mb-4">The owner has been notified. Once they approve, you can start chatting through the Bhavan app.</p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => { setSubmitted(false); setShowRequestForm(false); setFormName(''); setFormPhone(''); setFormMessage(''); setFormMoveIn(''); setFormOccupation(''); }}
                className="px-5 py-2.5 rounded-full border border-green-200 text-sm font-medium text-green-700 hover:bg-green-100 transition-colors cursor-pointer whitespace-nowrap"
              >
                Send Another
              </button>
              <Link
                to="/listings"
                className="px-5 py-2.5 rounded-full bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors whitespace-nowrap"
              >
                Browse More
              </Link>
            </div>
          </div>
        )}

        {/* Schedule a Visit — only if request is approved */}
        {hasApprovedRequest && (
          <div className="bg-green-50 border border-green-100 rounded-2xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-green-100 flex-shrink-0">
                <i className="ri-calendar-schedule-line text-xl text-green-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-green-800">Owner Approved Your Request!</h3>
                <p className="text-xs text-green-600 mt-0.5">
                  {hasActiveVisitRequest ? 'Your visit request is waiting for the owner to confirm.' : 'You can now schedule a visit to tour this property.'}
                </p>
              </div>
            </div>
            {hasActiveVisitRequest ? (
              <div className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-white border border-green-200 text-green-700 text-sm font-semibold whitespace-nowrap cursor-not-allowed">
                <i className="ri-calendar-check-line text-sm" /> Visit Requested
              </div>
            ) : (
              <button
                onClick={() => setVisitOpen(true)}
                className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-full bg-green-600 text-white text-sm font-semibold hover:bg-green-700 transition-colors cursor-pointer whitespace-nowrap"
              >
                <i className="ri-calendar-check-line text-sm" /> Schedule a Visit
              </button>
            )}
          </div>
        )}

        {hasPendingRequest && (
          <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-amber-100 flex-shrink-0">
                <i className="ri-time-line text-xl text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-bold text-amber-800">Request Sent — Visit Locked for Now</p>
                <p className="text-xs text-amber-600 mt-0.5">Once the owner approves your request, you can schedule a visit.</p>
              </div>
            </div>
          </div>
        )}

        {hasDeclinedRequest && (
          <div className="bg-red-50 border border-red-100 rounded-2xl p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-red-100 flex-shrink-0">
                <i className="ri-close-circle-line text-xl text-red-500" />
              </div>
              <div>
                <p className="text-sm font-bold text-red-700">Request Not Approved</p>
                <p className="text-xs text-red-500 mt-0.5">This owner did not approve your request. Try browsing other listings.</p>
              </div>
            </div>
          </div>
        )}

        {/* App download nudge */}
        <div className="bg-white rounded-3xl border border-black/5 p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-amber-500 flex-shrink-0">
              <i className="ri-smartphone-line text-white text-lg" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-charcoal">Get the Bhavan App</p>
              <p className="text-xs text-charcoal/60 mt-0.5">Track your request status, manage viewings, and rent smarter.</p>
            </div>
            <button className="px-4 py-2 rounded-full bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600 transition-colors cursor-pointer whitespace-nowrap">
              Download
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center py-4">
          <p className="text-xs text-charcoal/40">
            Powered by <span className="font-semibold text-amber-600">Bhavan</span> · Safe & Verified Rentals
          </p>
        </div>
      </div>

      <SoftBlockModal
        open={softBlockModalOpen}
        onClose={() => setSoftBlockModalOpen(false)}
        tenantId={user?.id ?? ''}
        tenantName={user?.name ?? ''}
      />
    </div>
  );
}

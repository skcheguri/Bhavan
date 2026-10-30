import BiometricSetting from '@/components/feature/BiometricSetting';
import { humanizeDbError } from '@/lib/humanizeError';
import BlockedList from '@/components/feature/BlockedList';
import { partyName } from '@/hooks/useReviews';
import UserProfileModal from '@/components/feature/UserProfileModal';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { useOwnerRateLimit } from '@/hooks/useOwnerRateLimit';
import { getSupabase } from '@/lib/supabase';
import QRCodeModal from './components/QRCodeModal';
import PhoneVerifyModal from '@/components/feature/PhoneVerifyModal';
import DeleteAccountModal from '@/components/feature/DeleteAccountModal';
import EditListingModal from './components/EditListingModal';
import RentalAgreementModal from './components/RentalAgreementModal';
import SignAgreementModal from '@/components/feature/SignAgreementModal';
import { useRentalAgreements, agreementStatusMeta, getStampedAgreementUrl } from '@/hooks/useRentalAgreements';
import { useRentPayment } from '@/hooks/useRentPayment';
import { useOwnerMaintenanceRequests } from '@/hooks/useMaintenanceRequests';
import { useOwnerConnectionRequests } from '@/hooks/useConnectionRequests';
import NotificationBell from './components/NotificationBell';
import BookingsTab from './components/BookingsTab';
import PayoutAccountCard from './components/PayoutAccountCard';
import { useOwnerBookings } from '@/hooks/useVacationBookings';
import RequestsTab from './components/RequestsTab';
import SocietyIssuesCard from './components/SocietyIssuesCard';
import InquiriesTab from './components/InquiriesTab';
import ChatTab from './components/ChatTab';
import { useOwnerListings, type ListingFromDB } from '@/hooks/useListings';
import { useProperties } from '@/hooks/useProperties';
import { useSociety } from '@/hooks/useSociety';
import { isLandlord as computeIsLandlord } from '@/lib/occupancy';
import ChannelPreferences from '@/pages/notifications/components/ChannelPreferences';
import { useToast } from '@/hooks/useToast';
import AvatarPicker from '@/components/feature/AvatarPicker';
import {
  isValidName,
  isValidEmail,
  isValidPhone,
  formatPhoneInput,
  OCCUPATION_OPTIONS,
  MONTH_OPTIONS,
  daysInMonth,
  yearOptions,
  parseIsoDate,
  composeIsoDate,
} from '@/lib/validation';

type ProfileTab = 'overview' | 'listings' | 'bookings' | 'tenants' | 'inquiries' | 'messages' | 'requests' | 'documents' | 'billing' | 'settings';

const PROFILE_TABS: ProfileTab[] = ['overview', 'listings', 'bookings', 'tenants', 'inquiries', 'messages', 'requests', 'documents', 'billing', 'settings'];

function formatINR(num: number): string {
  return `\u20b9${num.toLocaleString('en-IN')}`;
}

export default function OwnerProfile() {
  const { user, updateProfile, sendPasswordResetEmail } = useAuth();
  const { isPro, plan, nextBillingDate, isInGracePeriod, isInTrial, trialDaysLeft, totalSpent, billingHistory } = useSubscription();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as ProfileTab | null;
  const [activeTab, setActiveTab] = useState<ProfileTab>(tabParam && PROFILE_TABS.includes(tabParam) ? tabParam : 'overview');
  // A new-message notification links to ?tab=messages&request=<id> so it
  // opens the conversation it is about, not just the Messages tab.
  const [activeChatRequestId, setActiveChatRequestId] = useState<string | null>(
    searchParams.get('request')
  );

  // Real data hooks for new users (empty initially)
  const { listings: myListingsFromDB, loading: listingsLoading, refresh: refreshListings } = useOwnerListings(user?.id);

  const [tenantProfileId, setTenantProfileId] = useState<string | null>(null);
  const [qrModalListing, setQrModalListing] = useState<ListingFromDB | null>(null);
  const [editModalListing, setEditModalListing] = useState<ListingFromDB | null>(null);
  const [deleteListing, setDeleteListing] = useState<ListingFromDB | null>(null);
  const [deletingListingId, setDeletingListingId] = useState<string | null>(null);
  const [togglingListingId, setTogglingListingId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const { addToast } = useToast();
  const { inquiry } = useOwnerRateLimit(user?.id);

  const [formName, setFormName] = useState(user?.name ?? '');
  const [formPhone, setFormPhone] = useState(user?.phone ?? '');
  const [formEmail, setFormEmail] = useState(user?.email ?? '');
  const [formDobDay, setFormDobDay] = useState('');
  const [formDobMonth, setFormDobMonth] = useState('');
  const [formDobYear, setFormDobYear] = useState('');
  const [formOccupation, setFormOccupation] = useState('');
  const [formOccupationOther, setFormOccupationOther] = useState('');
  const [formEmergency, setFormEmergency] = useState(user?.emergencyContact ?? '');
  const [nameError, setNameError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [phoneError, setPhoneError] = useState('');

  const [viewAgreementId, setViewAgreementId] = useState<string | null>(null);
  const [signAgreementId, setSignAgreementId] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const { agreements: rentalAgreements, markShared, sign: signAgreement } = useRentalAgreements(user?.id);
  const { properties } = useProperties(user?.id);
  const { memberships: societyMemberships } = useSociety(user?.id);
  const [showPhoneVerify, setShowPhoneVerify] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const { payments: allPayments } = useRentPayment();
  const { requests: maintenanceRequests } = useOwnerMaintenanceRequests(user?.id);
  const { requests: connectionRequests } = useOwnerConnectionRequests(user?.id);
  const { bookings: ownerBookings } = useOwnerBookings(user?.id);
  const pendingBookings = ownerBookings.filter((b) => b.status === 'pending').length;

  const initEditForm = () => {
    if (!user) return;
    setFormName(user.name);
    setFormPhone(user.phone ?? '');
    setFormEmail(user.email);
    const dob = parseIsoDate(user.dateOfBirth);
    setFormDobDay(dob.day);
    setFormDobMonth(dob.month);
    setFormDobYear(dob.year);
    if (user.occupation && !OCCUPATION_OPTIONS.includes(user.occupation as typeof OCCUPATION_OPTIONS[number])) {
      setFormOccupation('Other');
      setFormOccupationOther(user.occupation);
    } else {
      setFormOccupation(user.occupation ?? '');
      setFormOccupationOther('');
    }
    setFormEmergency(user.emergencyContact ?? '');
    setNameError('');
    setEmailError('');
    setPhoneError('');
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-offwhite flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 flex items-center justify-center mx-auto mb-4 bg-lightgray rounded-full">
            <i className="ri-user-line text-2xl text-charcoal/40" />
          </div>
          <h2 className="text-xl font-bold text-charcoal mb-2">Not signed in</h2>
          <p className="text-charcoal/60 text-sm mb-6">Please sign in to view your profile.</p>
          <Link to="/login" className="bg-brand text-white px-6 py-3 rounded-full text-sm font-medium hover:bg-brand-dark transition-colors whitespace-nowrap">
            Sign In
          </Link>
        </div>
      </div>
    );
  }


  const pendingInquiries = connectionRequests.filter((r) => r.status === 'pending').length;

  const handleSave = async () => {
    let hasError = false;
    if (!isValidName(formName)) {
      setNameError('Name can only contain letters and spaces.');
      hasError = true;
    } else {
      setNameError('');
    }
    if (!isValidEmail(formEmail)) {
      setEmailError('Enter a valid email address.');
      hasError = true;
    } else {
      setEmailError('');
    }
    if (formPhone && !isValidPhone(formPhone)) {
      // Owners may be NRIs abroad, so a non-+91 international number is valid
      // too (e.g. +1 415 555 0199). Phone stays optional either way.
      setPhoneError('Enter a valid phone number, e.g. +91 98765 43210 or +1 415 555 0199.');
      hasError = true;
    } else {
      setPhoneError('');
    }
    if (hasError) return;

    const dateOfBirth = composeIsoDate(formDobDay, formDobMonth, formDobYear);
    const occupation = formOccupation === 'Other' ? formOccupationOther.trim() : formOccupation;

    setSavingProfile(true);
    const { error, emailVerificationSent } = await updateProfile({
      name: formName.trim(),
      phone: formPhone,
      email: formEmail.trim(),
      dateOfBirth,
      occupation,
      emergencyContact: formEmergency,
    });
    setSavingProfile(false);

    if (error) {
      addToast(error, 'error');
      return;
    }

    setEditMode(false);
    if (emailVerificationSent) {
      addToast(`Profile updated. Confirm the link sent to ${formEmail.trim()} to finish changing your email.`, 'success');
    } else {
      addToast('Profile updated successfully', 'success');
    }
  };

  const handleChangePassword = async () => {
    if (!user) return;
    setSendingReset(true);
    const { error } = await sendPasswordResetEmail(user.email, `${window.location.origin}/reset-password`);
    setSendingReset(false);
    if (error) {
      addToast(error, 'error');
      return;
    }
    addToast(`Password reset link sent to ${user.email}`, 'success');
  };

  // Recurring rent from currently active tenancies, not just what's been
  // recorded as paid this month -- a listing sitting on a signed
  // agreement is real income even before this month's payment lands.
  // Real income needs a SIGNED agreement, and the tenancy runs through the
  // whole of the last day in local time -- parsing the YYYY-MM-DD bare gave
  // UTC midnight, so in IST a lease flipped to expired at 05:30 on its final
  // day and its rent dropped out of Monthly Income.
  const activeAgreements = rentalAgreements.filter(
    (a) => a.agreementStatus !== 'draft' && (!a.leaseEndDate || new Date(`${a.leaseEndDate}T23:59:59`).getTime() >= Date.now())
  );
  const monthlyIncomeAmount = activeAgreements.reduce((sum, a) => sum + a.monthlyRent, 0);
  const totalIncome = formatINR(monthlyIncomeAmount);
  const urgentRequests = maintenanceRequests.filter((r) => r.priority === 'high' && r.status !== 'resolved').length;
  const pendingRequests = maintenanceRequests.filter((r) => r.status === 'pending').length;

  // Only signed agreements are real tenancies; an unsigned draft is not an
  // "Active Tenant" and must not inflate the count/badge or show as Active.
  const tenantRows = rentalAgreements.filter((a) => a.agreementStatus !== 'draft').map((a) => {
    const agreementPayments = allPayments
      .filter((p) => p.agreement_id === a.id)
      .sort((x, y) => new Date(y.created_at).getTime() - new Date(x.created_at).getTime());
    const latestPayment = agreementPayments[0] ?? null;
    const leaseEnded = a.leaseEndDate ? new Date(`${a.leaseEndDate}T23:59:59`).getTime() < Date.now() : false;
    return {
      id: a.tenantId ?? a.id,
      agreementId: a.id,
      // Kept separate from `id`, which falls back to the agreement. An
      // agreement drafted before the tenant had an account has nobody to
      // open a profile for, and a row id would open a profile for
      // nobody.
      tenantId: a.tenantId ?? null,
      // rental_agreements.tenant_name is free text and on some rows it
      // holds an email, which then reads as a person's name in this
      // table. The account's real name would be better still, but this
      // hook is typed straight against the schema row on purpose (those
      // fields go into a legal document), so an embed here would trade a
      // compile-time guarantee for a nicety.
      name: partyName(a.tenantName, null) || 'Tenant',
      flat: a.flatNumber || '\u2014',
      property: a.propertyAddress || '\u2014',
      rent: formatINR(a.monthlyRent),
      leaseEnd: a.leaseEndDate ? new Date(`${a.leaseEndDate}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '\u2014',
      status: leaseEnded ? 'Expired' : 'Active',
      paymentStatus: latestPayment
        ? latestPayment.status === 'paid'
          ? 'Paid'
          : latestPayment.status === 'failed'
          ? 'Failed'
          : latestPayment.status === 'reconciled'
          ? 'Reconciled'
          : 'Pending'
        : 'No payments yet',
    };
  });

  const tabs: { id: ProfileTab; label: string; icon: string; badge?: number }[] = [
    { id: 'overview', label: 'Overview', icon: 'ri-home-4-line' },
    { id: 'listings', label: 'My Listings', icon: 'ri-list-check-3' },
    { id: 'bookings', label: 'Bookings', icon: 'ri-calendar-2-line', badge: pendingBookings },
    { id: 'tenants', label: 'Tenants', icon: 'ri-group-line', badge: tenantRows.length },
    { id: 'inquiries', label: 'Inquiries', icon: 'ri-message-3-line', badge: pendingInquiries },
    { id: 'messages', label: 'Messages', icon: 'ri-chat-3-line' },
    { id: 'requests', label: 'Requests', icon: 'ri-tools-line', badge: pendingRequests },
    { id: 'documents', label: 'Documents', icon: 'ri-folder-line' },
    { id: 'billing', label: 'Billing', icon: 'ri-bill-line' },
    { id: 'settings', label: 'Settings', icon: 'ri-settings-3-line' },
  ];

  const myListings = myListingsFromDB;
  // properties, not listings: a flat the owner lives in never had a
  // listing, and leaving it out made "Total Properties" disagree with
  // what they can see below.
  const totalProperties = properties.length ||
    new Set(myListingsFromDB.map((l) => l.property_id).filter(Boolean)).size;
  const activeListingsCount = myListings.filter((l) => l.status === 'active').length;

  const isLandlord = computeIsLandlord({
    activeListings: activeListingsCount,
    activeAgreements: activeAgreements.length,
  });

  const handleToggleActive = async (listing: ListingFromDB) => {
    const supabase = getSupabase();
    if (!supabase) return;
    const nextStatus = listing.status === 'active' ? 'inactive' : 'active';
    setTogglingListingId(listing.id);
    const { error } = await supabase.from('listings').update({ status: nextStatus }).eq('id', listing.id);
    setTogglingListingId(null);
    if (error) {
      addToast(`Failed to update listing: ${humanizeDbError(error.message)}`, 'error');
      return;
    }
    addToast(nextStatus === 'active' ? 'Listing activated' : 'Listing deactivated', 'success');
    refreshListings();
  };

  const handleDeleteListing = async () => {
    if (!deleteListing) return;
    const supabase = getSupabase();
    if (!supabase) return;
    setDeletingListingId(deleteListing.id);
    const { error } = await supabase.from('listings').delete().eq('id', deleteListing.id);
    setDeletingListingId(null);
    if (error) {
      addToast(`Failed to delete listing: ${humanizeDbError(error.message)}`, 'error');
      return;
    }
    addToast('Listing deleted successfully', 'success');
    setDeleteListing(null);
    refreshListings();
  };

  return (
    <div className="min-h-screen bg-offwhite pb-16">
      <div className="max-w-6xl mx-auto px-4 md:px-8">

        <QRCodeModal listing={qrModalListing} onClose={() => setQrModalListing(null)} />
        {tenantProfileId && (
          <UserProfileModal
            userId={tenantProfileId}
            roleLabel="Tenant"
            reviewRole="owner_on_renter"
            canReview
            onClose={() => setTenantProfileId(null)}
          />
        )}
        {showDeleteAccount && <DeleteAccountModal onClose={() => setShowDeleteAccount(false)} />}
        {showPhoneVerify && user.phone && (
          <PhoneVerifyModal
            phone={user.phone}
            onClose={() => setShowPhoneVerify(false)}
            onVerified={() => {
              setShowPhoneVerify(false);
              addToast('Phone number verified', 'success');
            }}
          />
        )}
        {viewAgreementId && (
          <RentalAgreementModal
            agreement={rentalAgreements.find((a) => a.id === viewAgreementId) ?? null}
            onClose={() => setViewAgreementId(null)}
          />
        )}
        {signAgreementId && (
          <SignAgreementModal
            agreementNumber={rentalAgreements.find((a) => a.id === signAgreementId)?.agreementNumber ?? ''}
            defaultName={rentalAgreements.find((a) => a.id === signAgreementId)?.landlordName ?? user?.name}
            party="landlord"
            busy={signing}
            onSign={async (name) => {
              setSigning(true);
              const { error } = await signAgreement(signAgreementId, name);
              setSigning(false);
              if (error) { addToast(error, 'error'); return; }
              addToast('You signed the agreement.', 'success');
              setSignAgreementId(null);
            }}
            onClose={() => setSignAgreementId(null)}
          />
        )}
        <EditListingModal
          listing={editModalListing}
          onClose={() => setEditModalListing(null)}
          onSave={() => { setEditModalListing(null); refreshListings(); }}
        />

        {/* Delete listing modal */}
        {deleteListing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteListing(null)} />
            <div className="relative bg-white rounded-2xl max-w-md w-full shadow-xl p-6">
              <div className="w-12 h-12 mx-auto rounded-full bg-red-100 flex items-center justify-center mb-4">
                <i className="ri-delete-bin-line text-red-500 text-xl" />
              </div>
              <h3 className="text-lg font-bold text-charcoal text-center mb-2">Delete Listing?</h3>
              <p className="text-sm text-charcoal/60 text-center mb-6">
                Are you sure you want to delete <strong className="text-charcoal">{deleteListing.title}</strong>? This action <strong>cannot be undone</strong>.
              </p>
              <div className="flex items-center gap-3">
                <button onClick={() => setDeleteListing(null)} className="flex-1 px-4 py-2.5 rounded-full border border-black/10 text-sm text-charcoal/60 hover:bg-lightgray transition-colors cursor-pointer whitespace-nowrap">Cancel</button>
                <button
                  onClick={handleDeleteListing}
                  disabled={deletingListingId === deleteListing.id}
                  className="flex-1 px-4 py-2.5 rounded-full bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
                >
                  {deletingListingId === deleteListing.id ? 'Deleting...' : 'Yes, Delete'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Profile Header */}
        <div className="bg-white rounded-2xl border border-black/5 overflow-hidden mb-6">
          <div className="h-32 md:h-44 relative overflow-hidden">
            <img
              src="/placeholders/photo.svg"
              alt="cover"
              className="w-full h-full object-cover object-top"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/30" />
          </div>

          <div className="px-6 pb-6">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 -mt-10 relative">
              <div className="flex items-end gap-4">
                <AvatarPicker name={user.name} avatar={user.avatar} tone="amber" />
                <div className="pb-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-xl font-bold text-charcoal">{user.name}</h1>
                    {user.verified && (
                      <span className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-600">
                        <i className="ri-shield-check-fill text-sm" /> Verified
                      </span>
                    )}
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">Property Owner</span>
                    {isPro && (
                      <span className="flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-amber-500 text-white">
                        <i className="ri-vip-crown-line text-[10px]" /> Pro
                      </span>
                    )}
                    {!isPro && (
                      <Link to="/subscription" className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-lightgray text-charcoal/60 hover:bg-amber-50 hover:text-amber-600 transition-colors">
                        <i className="ri-sparkling-line text-[10px]" /> Upgrade
                      </Link>
                    )}
                  </div>
                  <p className="text-sm text-charcoal/60 mt-0.5">Member since {user.joinedAt}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 pb-1">
                <NotificationBell />
                <Link to="/list-property" className="flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 transition-colors cursor-pointer whitespace-nowrap">
                  <i className="ri-add-line text-sm" /> List Property
                </Link>
              </div>
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
              {[
                { label: 'Total Properties', value: String(totalProperties), icon: 'ri-building-line', color: 'text-amber-600', tab: 'listings' as ProfileTab },
                ...(isLandlord
                  ? [
                      { label: 'Active Listings', value: String(activeListingsCount), icon: 'ri-list-check-3', color: 'text-brand', tab: 'listings' as ProfileTab },
                      { label: 'Monthly Income', value: totalIncome, icon: 'ri-money-rupee-circle-line', color: 'text-green-600', tab: 'tenants' as ProfileTab },
                    ]
                  : [
                      { label: societyMemberships.length === 1 ? 'My Society' : 'My Societies', value: String(societyMemberships.length), icon: 'ri-community-line', color: 'text-brand', tab: 'overview' as ProfileTab },
                      { label: 'Open Requests', value: String(pendingRequests), icon: 'ri-tools-line', color: 'text-charcoal/60', tab: 'requests' as ProfileTab },
                    ]),
                { label: 'Urgent Requests', value: String(urgentRequests), icon: 'ri-alarm-warning-line', color: urgentRequests > 0 ? 'text-red-500' : 'text-charcoal/40', tab: 'requests' as ProfileTab },
              ].map((stat) => (
                <button
                  key={stat.label}
                  onClick={() => setActiveTab(stat.tab)}
                  className="bg-offwhite rounded-xl p-3 text-left hover:bg-amber-50 transition-colors cursor-pointer"
                >
                  <div className="w-7 h-7 flex items-center justify-center mb-1.5">
                    <i className={`${stat.icon} text-base ${stat.color}`} />
                  </div>
                  <p className="text-sm font-bold text-charcoal">{stat.value}</p>
                  <p className="text-xs text-charcoal/60 mt-0.5">{stat.label}</p>
                </button>
              ))}
            </div>

          </div>
        </div>

        {/* Subscription banners */}
        {isInTrial && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3.5 mb-6 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-amber-100 flex-shrink-0">
                <i className="ri-vip-crown-line text-amber-600" />
              </div>
              <p className="text-sm font-semibold text-amber-700">
                Pro trial active — {trialDaysLeft} day{trialDaysLeft !== 1 ? 's' : ''} left. <Link to="/subscription" className="underline">Upgrade now</Link> to keep Pro access.
              </p>
            </div>
          </div>
        )}
        {isInGracePeriod && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-3.5 mb-6 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-100 flex-shrink-0">
                <i className="ri-error-warning-line text-red-600" />
              </div>
              <p className="text-sm font-semibold text-red-700">
                Payment failed — update your payment method within 7 days to keep Pro access.
              </p>
            </div>
            <Link to="/subscription" className="text-sm font-bold text-red-600 hover:text-red-700 whitespace-nowrap flex items-center gap-1">
              Update Payment <i className="ri-arrow-right-line" />
            </Link>
          </div>
        )}

        {/* Urgent alert */}
        {urgentRequests > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-3.5 mb-6 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-100 flex-shrink-0">
                <i className="ri-alarm-warning-line text-red-600" />
              </div>
              <p className="text-sm font-semibold text-red-700">
                {urgentRequests} urgent maintenance request{urgentRequests > 1 ? 's' : ''} need your attention
              </p>
            </div>
            <button onClick={() => setActiveTab('requests')} className="text-sm font-bold text-red-600 hover:text-red-700 whitespace-nowrap flex items-center gap-1 cursor-pointer">
              View Requests <i className="ri-arrow-right-line" />
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="sticky top-0 z-30 flex gap-1 bg-offwhite/90 backdrop-blur-md border-b border-black/5 py-2 mb-8 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setActiveChatRequestId(null); }}
              className={`relative flex items-center justify-center gap-2 px-5 py-3 rounded-full text-sm transition-colors cursor-pointer whitespace-nowrap flex-shrink-0 md:flex-1 ${
                activeTab === tab.id ? 'bg-brand text-white' : 'text-charcoal/60 hover:text-charcoal hover:bg-lightgray'
              }`}
            >
              <i className={`${tab.icon} text-sm`} />
              {tab.label}
              {tab.badge != null && tab.badge > 0 && (
                <span className={`ml-0.5 min-w-[18px] px-1.5 h-[18px] rounded-full text-[10px] font-semibold flex items-center justify-center tabular-nums ${activeTab === tab.id ? 'bg-white/25 text-white' : 'bg-lightgray text-charcoal/60'}`}>
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
              {/* Personal Info */}
              <div className="bg-white rounded-2xl border border-black/5 p-6 sm:p-7">
                <h2 className="text-base font-bold text-charcoal mb-4 flex items-center gap-2">
                  <div className="w-6 h-6 flex items-center justify-center">
                    <i className="ri-user-line text-amber-600" />
                  </div>
                  Personal Information
                  <button
                    onClick={() => {
                      if (!editMode) initEditForm();
                      setEditMode(!editMode);
                    }}
                    className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-black/10 text-xs font-medium text-charcoal hover:border-amber-400 hover:text-amber-600 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <i className={`${editMode ? 'ri-close-line' : 'ri-edit-line'} text-sm`} />
                    {editMode ? 'Cancel' : 'Edit'}
                  </button>
                </h2>
                {editMode ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-charcoal/60 mb-1.5 uppercase tracking-wide">Full Name</label>
                      <input
                        type="text"
                        value={formName}
                        onChange={(e) => setFormName(e.target.value.replace(/[^A-Za-z\s]/g, ''))}
                        className={`w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 ${nameError ? 'ring-2 ring-red-300' : 'focus:ring-amber-300'}`}
                      />
                      {nameError && <p className="text-xs text-red-500 mt-1">{nameError}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-charcoal/60 mb-1.5 uppercase tracking-wide">Email</label>
                      <input
                        type="email"
                        value={formEmail}
                        onChange={(e) => setFormEmail(e.target.value)}
                        className={`w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 ${emailError ? 'ring-2 ring-red-300' : 'focus:ring-amber-300'}`}
                      />
                      {emailError ? (
                        <p className="text-xs text-red-500 mt-1">{emailError}</p>
                      ) : formEmail !== user.email ? (
                        <p className="text-xs text-amber-600 mt-1">A verification link will be sent to confirm this change.</p>
                      ) : null}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-charcoal/60 mb-1.5 uppercase tracking-wide">Phone</label>
                      <input
                        type="tel"
                        value={formPhone}
                        onChange={(e) => setFormPhone(formatPhoneInput(e.target.value))}
                        placeholder="+91 98765 43210 or +1 415 555 0199"
                        className={`w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 ${phoneError ? 'ring-2 ring-red-300' : 'focus:ring-amber-300'}`}
                      />
                      {phoneError && <p className="text-xs text-red-500 mt-1">{phoneError}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-charcoal/60 mb-1.5 uppercase tracking-wide">Emergency Contact</label>
                      <input
                        type="text"
                        value={formEmergency}
                        onChange={(e) => setFormEmergency(e.target.value)}
                        className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-charcoal/60 mb-1.5 uppercase tracking-wide">Date of Birth</label>
                      <div className="grid grid-cols-3 gap-3">
                        <select value={formDobDay} onChange={(e) => setFormDobDay(e.target.value)} className="w-full px-3 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 cursor-pointer">
                          <option value="">Day</option>
                          {Array.from({ length: daysInMonth(Number(formDobMonth), Number(formDobYear)) }, (_, i) => i + 1).map((d) => (
                            <option key={d} value={String(d).padStart(2, '0')}>{d}</option>
                          ))}
                        </select>
                        <select value={formDobMonth} onChange={(e) => setFormDobMonth(e.target.value)} className="w-full px-3 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 cursor-pointer">
                          <option value="">Month</option>
                          {MONTH_OPTIONS.map((m) => (
                            <option key={m.value} value={m.value}>{m.label}</option>
                          ))}
                        </select>
                        <select value={formDobYear} onChange={(e) => setFormDobYear(e.target.value)} className="w-full px-3 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 cursor-pointer">
                          <option value="">Year</option>
                          {yearOptions(1900).map((y) => (
                            <option key={y} value={String(y)}>{y}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className={formOccupation === 'Other' ? '' : 'sm:col-span-2'}>
                      <label className="block text-xs font-semibold text-charcoal/60 mb-1.5 uppercase tracking-wide">Occupation</label>
                      <select value={formOccupation} onChange={(e) => setFormOccupation(e.target.value)} className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 cursor-pointer">
                        <option value="">Select occupation</option>
                        {OCCUPATION_OPTIONS.map((o) => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                    </div>
                    {formOccupation === 'Other' && (
                      <div>
                        <label className="block text-xs font-semibold text-charcoal/60 mb-1.5 uppercase tracking-wide">Specify Occupation</label>
                        <input
                          type="text"
                          value={formOccupationOther}
                          onChange={(e) => setFormOccupationOther(e.target.value)}
                          className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                        />
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-semibold text-charcoal/60 mb-1.5 uppercase tracking-wide">Aadhaar</label>
                      <div className="w-full px-4 py-3 bg-lightgray rounded-xl text-sm text-charcoal/40 flex items-center justify-between gap-2">
                        <span>{user.aadhaarLast4 ? `XXXX XXXX ${user.aadhaarLast4}` : 'Not verified'}</span>
                        {!user.aadhaarLast4 && (
                          <Link to="/aadhaar-verify" className="text-amber-600 font-semibold hover:text-amber-700 whitespace-nowrap">Verify</Link>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-charcoal/60 mb-1.5 uppercase tracking-wide">Member Since</label>
                      <div className="w-full px-4 py-3 bg-lightgray rounded-xl text-sm text-charcoal/40">{user.joinedAt}</div>
                    </div>
                    <div className="sm:col-span-2 flex items-center justify-end gap-3 pt-2">
                      <button
                        onClick={() => setEditMode(false)}
                        disabled={savingProfile}
                        className="px-5 py-2.5 rounded-full border border-black/10 text-sm font-medium text-charcoal/60 hover:bg-lightgray transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSave}
                        disabled={savingProfile}
                        className="flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
                      >
                        <i className={`${savingProfile ? 'ri-loader-4-line animate-spin' : 'ri-save-line'} text-sm`} />
                        {savingProfile ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-6">
                    {[
                      { label: 'Full Name', value: user.name, icon: 'ri-user-line' },
                      { label: 'Email', value: user.email, icon: 'ri-mail-line' },
                      { label: 'Phone', value: user.phone ?? 'Not added', icon: 'ri-phone-line' },
                      { label: 'Date of Birth', value: user.dateOfBirth ?? 'Not added', icon: 'ri-cake-line' },
                      { label: 'Occupation', value: user.occupation ?? 'Not added', icon: 'ri-briefcase-line' },
                      { label: 'Emergency Contact', value: user.emergencyContact ?? 'Not added', icon: 'ri-contacts-book-line' },
                      { label: 'Aadhaar', value: user.aadhaarLast4 ? `XXXX XXXX ${user.aadhaarLast4}` : 'Not verified', icon: 'ri-shield-user-line' },
                      { label: 'Member Since', value: user.joinedAt, icon: 'ri-time-line' },
                    ].map((field) => (
                      <div key={field.label}>
                        <p className="text-[13px] text-charcoal/50">{field.label}</p>
                        <p className="text-[15px] text-charcoal mt-1">{field.value}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right sidebar */}
            <div className="space-y-6">
              {/* Renders nothing unless this owner is an approved member of
                  a society, which is most owners. */}
              <SocietyIssuesCard userId={user.id} />

              {/* Verification */}
              <div className="bg-white rounded-2xl border border-black/5 p-6 sm:p-7">
                <h3 className="text-[15px] font-semibold text-charcoal mb-5">Verification Status</h3>
                <div className="space-y-3">
                  {[
                    { label: 'Email Verified', done: user.verifiedEmail, icon: 'ri-mail-check-line' },
                    { label: 'Phone Verified', done: user.verifiedPhone, icon: 'ri-smartphone-line' },
                    { label: 'Aadhaar Verified', done: user.verified, icon: 'ri-shield-check-line' },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <i className={`${item.icon} text-base ${item.done ? 'text-green-600' : 'text-charcoal/30'}`} />
                        <span className="text-[15px] text-charcoal">{item.label}</span>
                      </div>
                      {item.done ? (
                        <i className="ri-checkbox-circle-fill text-green-500 text-base" />
                      ) : item.label === 'Aadhaar Verified' ? (
                        <Link to="/aadhaar-verify" className="text-xs text-amber-600 font-semibold hover:text-amber-700 whitespace-nowrap">Verify</Link>
                      ) : item.label === 'Phone Verified' ? (
                        user.phone ? (
                          <button onClick={() => setShowPhoneVerify(true)} className="text-xs text-amber-600 font-semibold hover:text-amber-700 whitespace-nowrap cursor-pointer">Verify</button>
                        ) : (
                          <span className="text-xs text-charcoal/40 font-medium whitespace-nowrap">Add phone</span>
                        )
                      ) : (
                        <span className="text-xs text-charcoal/40 font-medium whitespace-nowrap">Pending</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick Actions */}
              <div className="bg-white rounded-2xl border border-black/5 p-6 sm:p-7">
                <h3 className="text-[15px] font-semibold text-charcoal mb-5">Quick Actions</h3>
                <div className="space-y-2">
                  {[
                    { to: '/list-property', icon: 'ri-home-4-line', label: 'List a Property', color: 'bg-amber-50 text-amber-600' },
                    { to: '/rent-payment', icon: 'ri-money-rupee-circle-line', label: 'Rent Payments', color: 'bg-red-50 text-red-500' },
                    { to: '/rental-agreements', icon: 'ri-file-list-3-line', label: 'Rental Agreements', color: 'bg-orange-50 text-orange-600' },
                    { to: '/rent-receipts', icon: 'ri-file-text-line', label: 'Rent Receipts', color: 'bg-orange-50 text-orange-600' },
                    { to: '/tax-forms', icon: 'ri-government-line', label: 'Tax Forms', color: 'bg-blue-50 text-blue-600' },
                    { to: '/feedback', icon: 'ri-star-line', label: 'View Reviews', color: 'bg-brand/10 text-brand' },
                  ].map((action) => (
                    <Link key={action.to} to={action.to} className="flex items-center gap-3 p-3 rounded-xl hover:bg-offwhite transition-colors cursor-pointer">
                      <div className={`w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0 ${action.color}`}>
                        <i className={`${action.icon} text-sm`} />
                      </div>
                      <span className="text-sm font-medium text-charcoal">{action.label}</span>
                      <div className="w-4 h-4 flex items-center justify-center ml-auto">
                        <i className="ri-arrow-right-s-line text-charcoal/40" />
                      </div>
                    </Link>
                  ))}
                </div>
              </div>

              {/* Pending actions */}
              {pendingRequests > 0 && (
                <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 flex items-center justify-center">
                      <i className="ri-notification-3-line text-amber-600" />
                    </div>
                    <h3 className="text-sm font-bold text-amber-800">Action Required</h3>
                  </div>
                  <p className="text-xs text-amber-700 leading-relaxed">
                    You have <strong>{pendingRequests} pending</strong> maintenance requests waiting for acknowledgement.
                  </p>
                  <button onClick={() => setActiveTab('requests')} className="mt-3 text-xs font-semibold text-amber-700 hover:text-amber-800 flex items-center gap-1 cursor-pointer whitespace-nowrap">
                    Review Now <i className="ri-arrow-right-line" />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'listings' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-charcoal">My Listings</h2>
                <p className="text-sm text-charcoal/60 mt-0.5">{activeListingsCount} of {myListings.length} listings active on Bhavan</p>
              </div>
              <Link to="/list-property" className="flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 transition-colors cursor-pointer whitespace-nowrap">
                <i className="ri-add-line text-sm" /> Add Listing
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {myListings.map((listing) => (
                <div key={listing.id} className="bg-white rounded-2xl border border-black/5 overflow-hidden hover:border-amber-200 transition group">
                  <div className="relative h-44 overflow-hidden">
                    <img src={listing.images[0]} alt={listing.title} className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                    <span className={`absolute top-3 left-3 flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${listing.status !== 'active' ? 'bg-gray-500 text-white' : 'bg-green-500 text-white'}`}>
                      <i className={`${listing.status !== 'active' ? 'ri-close-circle-fill' : 'ri-checkbox-circle-fill'} text-[10px]`} /> {listing.status !== 'active' ? 'Inactive' : 'Active'}
                    </span>
                    <div className="absolute top-3 right-3 flex items-center gap-1.5">
                      <button onClick={() => setEditModalListing(listing)} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/90 hover:bg-white transition-colors cursor-pointer">
                        <i className="ri-edit-line text-amber-600 text-sm" />
                      </button>
                      <button onClick={() => navigate(`/listings/${listing.id}`)} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/90 hover:bg-white transition-colors cursor-pointer">
                        <i className="ri-eye-line text-charcoal/70 text-sm" />
                      </button>
                    </div>
                    <div className="absolute bottom-3 left-3">
                      <span className="text-xs font-bold text-white bg-black/50 px-2 py-0.5 rounded-full">
                        {(listing.property_type ?? 'apartment').charAt(0).toUpperCase() + (listing.property_type ?? 'apartment').slice(1)}
                      </span>
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-bold text-charcoal leading-snug">{listing.title}</h3>
                      <p className="text-sm font-bold text-amber-600 whitespace-nowrap">₹{listing.price.toLocaleString('en-IN')}<span className="text-xs font-normal text-charcoal/40">/mo</span></p>
                    </div>
                    <p className="text-xs text-charcoal/60 flex items-center gap-1 mt-1">
                      <i className="ri-map-pin-line text-sm" /> {listing.location}
                    </p>
                    <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-50">
                      <span className="flex items-center gap-1 text-xs text-charcoal/60">
                        <i className="ri-hotel-bed-line text-sm" />{(listing.bedrooms ?? 0) === 0 ? 'Studio' : `${listing.bedrooms} BHK`}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-charcoal/60">
                        <i className="ri-drop-line text-sm" /> {listing.bathrooms ?? 1} Bath
                      </span>
                      <span className="flex items-center gap-1 text-xs text-charcoal/60">
                        <i className="ri-ruler-line text-sm" /> {listing.area_sqft ?? 0} sqft
                      </span>
                      {listing.furnished && (
                        <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                          <i className="ri-checkbox-circle-line text-sm" /> Furnished
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-3">
                      {[
                        { label: 'Views', value: String(listing.views_count ?? 0), icon: 'ri-eye-line' },
                        { label: 'Inquiries', value: String(listing.inquiries_count ?? 0), icon: 'ri-message-3-line' },
                        { label: 'Saves', value: String(listing.saves_count ?? 0), icon: 'ri-bookmark-line' },
                      ].map((stat) => (
                        <div key={stat.label} className="bg-offwhite rounded-xl p-2.5 text-center">
                          <div className="w-5 h-5 flex items-center justify-center mx-auto mb-1">
                            <i className={`${stat.icon} text-xs text-amber-600`} />
                          </div>
                          <p className="text-sm font-bold text-charcoal">{stat.value}</p>
                          <p className="text-[10px] text-charcoal/40">{stat.label}</p>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 mt-3">
                      <button onClick={() => setEditModalListing(listing)} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-black/10 text-xs font-medium text-charcoal hover:border-amber-400 hover:text-amber-600 transition-colors cursor-pointer whitespace-nowrap">
                        <i className="ri-edit-line text-sm" /> Edit
                      </button>
                      <button onClick={() => setQrModalListing(listing)} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-black/10 text-xs font-medium text-charcoal hover:border-amber-400 hover:text-amber-600 transition-colors cursor-pointer whitespace-nowrap">
                        <i className="ri-qr-code-line text-sm" /> QR Code
                      </button>
                      <button
                        onClick={() => handleToggleActive(listing)}
                        disabled={togglingListingId === listing.id}
                        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 ${listing.status !== 'active' ? 'border-green-100 text-green-600 hover:bg-green-50' : 'border-black/10 text-charcoal hover:border-amber-400 hover:text-amber-600'}`}
                      >
                        <i className={`${togglingListingId === listing.id ? 'ri-loader-4-line animate-spin' : listing.status !== 'active' ? 'ri-play-circle-line' : 'ri-pause-circle-line'} text-xs`} /> {listing.status !== 'active' ? 'Activate' : 'Deactivate'}
                      </button>
                      <button onClick={() => setDeleteListing(listing)} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-red-100 text-xs font-medium text-red-500 hover:bg-red-50 transition-colors cursor-pointer whitespace-nowrap">
                        <i className="ri-delete-bin-line text-sm" /> Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {/* Must check loading before showing the empty state -- a
                landlord with real properties was otherwise told "No
                listings yet" for the whole fetch, then watched them
                appear. */}
            {listingsLoading && myListings.length === 0 && (
              <div className="bg-white rounded-2xl border border-black/5 p-12 text-center text-sm text-charcoal/40">
                Loading your listings…
              </div>
            )}
            {!listingsLoading && myListings.length === 0 && (
              <div className="bg-white rounded-2xl border border-black/5 p-12 text-center">
                <div className="w-14 h-14 flex items-center justify-center mx-auto mb-4 bg-amber-50 rounded-full">
                  <i className="ri-home-4-line text-2xl text-amber-500" />
                </div>
                <h3 className="text-base font-bold text-charcoal mb-2">No listings yet</h3>
                <p className="text-sm text-charcoal/60 mb-5">List your property to start receiving tenant inquiries.</p>
                <Link to="/list-property" className="bg-amber-500 text-white px-6 py-2.5 rounded-full text-sm font-medium hover:bg-amber-600 transition-colors whitespace-nowrap">
                  List a Property
                </Link>
              </div>
            )}
          </div>
        )}

        {activeTab === 'tenants' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-charcoal">Active Tenants ({tenantRows.length})</h2>
            </div>
            <div className="bg-white rounded-2xl border border-black/5 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px]">
                  <thead>
                    <tr className="border-b border-black/5">
                      <th className="text-left px-5 py-3.5 text-xs font-semibold text-charcoal/40 uppercase tracking-wide">Tenant</th>
                      <th className="text-left px-5 py-3.5 text-xs font-semibold text-charcoal/40 uppercase tracking-wide">Flat</th>
                      <th className="text-left px-5 py-3.5 text-xs font-semibold text-charcoal/40 uppercase tracking-wide">Property</th>
                      <th className="text-left px-5 py-3.5 text-xs font-semibold text-charcoal/40 uppercase tracking-wide">Rent</th>
                      <th className="text-left px-5 py-3.5 text-xs font-semibold text-charcoal/40 uppercase tracking-wide">Lease End</th>
                      <th className="text-left px-5 py-3.5 text-xs font-semibold text-charcoal/40 uppercase tracking-wide">Status</th>
                      <th className="text-left px-5 py-3.5 text-xs font-semibold text-charcoal/40 uppercase tracking-wide">Payment</th>
                      <th className="text-left px-5 py-3.5 text-xs font-semibold text-charcoal/40 uppercase tracking-wide">Agreement</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenantRows.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-5 py-10 text-center text-sm text-charcoal/40">
                          No active tenants yet. Tenants appear here once you share a rental agreement with them.
                        </td>
                      </tr>
                    ) : (
                      tenantRows.map((t) => {
                        const payColors: Record<string, string> = {
                          Paid: 'bg-green-50 text-green-600',
                          Failed: 'bg-red-50 text-red-600',
                          Reconciled: 'bg-blue-50 text-blue-600',
                          Pending: 'bg-amber-50 text-amber-600',
                          'No payments yet': 'bg-lightgray text-charcoal/40',
                        };
                        return (
                          <tr key={t.agreementId} className="border-b border-gray-50 last:border-0 hover:bg-offwhite transition-colors">
                            <td className="px-5 py-4">
                              {/* Same profile view as Inquiries and
                                  Messages. This is the list where an
                                  owner is most likely to want it -- these
                                  are the people actually living in their
                                  flats.

                                  Avatar and name are one button rather
                                  than two: a picture of a person next to
                                  a clickable name reads as part of the
                                  same control, and clicking it and
                                  getting nothing just looks broken. */}
                              {t.tenantId ? (
                                <button
                                  onClick={() => setTenantProfileId(t.tenantId)}
                                  className="flex items-center gap-3 group text-left"
                                  aria-label={`View ${t.name}'s profile`}
                                >
                                  <span className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                                    <span className="text-xs font-bold text-amber-600">{t.name[0]}</span>
                                  </span>
                                  <span className="text-sm font-semibold text-charcoal group-hover:text-brand transition-colors">
                                    {t.name}
                                  </span>
                                </button>
                              ) : (
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                                    <span className="text-xs font-bold text-amber-600">{t.name[0]}</span>
                                  </div>
                                  <p className="text-sm font-semibold text-charcoal">{t.name}</p>
                                </div>
                              )}
                            </td>
                            <td className="px-5 py-4 text-sm text-charcoal font-medium">{t.flat}</td>
                            <td className="px-5 py-4 text-sm text-charcoal/60">{t.property}</td>
                            <td className="px-5 py-4 text-sm font-bold text-charcoal">{t.rent}</td>
                            <td className="px-5 py-4 text-sm text-charcoal/60">{t.leaseEnd}</td>
                            <td className="px-5 py-4">
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${t.status === 'Active' ? 'bg-green-50 text-green-600' : 'bg-lightgray text-charcoal/40'}`}>
                                {t.status}
                              </span>
                            </td>
                            <td className="px-5 py-4">
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${payColors[t.paymentStatus] ?? 'bg-amber-50 text-amber-600'}`}>
                                {t.paymentStatus}
                              </span>
                            </td>
                            <td className="px-5 py-4">
                              <button onClick={() => setViewAgreementId(t.agreementId)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-200 text-xs font-medium text-amber-700 hover:bg-amber-50 transition-colors cursor-pointer whitespace-nowrap">
                                <i className="ri-file-text-line text-sm" /> View
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'bookings' && (
          <BookingsTab
            ownerId={user?.id}
            onMessageGuest={(tenantId, listingId) => {
              // The thread is the approved connection request migration
              // 127 guarantees for every confirmed booking.
              const thread = connectionRequests.find(
                (r) => r.prospectId === tenantId && r.listingId === listingId && r.status === 'approved'
              );
              if (thread) {
                setActiveChatRequestId(thread.id);
                setActiveTab('messages');
              } else {
                addToast('Chat thread not ready yet — refresh and try again.', 'error');
              }
            }}
          />
        )}

        {activeTab === 'inquiries' && <InquiriesTab onOpenChat={(id) => { setActiveChatRequestId(id); setActiveTab('messages'); }} />}

        {activeTab === 'messages' && <ChatTab initialRequestId={activeChatRequestId} />}

        {activeTab === 'requests' && <RequestsTab />}

        {activeTab === 'documents' && (
          <div className="space-y-6">
            {/* Generator Tools */}
            <div>
              <h2 className="text-base font-bold text-charcoal mb-4">Document Tools</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { to: '/rental-agreements', icon: 'ri-file-list-3-line', label: 'Rental Agreement Generator', desc: 'Create & share legally valid rental agreements', color: 'bg-orange-50 text-orange-600' },
                  { to: '/rent-receipts', icon: 'ri-file-text-line', label: 'Rent Receipt Generator', desc: 'Generate formatted rent receipts instantly', color: 'bg-amber-50 text-amber-600' },
                  { to: '/tax-forms', icon: 'ri-government-line', label: 'Tax & Legal Forms', desc: 'Income tax, TDS & HRA declaration forms', color: 'bg-teal-50 text-teal-600' },
                ].map((tool) => (
                  <Link key={tool.to} to={tool.to} className="bg-white rounded-2xl border border-black/5 p-6 sm:p-7 hover:border-amber-200 transition group">
                    <div className={`w-10 h-10 flex items-center justify-center rounded-xl mb-3 ${tool.color}`}>
                      <i className={`${tool.icon} text-lg`} />
                    </div>
                    <h3 className="text-sm font-bold text-charcoal mb-1">{tool.label}</h3>
                    <p className="text-xs text-charcoal/60 leading-relaxed">{tool.desc}</p>
                    <div className="mt-3 flex items-center gap-1 text-xs font-semibold text-amber-600 group-hover:text-amber-700">
                      Open Tool <i className="ri-arrow-right-line" />
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            {/* Agreements */}
            <div>
              <h2 className="text-base font-bold text-charcoal mb-4">Rental Agreements</h2>
              {rentalAgreements.length === 0 ? (
                <div className="bg-white rounded-2xl border border-black/5 p-10 text-center">
                  <div className="w-14 h-14 flex items-center justify-center mx-auto mb-4 bg-amber-50 rounded-full">
                    <i className="ri-file-list-3-line text-2xl text-amber-500" />
                  </div>
                  <h3 className="text-base font-bold text-charcoal mb-2">No agreements yet</h3>
                  <p className="text-sm text-charcoal/60 mb-5">Generate your first rental agreement using the tool above.</p>
                  <Link to="/rental-agreements" className="bg-amber-500 text-white px-6 py-2.5 rounded-full text-sm font-medium hover:bg-amber-600 transition-colors whitespace-nowrap">
                    Create Agreement
                  </Link>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-black/5 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px]">
                      <thead>
                        <tr className="border-b border-black/5">
                          <th className="text-left px-5 py-3.5 text-xs font-semibold text-charcoal/40 uppercase tracking-wide">Agreement #</th>
                          <th className="text-left px-5 py-3.5 text-xs font-semibold text-charcoal/40 uppercase tracking-wide">Tenant</th>
                          <th className="text-left px-5 py-3.5 text-xs font-semibold text-charcoal/40 uppercase tracking-wide">Property</th>
                          <th className="text-left px-5 py-3.5 text-xs font-semibold text-charcoal/40 uppercase tracking-wide">Lease Period</th>
                          <th className="text-left px-5 py-3.5 text-xs font-semibold text-charcoal/40 uppercase tracking-wide">Rent</th>
                          <th className="text-left px-5 py-3.5 text-xs font-semibold text-charcoal/40 uppercase tracking-wide">Status</th>
                          <th className="text-left px-5 py-3.5 text-xs font-semibold text-charcoal/40 uppercase tracking-wide">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rentalAgreements.map((ag) => (
                          <tr key={ag.id} className="border-b border-gray-50 last:border-0 hover:bg-offwhite transition-colors">
                            <td className="px-5 py-4 text-sm font-medium text-charcoal">{ag.agreementNumber}</td>
                            <td className="px-5 py-4 text-sm text-charcoal">{ag.tenantName}</td>
                            <td className="px-5 py-4 text-sm text-charcoal/60">{ag.propertyAddress}</td>
                            <td className="px-5 py-4 text-sm text-charcoal/60">{ag.leaseStartDate} – {ag.leaseEndDate}</td>
                            <td className="px-5 py-4 text-sm font-bold text-charcoal">{formatINR(ag.monthlyRent)}</td>
                            <td className="px-5 py-4">
                              {(() => {
                                const meta = agreementStatusMeta(ag.agreementStatus);
                                return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${meta.cls}`}>{meta.label}</span>;
                              })()}
                            </td>
                            <td className="px-5 py-4">
                              <div className="flex items-center gap-2 flex-wrap">
                                <button
                                  onClick={() => setViewAgreementId(ag.id)}
                                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-black/10 text-xs font-medium text-charcoal hover:border-amber-400 hover:text-amber-600 transition-colors cursor-pointer whitespace-nowrap"
                                >
                                  <i className="ri-eye-line text-sm" /> View
                                </button>
                                {ag.agreementStatus === 'draft' && !ag.signedByLandlord && (
                                  <button
                                    onClick={() => setSignAgreementId(ag.id)}
                                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-brand/30 text-xs font-medium text-brand hover:bg-brand/5 transition-colors cursor-pointer whitespace-nowrap"
                                  >
                                    <i className="ri-quill-pen-line text-sm" /> Sign
                                  </button>
                                )}
                                {ag.stampedDocumentPath && (
                                  <button
                                    onClick={async () => {
                                      const url = await getStampedAgreementUrl(ag.stampedDocumentPath!);
                                      if (url) window.open(url, '_blank');
                                      else addToast('Could not open the stamped document.', 'error');
                                    }}
                                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-emerald-200 text-xs font-medium text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer whitespace-nowrap"
                                  >
                                    <i className="ri-file-download-line text-sm" /> Stamped
                                  </button>
                                )}
                                {(ag.agreementStatus === 'stamped' || ag.agreementStatus === 'signed') && (
                                  <button
                                    onClick={async () => {
                                      const { error } = await markShared(ag.id);
                                      addToast(error ?? 'Agreement shared with tenant', error ? 'error' : 'success');
                                    }}
                                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-amber-200 text-xs font-medium text-amber-700 hover:bg-amber-50 transition-colors cursor-pointer whitespace-nowrap"
                                  >
                                    <i className="ri-share-forward-line text-sm" /> Share
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'billing' && (
          <div className="max-w-4xl space-y-6">
            <PayoutAccountCard userId={user?.id} />
            {/* Plan Summary */}
            <div className="bg-white rounded-2xl border border-black/5 p-6 sm:p-7">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
                <div>
                  <h2 className="text-base font-bold text-charcoal">Current Plan</h2>
                  <p className="text-sm text-charcoal/60 mt-0.5">
                    {isPro ? `Pro (${plan === 'pro_monthly' ? 'Monthly' : 'Annual'})` : 'Free Forever'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {isPro ? (
                    // Pro is a one-time purchase that simply ends at the
                    // paid-through date -- there is no cancel-at-period-end
                    // path, so the badge that keyed on status==='cancelled'
                    // (which also makes isPro false) was unreachable. Just
                    // the Active badge.
                    <span className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-green-50 text-green-600">
                      <i className="ri-checkbox-circle-fill text-sm" /> Active
                    </span>
                  ) : (
                    <Link to="/subscription" className="px-4 py-2 rounded-full bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 transition-colors whitespace-nowrap">
                      Upgrade to Pro
                    </Link>
                  )}
                </div>
              </div>

              {isPro && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-offwhite rounded-xl p-4">
                    <p className="text-xs text-charcoal/40 font-medium">Pro Access Until</p>
                    <p className="text-sm font-bold text-charcoal mt-1">
                      {nextBillingDate ? new Date(nextBillingDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}
                    </p>
                  </div>
                  <div className="bg-offwhite rounded-xl p-4">
                    <p className="text-xs text-charcoal/40 font-medium">Total Spent</p>
                    <p className="text-sm font-bold text-charcoal mt-1">₹{(totalSpent / 100).toLocaleString('en-IN')}</p>
                  </div>
                  <div className="bg-offwhite rounded-xl p-4">
                    <p className="text-xs text-charcoal/40 font-medium">Renewal</p>
                    <p className="text-sm font-bold text-charcoal mt-1">Manual</p>
                    <p className="text-[11px] text-charcoal/40 mt-0.5">No auto-charge — renew anytime from the Plans page.</p>
                  </div>
                </div>
              )}

              {!isPro && (
                <div className="bg-offwhite rounded-xl p-4 flex items-center gap-3">
                  <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-amber-50">
                    <i className="ri-sparkling-line text-sm text-amber-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-charcoal">Unlock Pro Features</p>
                    <p className="text-xs text-charcoal/60">Unlimited listings, analytics, bulk receipts, and priority support.</p>
                  </div>
                  <Link to="/subscription" className="ml-auto px-4 py-2 rounded-full bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 transition-colors whitespace-nowrap">
                    View Plans
                  </Link>
                </div>
              )}
            </div>

            {/* Invoice History */}
            <div className="bg-white rounded-2xl border border-black/5 p-6 sm:p-7">
              <h2 className="text-base font-bold text-charcoal mb-4">Billing History</h2>
              {billingHistory.length === 0 ? (
                <div className="text-center py-10">
                  <div className="w-14 h-14 flex items-center justify-center mx-auto mb-4 bg-lightgray rounded-full">
                    <i className="ri-bill-line text-2xl text-charcoal/40" />
                  </div>
                  <p className="text-sm text-charcoal/60">No invoices yet. They will appear here after your first payment.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px]">
                    <thead>
                      <tr className="border-b border-black/5">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-charcoal/40 uppercase tracking-wide">Invoice #</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-charcoal/40 uppercase tracking-wide">Plan</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-charcoal/40 uppercase tracking-wide">Period</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-charcoal/40 uppercase tracking-wide">Amount</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-charcoal/40 uppercase tracking-wide">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {billingHistory.map((inv) => (
                        <tr key={inv.id} className="border-b border-gray-50 last:border-0 hover:bg-offwhite transition-colors">
                          <td className="px-4 py-3.5 text-sm font-medium text-charcoal">{inv.invoice_number}</td>
                          <td className="px-4 py-3.5 text-sm text-charcoal/60">
                            {({ pro_monthly: 'Pro Monthly', pro_annual: 'Pro Annual', society_annual: 'Society Annual' } as Record<string, string>)[inv.plan] ?? inv.plan}
                          </td>
                          <td className="px-4 py-3.5 text-sm text-charcoal/60">
                            {new Date(inv.billing_period_start).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                          </td>
                          <td className="px-4 py-3.5 text-sm font-bold text-charcoal">
                            ₹{(inv.total_amount / 100).toLocaleString('en-IN')}
                          </td>
                          <td className="px-4 py-3.5">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                              inv.status === 'paid' ? 'bg-green-50 text-green-600' :
                              inv.status === 'failed' ? 'bg-red-50 text-red-600' :
                              inv.status === 'refunded' ? 'bg-amber-50 text-amber-600' :
                              'bg-lightgray text-charcoal/60'
                            }`}>
                              {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Subscription Settings -- Pro is a one-time payment, so
                there's no recurring charge to cancel; the plan simply
                ends at the paid-through date unless renewed. */}
            {isPro && (
              <div className="bg-white rounded-2xl border border-black/5 p-6 sm:p-7">
                <h2 className="text-base font-bold text-charcoal mb-4">Subscription Settings</h2>
                <div className="bg-offwhite rounded-xl p-4 flex items-start gap-3">
                  <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-green-50 flex-shrink-0">
                    <i className="ri-information-line text-sm text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-charcoal">Nothing to cancel — you're never auto-charged</p>
                    <p className="text-xs text-charcoal/60 mt-0.5">
                      Your Pro plan is a one-time payment and simply ends on the date above unless you renew.
                      For a refund within 7 days of purchase, <Link to="/contact" className="text-amber-600 font-medium hover:text-amber-700">contact support</Link>.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="max-w-2xl space-y-6">
            <div className="bg-white rounded-2xl border border-black/5 p-6 sm:p-7">
              <h2 className="text-base font-bold text-charcoal mb-4 flex items-center gap-2">
                <div className="w-6 h-6 flex items-center justify-center">
                  <i className="ri-signal-tower-line text-amber-600" />
                </div>
                Notifications
              </h2>
              <p className="text-sm text-charcoal/60 mb-4">
                Choose how you receive each type of notification. For now notifications are push-only; SMS and email are coming soon.
              </p>
              <ChannelPreferences />
            </div>

            <div className="bg-white rounded-2xl border border-black/5 p-6 sm:p-7">
              <BlockedList />
            </div>

            <div className="bg-white rounded-2xl border border-black/5 p-6 sm:p-7">
              <h2 className="text-base font-bold text-charcoal mb-4">Security</h2>
              <BiometricSetting />
              <button
                onClick={handleChangePassword}
                disabled={sendingReset}
                className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-offwhite transition-colors cursor-pointer disabled:opacity-60"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-amber-50">
                    <i className="ri-lock-password-line text-sm text-amber-600" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-charcoal">Change Password</p>
                    <p className="text-xs text-charcoal/40">{sendingReset ? 'Sending link...' : `We'll email a secure reset link to ${user.email}`}</p>
                  </div>
                </div>
                <i className="ri-arrow-right-s-line text-charcoal/40" />
              </button>
            </div>

            {/* Activity Rate Limits */}
            <div className="bg-white rounded-2xl border border-black/5 p-6 sm:p-7">
              <h2 className="text-base font-bold text-charcoal mb-4 flex items-center gap-2">
                <div className="w-6 h-6 flex items-center justify-center">
                  <i className="ri-shield-check-line text-amber-600" />
                </div>
                Activity Rate Limits
              </h2>
              <p className="text-sm text-charcoal/60 mb-4">
                These limits prevent spam and ensure fair usage across the platform. All limits reset automatically.
              </p>
              <div className="space-y-4">
                {/* Inquiry Responses */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 flex items-center justify-center rounded-lg bg-blue-50">
                        <i className="ri-message-3-line text-xs text-blue-600" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-charcoal">Inquiry Responses</p>
                        <p className="text-[11px] text-charcoal/40">Approve or decline connection requests</p>
                      </div>
                    </div>
                    <span className={`text-xs font-bold ${inquiry.canSend ? 'text-green-600' : 'text-red-500'}`}>
                      {inquiry.dailyRemaining} / 50 daily
                    </span>
                  </div>
                  <div className="w-full bg-lightgray rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition ${inquiry.dailyRemaining === 0 ? 'bg-red-500' : 'bg-blue-500'}`}
                      style={{ width: `${inquiry.dailyCount + inquiry.dailyRemaining > 0 ? (inquiry.dailyRemaining / (inquiry.dailyRemaining + inquiry.dailyCount)) * 100 : 0}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-charcoal/40 mt-1">{inquiry.weeklyRemaining} / 200 weekly remaining</p>
                </div>

              </div>
            </div>

            <div className="bg-white rounded-2xl border border-red-100 p-6">
              <h2 className="text-base font-bold text-red-600 mb-4">Danger Zone</h2>
              <button
                onClick={() => setShowDeleteAccount(true)}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-red-100 hover:bg-red-50 transition-colors cursor-pointer text-left"
              >
                <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-50 flex-shrink-0">
                  <i className="ri-delete-bin-line text-sm text-red-500" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-red-600">Delete Account</p>
                  <p className="text-xs text-charcoal/40">Permanently erase your personal data -- takes effect immediately</p>
                </div>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

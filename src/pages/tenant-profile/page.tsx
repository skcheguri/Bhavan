import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { useSavedListings } from '@/hooks/useListings';
import NotificationBell from '@/pages/owner-profile/components/NotificationBell';
import PhoneVerifyModal from '@/components/feature/PhoneVerifyModal';
import DeleteAccountModal from '@/components/feature/DeleteAccountModal';
import { useToast } from '@/hooks/useToast';
import TenantInquiriesTab from './components/TenantInquiriesTab';
import TenantChatTab from './components/TenantChatTab';
import RentManagementTab from './components/RentManagementTab';
import MyReviewsTab from './components/MyReviewsTab';
import { useTenantRentalAgreements } from '@/hooks/useRentalAgreements';

import { useBrokerReport } from '@/hooks/useBrokerReport';
import { useMaintenanceRequests } from '@/hooks/useMaintenanceRequests';
import ChannelPreferences from '@/pages/notifications/components/ChannelPreferences';
import SoftBlockModal from '@/pages/listing-detail/components/SoftBlockModal';
import {
  isValidName,
  isValidEmail,
  isValidIndianPhone,
  formatIndianPhoneInput,
  OCCUPATION_OPTIONS,
  MONTH_OPTIONS,
  daysInMonth,
  yearOptions,
  parseIsoDate,
  composeIsoDate,
} from '@/lib/validation';

type ProfileTab = 'overview' | 'saved' | 'inquiries' | 'messages' | 'rentManagement' | 'reviews' | 'settings';

const PROFILE_TABS: ProfileTab[] = ['overview', 'saved', 'inquiries', 'messages', 'rentManagement', 'reviews', 'settings'];

function leaseCountdown(leaseEndDate: string, noticePeriodDays: number) {
  const end = new Date(`${leaseEndDate}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysLeft = Math.max(0, Math.round((end.getTime() - today.getTime()) / 86400000));
  const monthsLeft = Math.max(0, Math.round(daysLeft / 30));
  const renewBy = new Date(end);
  renewBy.setDate(renewBy.getDate() - (noticePeriodDays || 30));
  return {
    daysLeft,
    monthsLeft,
    renewByLabel: renewBy.toLocaleDateString('en-IN', { month: 'short' }),
  };
}

function formatLeaseDate(dateStr: string) {
  if (!dateStr) return 'Not set';
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function TenantProfile() {
  const { user, updateProfile, sendPasswordResetEmail } = useAuth();
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as ProfileTab | null;
  const subParam = searchParams.get('sub');
  const [activeTab, setActiveTab] = useState<ProfileTab>(tabParam && PROFILE_TABS.includes(tabParam) ? tabParam : 'overview');
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [leaseModalOpen, setLeaseModalOpen] = useState(false);
  const { addToast } = useToast();
  const { agreements: rentalAgreements } = useTenantRentalAgreements(user?.id);
  const activeAgreement = rentalAgreements[0];
  const { listings: savedListingsFromDB, loading: savedLoading, refresh: refreshSaved } = useSavedListings(user?.id);
  const brokerReport = useBrokerReport(user?.id);
  const [softBlockModalOpen, setSoftBlockModalOpen] = useState(false);
  const [showPhoneVerify, setShowPhoneVerify] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [activeChatRequestId, setActiveChatRequestId] = useState<string | null>(null);

  const { requests: maintRequestsFromDB } = useMaintenanceRequests(user?.id);

  const [formName, setFormName] = useState(user?.name ?? '');
  const [formPhone, setFormPhone] = useState(user?.phone ?? '');
  const [formEmail, setFormEmail] = useState(user?.email ?? '');
  const [formDobDay, setFormDobDay] = useState('');
  const [formDobMonth, setFormDobMonth] = useState('');
  const [formDobYear, setFormDobYear] = useState('');
  const [formOccupation, setFormOccupation] = useState('');
  const [formOccupationOther, setFormOccupationOther] = useState('');
  const [formEmergency, setFormEmergency] = useState(user?.emergencyContact ?? '');
  const [formMoveInDay, setFormMoveInDay] = useState('');
  const [formMoveInMonth, setFormMoveInMonth] = useState('');
  const [formMoveInYear, setFormMoveInYear] = useState('');
  const [formFlat, setFormFlat] = useState(user?.currentFlat ?? '');
  const [nameError, setNameError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [phoneError, setPhoneError] = useState('');

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
    const moveIn = parseIsoDate(user.moveInDate);
    setFormMoveInDay(moveIn.day);
    setFormMoveInMonth(moveIn.month);
    setFormMoveInYear(moveIn.year);
    setFormFlat(user.currentFlat ?? '');
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

  const initials = user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();

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
    if (formPhone && !isValidIndianPhone(formPhone)) {
      setPhoneError('Enter a valid 10-digit Indian mobile number.');
      hasError = true;
    } else {
      setPhoneError('');
    }
    if (hasError) return;

    const dateOfBirth = composeIsoDate(formDobDay, formDobMonth, formDobYear);
    const moveInDate = composeIsoDate(formMoveInDay, formMoveInMonth, formMoveInYear);
    const occupation = formOccupation === 'Other' ? formOccupationOther.trim() : formOccupation;

    setSaving(true);
    const { error, emailVerificationSent } = await updateProfile({
      name: formName.trim(),
      phone: formPhone,
      email: formEmail.trim(),
      dateOfBirth,
      occupation,
      emergencyContact: formEmergency,
      moveInDate,
      currentFlat: formFlat,
    });
    setSaving(false);

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

  const handleUnsave = async (id: string, title: string) => {
    if (!user?.id) return;
    const supabase = (await import('@/lib/supabase')).getSupabase();
    if (!supabase) return;
    const { error: dbError } = await supabase
      .from('saved_listings')
      .delete()
      .eq('user_id', user.id)
      .eq('listing_id', id);
    if (dbError) {
      addToast('Failed to remove listing', 'error');
      return;
    }
    refreshSaved();
    addToast(`"${title}" removed from saved listings`, 'success');
  };

  // Count upcoming rent due
  const today = new Date();
  const rentDueDay = 5;
  const daysUntilRentDue = rentDueDay - today.getDate() > 0 ? rentDueDay - today.getDate() : 30 + rentDueDay - today.getDate();

  // Maintenance counts
  const activeMaint = maintRequestsFromDB.filter((r) => r.status !== 'resolved').length;

  const tabs: { id: ProfileTab; label: string; icon: string; badge?: number }[] = [
    { id: 'overview', label: 'Overview', icon: 'ri-home-4-line' },
    { id: 'saved', label: 'Saved Listings', icon: 'ri-bookmark-line', badge: savedListingsFromDB.length },
    { id: 'inquiries', label: 'Inquiries', icon: 'ri-message-3-line' },
    { id: 'messages', label: 'Messages', icon: 'ri-chat-3-line' },
    { id: 'rentManagement', label: 'Rent Management', icon: 'ri-home-gear-line', badge: activeMaint },
    { id: 'reviews', label: 'My Reviews', icon: 'ri-star-line' },
    { id: 'settings', label: 'Settings', icon: 'ri-settings-3-line' },
  ];

  return (
    <div className="min-h-screen bg-offwhite pb-16">
      <div className="max-w-6xl mx-auto px-4 md:px-8">

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

        {/* Profile Header */}
        <div className="bg-white rounded-3xl border border-black/5 overflow-hidden mb-6">
          {/* Cover */}
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
              {/* Avatar */}
              <div className="flex items-end gap-4">
                <div className="w-20 h-20 rounded-2xl bg-brand/20 border-4 border-white flex items-center justify-center flex-shrink-0">
                  {user.avatar ? (
                    <img src={user.avatar} alt={user.name} className="w-full h-full rounded-2xl object-cover" />
                  ) : (
                    <span className="text-2xl font-bold text-brand">{initials}</span>
                  )}
                </div>
                <div className="pb-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-xl font-bold text-charcoal">{user.name}</h1>
                    {user.verified && (
                      <span className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-600">
                        <i className="ri-shield-check-fill text-sm" /> Verified
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-charcoal/60 mt-0.5">Tenant · Member since {user.joinedAt}</p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pb-1">
                <NotificationBell />
              </div>
            </div>

            {/* Broker soft-block warning */}
            {brokerReport.isSoftBlocked && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-3.5 mb-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-100 flex-shrink-0">
                    <i className="ri-error-warning-line text-red-600" />
                  </div>
                  <p className="text-sm font-semibold text-red-700">
                    Account restricted — owners reported suspicious activity
                  </p>
                </div>
                <button onClick={() => setSoftBlockModalOpen(true)} className="text-sm font-bold text-red-600 hover:text-red-700 whitespace-nowrap flex items-center gap-1 cursor-pointer">
                  Resolve <i className="ri-arrow-right-line" />
                </button>
              </div>
            )}

            {/* Quick stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-5">
              {[
                { label: 'Current Flat', value: user.currentFlat || 'Not set', icon: 'ri-home-4-line', color: 'text-brand', tab: 'overview' as ProfileTab },
                { label: 'Saved Listings', value: String(savedListingsFromDB.length), icon: 'ri-bookmark-line', color: 'text-green-600', tab: 'saved' as ProfileTab },
                { label: 'Active Requests', value: String(activeMaint), icon: 'ri-tools-line', color: 'text-orange-500', tab: 'rentManagement' as ProfileTab },
              ].map((stat) => (
                <button
                  key={stat.label}
                  onClick={() => setActiveTab(stat.tab)}
                  className="bg-offwhite rounded-xl p-3 text-left hover:bg-brand/5 transition-colors cursor-pointer"
                >
                  <div className="w-7 h-7 flex items-center justify-center mb-1.5">
                    <i className={`${stat.icon} text-base ${stat.color}`} />
                  </div>
                  <p className="text-sm font-bold text-charcoal">{stat.value}</p>
                  <p className="text-xs text-charcoal/60 mt-0.5">{stat.label}</p>
                </button>
              ))}
              <button
                onClick={() => setActiveTab('rentManagement')}
                className="bg-offwhite rounded-xl p-3 text-left hover:bg-brand/5 transition-colors cursor-pointer"
              >
                <div className="w-7 h-7 flex items-center justify-center mb-1.5">
                  <i className="ri-money-rupee-circle-line text-base text-red-500" />
                </div>
                <p className="text-sm font-bold text-charcoal">Pay Rent</p>
                <p className="text-xs text-charcoal/60 mt-0.5">{daysUntilRentDue <= 3 ? `${daysUntilRentDue}d left` : 'Rent Payment'}</p>
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="sticky top-0 z-30 flex gap-1 bg-white rounded-xl border border-black/5 p-1.5 mb-6 overflow-x-auto shadow-sm">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center justify-center gap-2 px-5 py-3 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap flex-shrink-0 md:flex-1 ${
                activeTab === tab.id
                  ? 'bg-brand text-white'
                  : 'text-charcoal/60 hover:text-charcoal hover:bg-lightgray'
              }`}
            >
              <i className={`${tab.icon} text-sm`} />
              {tab.label}
              {tab.badge != null && tab.badge > 0 && (
                <span className={`absolute top-1.5 right-1.5 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center ${activeTab === tab.id ? 'bg-white text-brand' : 'bg-brand text-white'}`}>
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left column */}
            <div className="lg:col-span-2 space-y-6">
              {/* Personal Details */}
              <div className="bg-white rounded-3xl border border-black/5 p-6">
                <h2 className="text-base font-bold text-charcoal mb-4 flex items-center gap-2">
                  <div className="w-6 h-6 flex items-center justify-center">
                    <i className="ri-user-line text-brand" />
                  </div>
                  Personal Information
                  <button
                    onClick={() => {
                      if (!editMode) initEditForm();
                      setEditMode(!editMode);
                    }}
                    className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-black/10 text-xs font-medium text-charcoal hover:border-brand/40 hover:text-brand transition-colors cursor-pointer whitespace-nowrap"
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
                        className={`w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 ${nameError ? 'ring-2 ring-red-300' : 'focus:ring-brand/30'}`}
                      />
                      {nameError && <p className="text-xs text-red-500 mt-1">{nameError}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-charcoal/60 mb-1.5 uppercase tracking-wide">Email</label>
                      <input
                        type="email"
                        value={formEmail}
                        onChange={(e) => setFormEmail(e.target.value)}
                        className={`w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 ${emailError ? 'ring-2 ring-red-300' : 'focus:ring-brand/30'}`}
                      />
                      {emailError ? (
                        <p className="text-xs text-red-500 mt-1">{emailError}</p>
                      ) : formEmail !== user.email ? (
                        <p className="text-xs text-brand mt-1">A verification link will be sent to confirm this change.</p>
                      ) : null}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-charcoal/60 mb-1.5 uppercase tracking-wide">Phone</label>
                      <input
                        type="tel"
                        value={formPhone}
                        onChange={(e) => setFormPhone(formatIndianPhoneInput(e.target.value))}
                        placeholder="+91 98765 43210"
                        className={`w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 ${phoneError ? 'ring-2 ring-red-300' : 'focus:ring-brand/30'}`}
                      />
                      {phoneError && <p className="text-xs text-red-500 mt-1">{phoneError}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-charcoal/60 mb-1.5 uppercase tracking-wide">Emergency Contact</label>
                      <input
                        type="text"
                        value={formEmergency}
                        onChange={(e) => setFormEmergency(e.target.value)}
                        className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-charcoal/60 mb-1.5 uppercase tracking-wide">Date of Birth</label>
                      <div className="grid grid-cols-3 gap-3">
                        <select value={formDobDay} onChange={(e) => setFormDobDay(e.target.value)} className="w-full px-3 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 cursor-pointer">
                          <option value="">Day</option>
                          {Array.from({ length: daysInMonth(Number(formDobMonth), Number(formDobYear)) }, (_, i) => i + 1).map((d) => (
                            <option key={d} value={String(d).padStart(2, '0')}>{d}</option>
                          ))}
                        </select>
                        <select value={formDobMonth} onChange={(e) => setFormDobMonth(e.target.value)} className="w-full px-3 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 cursor-pointer">
                          <option value="">Month</option>
                          {MONTH_OPTIONS.map((m) => (
                            <option key={m.value} value={m.value}>{m.label}</option>
                          ))}
                        </select>
                        <select value={formDobYear} onChange={(e) => setFormDobYear(e.target.value)} className="w-full px-3 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 cursor-pointer">
                          <option value="">Year</option>
                          {yearOptions(1900).map((y) => (
                            <option key={y} value={String(y)}>{y}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className={formOccupation === 'Other' ? '' : 'sm:col-span-2'}>
                      <label className="block text-xs font-semibold text-charcoal/60 mb-1.5 uppercase tracking-wide">Occupation</label>
                      <select value={formOccupation} onChange={(e) => setFormOccupation(e.target.value)} className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 cursor-pointer">
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
                          className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                        />
                      </div>
                    )}
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-charcoal/60 mb-1.5 uppercase tracking-wide">Move-In Date</label>
                      <div className="grid grid-cols-3 gap-3">
                        <select value={formMoveInDay} onChange={(e) => setFormMoveInDay(e.target.value)} className="w-full px-3 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 cursor-pointer">
                          <option value="">Day</option>
                          {Array.from({ length: daysInMonth(Number(formMoveInMonth), Number(formMoveInYear)) }, (_, i) => i + 1).map((d) => (
                            <option key={d} value={String(d).padStart(2, '0')}>{d}</option>
                          ))}
                        </select>
                        <select value={formMoveInMonth} onChange={(e) => setFormMoveInMonth(e.target.value)} className="w-full px-3 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 cursor-pointer">
                          <option value="">Month</option>
                          {MONTH_OPTIONS.map((m) => (
                            <option key={m.value} value={m.value}>{m.label}</option>
                          ))}
                        </select>
                        <select value={formMoveInYear} onChange={(e) => setFormMoveInYear(e.target.value)} className="w-full px-3 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 cursor-pointer">
                          <option value="">Year</option>
                          {yearOptions(1900).map((y) => (
                            <option key={y} value={String(y)}>{y}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-charcoal/60 mb-1.5 uppercase tracking-wide">Current Flat</label>
                      <input
                        type="text"
                        value={formFlat}
                        onChange={(e) => setFormFlat(e.target.value)}
                        className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-charcoal/60 mb-1.5 uppercase tracking-wide">Aadhaar</label>
                      <div className="w-full px-4 py-3 bg-lightgray rounded-xl text-sm text-charcoal/40 flex items-center justify-between gap-2">
                        <span>{user.aadhaarLast4 ? `XXXX XXXX ${user.aadhaarLast4}` : 'Not verified'}</span>
                        {!user.aadhaarLast4 && (
                          <Link to="/aadhaar-verify" className="text-brand font-semibold hover:text-brand-dark whitespace-nowrap">Verify</Link>
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
                        className="px-5 py-2.5 rounded-full border border-black/10 text-sm font-medium text-charcoal/60 hover:bg-lightgray transition-colors cursor-pointer whitespace-nowrap"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => { handleSave(); }}
                        disabled={saving}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-brand text-white text-sm font-medium hover:bg-brand-dark transition-colors whitespace-nowrap disabled:opacity-60"
                      >
                        {saving ? <><i className="ri-loader-4-line animate-spin" /> Saving...</> : <><i className="ri-check-line" /> Save Changes</>}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {[
                      { label: 'Full Name', value: user.name, icon: 'ri-user-line' },
                      { label: 'Email', value: user.email, icon: 'ri-mail-line' },
                      { label: 'Phone', value: user.phone ?? 'Not added', icon: 'ri-phone-line' },
                      { label: 'Date of Birth', value: user.dateOfBirth ?? 'Not added', icon: 'ri-cake-line' },
                      { label: 'Occupation', value: user.occupation ?? 'Not added', icon: 'ri-briefcase-line' },
                      { label: 'Emergency Contact', value: user.emergencyContact ?? 'Not added', icon: 'ri-contacts-book-line' },
                      { label: 'Current Flat', value: user.currentFlat ?? 'Not added', icon: 'ri-home-4-line' },
                      { label: 'Move-In Date', value: user.moveInDate ?? 'Not added', icon: 'ri-calendar-check-line' },
                      { label: 'Aadhaar', value: user.aadhaarLast4 ? `XXXX XXXX ${user.aadhaarLast4}` : 'Not verified', icon: 'ri-shield-user-line' },
                      { label: 'Member Since', value: user.joinedAt, icon: 'ri-time-line' },
                    ].map((field) => (
                      <div key={field.label} className="flex items-start gap-3">
                        <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-brand/10 flex-shrink-0 mt-0.5">
                          <i className={`${field.icon} text-sm text-brand`} />
                        </div>
                        <div>
                          <p className="text-xs text-charcoal/40 font-medium">{field.label}</p>
                          <p className="text-sm font-semibold text-charcoal mt-0.5">{field.value}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Current Flat Card - only show if there's a real active agreement */}
              {activeAgreement && (
                <div className="bg-white rounded-3xl border border-black/5 p-6">
                  <h2 className="text-base font-bold text-charcoal mb-4 flex items-center gap-2">
                    <div className="w-6 h-6 flex items-center justify-center">
                      <i className="ri-home-4-line text-brand" />
                    </div>
                    Current Flat
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-offwhite rounded-xl p-4">
                      <p className="text-xs text-charcoal/40 font-medium">Property</p>
                      <p className="text-sm font-bold text-charcoal mt-1">{activeAgreement.propertyAddress || 'Not set'}</p>
                    </div>
                    <div className="bg-offwhite rounded-xl p-4">
                      <p className="text-xs text-charcoal/40 font-medium">Flat / Unit</p>
                      <p className="text-sm font-bold text-charcoal mt-1">{activeAgreement.flatNumber || user.currentFlat || 'Not set'}</p>
                      {activeAgreement.carpetArea > 0 && (
                        <p className="text-xs text-charcoal/60 mt-0.5">{activeAgreement.carpetArea} sq ft</p>
                      )}
                    </div>
                    <div className="bg-offwhite rounded-xl p-4">
                      <p className="text-xs text-charcoal/40 font-medium">Landlord</p>
                      <p className="text-sm font-bold text-charcoal mt-1">{activeAgreement.landlordName || 'Not set'}</p>
                      {activeAgreement.landlordPhone && (
                        <p className="text-xs text-charcoal/60 mt-0.5">{activeAgreement.landlordPhone}</p>
                      )}
                    </div>
                    <div className="bg-offwhite rounded-xl p-4">
                      <p className="text-xs text-charcoal/40 font-medium">Lease Period</p>
                      <p className="text-sm font-bold text-charcoal mt-1">
                        {activeAgreement.leaseStartDate ? new Date(activeAgreement.leaseStartDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '—'}
                        {' — '}
                        {activeAgreement.leaseEndDate ? new Date(activeAgreement.leaseEndDate).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '—'}
                      </p>
                      {activeAgreement.leaseEndDate && (
                        <p className="text-xs text-charcoal/60 mt-0.5">
                          {leaseCountdown(activeAgreement.leaseEndDate, activeAgreement.noticePeriodDays).monthsLeft} months remaining
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right column */}
            <div className="space-y-6">
              {/* Verification Status */}
              <div className="bg-white rounded-3xl border border-black/5 p-5">
                <h3 className="text-sm font-bold text-charcoal mb-4">Verification Status</h3>
                <div className="space-y-3">
                  {[
                    { label: 'Email Verified', done: user.verifiedEmail, icon: 'ri-mail-check-line' },
                    { label: 'Phone Verified', done: user.verifiedPhone, icon: 'ri-smartphone-line' },
                    { label: 'Aadhaar Verified', done: user.verified, icon: 'ri-shield-check-line' },
                    { label: 'Rental Agreement', done: rentalAgreements.some((a) => a.sharedWithTenant), icon: 'ri-file-text-line' },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-7 h-7 flex items-center justify-center rounded-lg ${item.done ? 'bg-green-50' : 'bg-lightgray'}`}>
                          <i className={`${item.icon} text-sm ${item.done ? 'text-green-600' : 'text-charcoal/40'}`} />
                        </div>
                        <span className="text-sm text-charcoal font-medium">{item.label}</span>
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
              <div className="bg-white rounded-3xl border border-black/5 p-5">
                <h3 className="text-sm font-bold text-charcoal mb-4">Quick Actions</h3>
                <div className="space-y-1">
                  {[
                    { to: '/rent-payment', icon: 'ri-money-rupee-circle-line', label: 'Pay Rent', color: 'bg-red-50 text-red-500' },
                    { to: '/aadhaar-verify', icon: 'ri-shield-check-line', label: 'Aadhaar Verify', color: 'bg-green-50 text-green-600' },
                    { to: '/feedback', icon: 'ri-star-line', label: 'Write a Review', color: 'bg-orange-50 text-orange-500' },
                    { to: '/community', icon: 'ri-discuss-line', label: 'Community Forum', color: 'bg-teal-50 text-teal-600' },
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

              {/* Lease countdown - only if a real rental agreement exists */}
              {activeAgreement && (
                <button
                  onClick={() => setLeaseModalOpen(true)}
                  className="w-full text-left bg-amber-50 border border-amber-100 rounded-2xl p-5 hover:border-amber-300 transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 flex items-center justify-center">
                      <i className="ri-calendar-event-line text-amber-600" />
                    </div>
                    <h3 className="text-sm font-bold text-amber-800">Lease Renewal</h3>
                  </div>
                  <p className="text-xs text-amber-700 leading-relaxed">
                    Your lease expires{' '}
                    <strong>{new Date(`${activeAgreement.leaseEndDate}T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</strong>.
                    Contact your landlord at least 2 months before to discuss renewal terms.
                  </p>
                  <div className="mt-3 text-xs font-semibold text-amber-700 flex items-center gap-1 group-hover:text-amber-800 whitespace-nowrap">
                    Open Details <i className="ri-arrow-right-line" />
                  </div>
                </button>
              )}
            </div>
          </div>
        )}

        {activeTab === 'saved' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-charcoal">Saved Listings</h2>
                <p className="text-sm text-charcoal/60 mt-0.5">{savedListingsFromDB.length} properties bookmarked</p>
              </div>
              <Link to="/listings" className="flex items-center gap-2 px-4 py-2 rounded-full border border-black/10 text-sm font-medium text-charcoal hover:border-brand/40 hover:text-brand transition-colors cursor-pointer whitespace-nowrap">
                <i className="ri-search-line text-sm" /> Browse More
              </Link>
            </div>
            {savedLoading ? (
              <div className="bg-white rounded-3xl border border-black/5 p-12 text-center">
                <div className="w-12 h-12 flex items-center justify-center mx-auto mb-4">
                  <i className="ri-loader-4-line animate-spin text-brand text-3xl" />
                </div>
                <p className="text-charcoal/60 text-sm">Loading saved listings...</p>
              </div>
            ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {savedListingsFromDB.map((listing) => (
                <div key={listing.id} className="bg-white rounded-3xl border border-black/5 overflow-hidden hover:border-brand/30 transition group">
                  <div className="relative h-44 overflow-hidden">
                    <img
                      src={listing.images[0]}
                      alt={listing.title}
                      className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                    <button
                      onClick={() => handleUnsave(listing.id, listing.title)}
                      className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-white/90 hover:bg-red-50 hover:text-red-500 transition-colors cursor-pointer group"
                      title="Remove from saved"
                    >
                      <i className="ri-bookmark-fill text-brand text-sm group-hover:hidden" />
                      <i className="ri-close-line text-red-500 text-sm hidden group-hover:flex" />
                    </button>
                    {listing.verified && (
                      <span className="absolute top-3 left-3 flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-500 text-white">
                        <i className="ri-shield-check-fill text-[10px]" /> Verified
                      </span>
                    )}
                    <div className="absolute bottom-3 left-3">
                      <span className="text-xs font-bold text-white bg-black/50 px-2 py-0.5 rounded-full">
                        {(listing.property_type ?? 'apartment').charAt(0).toUpperCase() + (listing.property_type ?? 'apartment').slice(1)}
                      </span>
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-bold text-charcoal leading-snug">{listing.title}</h3>
                      <p className="text-sm font-bold text-brand whitespace-nowrap">₹{listing.price.toLocaleString('en-IN')}<span className="text-xs font-normal text-charcoal/40">/mo</span></p>
                    </div>
                    <p className="text-xs text-charcoal/60 flex items-center gap-1 mt-1">
                      <i className="ri-map-pin-line text-sm" /> {listing.location ?? listing.city ?? 'Unknown'}
                    </p>
                    <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-50">
                      <span className="flex items-center gap-1 text-xs text-charcoal/60">
                        <i className="ri-hotel-bed-line text-sm" />
                        {listing.bedrooms === 0 ? 'Studio' : `${listing.bedrooms} BHK`}
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
                    <div className="flex items-center gap-2 mt-3">
                      <div className="flex items-center gap-2 flex-1">
                        <img src={listing.owner?.avatar_url ?? '/placeholders/avatar.svg'} alt={listing.owner?.name ?? 'Owner'} className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                        <span className="text-xs text-charcoal/60 truncate">{listing.owner?.name ?? 'Owner'}</span>
                      </div>
                      <Link
                        to={`/listings/${listing.id}`}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-brand text-white text-xs font-semibold hover:bg-brand-dark transition-colors cursor-pointer whitespace-nowrap"
                      >
                        View <i className="ri-arrow-right-line text-sm" />
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            )}
            {savedListingsFromDB.length === 0 && !savedLoading && (
              <div className="bg-white rounded-3xl border border-black/5 p-12 text-center">
                <div className="w-14 h-14 flex items-center justify-center mx-auto mb-4 bg-lightgray rounded-full">
                  <i className="ri-bookmark-line text-2xl text-charcoal/40" />
                </div>
                <h3 className="text-base font-bold text-charcoal mb-2">No saved listings yet</h3>
                <p className="text-sm text-charcoal/60 mb-5">Browse properties and bookmark the ones you like.</p>
                <Link to="/listings" className="bg-brand text-white px-6 py-2.5 rounded-full text-sm font-medium hover:bg-brand-dark transition-colors whitespace-nowrap">
                  Browse Listings
                </Link>
              </div>
            )}
          </div>
        )}

        {activeTab === 'inquiries' && (
          <TenantInquiriesTab onOpenChat={(id) => { setActiveChatRequestId(id); setActiveTab('messages'); }} />
        )}

        {activeTab === 'messages' && <TenantChatTab initialRequestId={activeChatRequestId} />}

        {activeTab === 'rentManagement' && <RentManagementTab initialSubTab={subParam === 'documents' || subParam === 'payments' ? subParam : undefined} />}

        {activeTab === 'reviews' && <MyReviewsTab />}


        {activeTab === 'settings' && (
          <div className="max-w-2xl space-y-6">
            {/* Notifications */}
            <div className="bg-white rounded-3xl border border-black/5 p-6">
              <h2 className="text-base font-bold text-charcoal mb-4 flex items-center gap-2">
                <div className="w-6 h-6 flex items-center justify-center">
                  <i className="ri-signal-tower-line text-brand" />
                </div>
                Notifications
              </h2>
              <p className="text-sm text-charcoal/60 mb-4">
                Choose how you receive each type of notification. If push fails, SMS and email fallbacks activate automatically.
              </p>
              <ChannelPreferences />
            </div>

            {/* Security */}
            <div className="bg-white rounded-3xl border border-black/5 p-6">
              <h2 className="text-base font-bold text-charcoal mb-4">Security</h2>
              <button
                onClick={handleChangePassword}
                disabled={sendingReset}
                className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-offwhite transition-colors cursor-pointer disabled:opacity-60"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-brand/10">
                    <i className="ri-lock-password-line text-sm text-brand" />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-charcoal">Change Password</p>
                    <p className="text-xs text-charcoal/40">{sendingReset ? 'Sending link...' : `We'll email a secure reset link to ${user.email}`}</p>
                  </div>
                </div>
                <i className="ri-arrow-right-s-line text-charcoal/40" />
              </button>
            </div>

            {/* Danger Zone */}
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
                  <p className="text-xs text-charcoal/40">Request permanent removal of your account and data</p>
                </div>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Lease Renewal Modal */}
      {leaseModalOpen && activeAgreement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setLeaseModalOpen(false)}>
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-amber-50 p-5 border-b border-amber-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-amber-100">
                    <i className="ri-calendar-event-line text-lg text-amber-700" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-charcoal">Lease Renewal</h3>
                    <p className="text-xs text-charcoal/60">{activeAgreement.propertyAddress || 'Address not set'}</p>
                  </div>
                </div>
                <button
                  onClick={() => setLeaseModalOpen(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-amber-100 transition-colors cursor-pointer"
                >
                  <i className="ri-close-line text-charcoal/60" />
                </button>
              </div>
            </div>
            <div className="p-5 space-y-5">
              {(() => {
                const { daysLeft, monthsLeft, renewByLabel } = leaseCountdown(activeAgreement.leaseEndDate, activeAgreement.noticePeriodDays);
                return (
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { value: String(daysLeft), label: 'Days Left' },
                      { value: String(monthsLeft), label: 'Months' },
                      { value: renewByLabel, label: 'Renew By' },
                    ].map((item) => (
                      <div key={item.label} className="bg-offwhite rounded-xl p-3 text-center">
                        <p className="text-lg font-bold text-charcoal">{item.value}</p>
                        <p className="text-[10px] text-charcoal/60 uppercase tracking-wide mt-0.5">{item.label}</p>
                      </div>
                    ))}
                  </div>
                );
              })()}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-charcoal/60">Lease Start</span>
                  <span className="font-medium text-charcoal">{formatLeaseDate(activeAgreement.leaseStartDate)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-charcoal/60">Lease End</span>
                  <span className="font-medium text-charcoal">{formatLeaseDate(activeAgreement.leaseEndDate)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-charcoal/60">Monthly Rent</span>
                  <span className="font-medium text-charcoal">₹{activeAgreement.monthlyRent.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-charcoal/60">Security Deposit</span>
                  <span className="font-medium text-charcoal">₹{activeAgreement.securityDeposit.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-charcoal/60">Landlord</span>
                  <span className="font-medium text-charcoal">{activeAgreement.landlordName || 'Not set'}</span>
                </div>
              </div>
              <div className="space-y-2 pt-1">
                <Link to="/rental-agreements" onClick={() => setLeaseModalOpen(false)} className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-dark transition-colors whitespace-nowrap">
                  <i className="ri-file-text-line" /> Open Rental Agreements
                </Link>
                <button onClick={() => setLeaseModalOpen(false)} className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-medium text-charcoal/60 hover:text-charcoal transition-colors whitespace-nowrap cursor-pointer">
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
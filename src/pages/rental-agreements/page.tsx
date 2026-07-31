import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useOwnerListings } from '@/hooks/useListings';
import { useOwnerEligibleTenants } from '@/hooks/useReviewEligibility';
import { useRentalAgreements, generateAgreementNumber } from '@/hooks/useRentalAgreements';
import { buildRentalAgreementHtml, type RentalAgreementData } from '@/lib/documents/rentalAgreementDocument';
import { RENTAL_AGREEMENT_CLAUSES } from '@/lib/content/rentalAgreementClauses';
import { useToast } from '@/hooks/useToast';
import { viewDocument } from '@/lib/viewDocument';
import { isValidIndianPhone, formatIndianPhoneInput } from '@/lib/validation';

const PAYMENT_MODES = ['Bank Transfer (NEFT/IMPS)', 'UPI', 'Cheque', 'Cash'];

export default function RentalAgreementsPage() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const isOwner = user?.role === 'owner';

  const { listings } = useOwnerListings(user?.id);
  const { contacts: eligibleTenants } = useOwnerEligibleTenants(user?.id);
  const { agreements, loading, fetchError, create, markShared, refresh } = useRentalAgreements(user?.id);

  const [activeTab, setActiveTab] = useState<'create' | 'history'>('create');
  const [selectedListingId, setSelectedListingId] = useState('');
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [manualTenant, setManualTenant] = useState(false);
  const [selectedClauses, setSelectedClauses] = useState<Set<number>>(new Set(RENTAL_AGREEMENT_CLAUSES.map((_, i) => i)));
  const [submitting, setSubmitting] = useState(false);
  const [viewingAgreementId, setViewingAgreementId] = useState<string | null>(null);
  const [tenantPhoneError, setTenantPhoneError] = useState('');

  const [form, setForm] = useState({
    tenantName: '', tenantAddress: '', tenantPhone: '', tenantEmail: '', tenantPan: '', tenantAadhaarMasked: '',
    landlordAddress: '', landlordPan: '',
    propertyDescription: '', flatNumber: '',
    leaseStartDate: '', leaseEndDate: '', rentDueDay: '5', paymentMode: PAYMENT_MODES[0],
    noticePeriodDays: '60', lockInMonths: '12', renewalClause: 'Renewable by mutual consent, subject to revised terms.',
    witness1Name: '', witness1Address: '', witness2Name: '', witness2Address: '',
  });

  const selectedListing = listings.find((l) => l.id === selectedListingId);

  const setField = (field: keyof typeof form, value: string) => setForm((prev) => ({ ...prev, [field]: value }));

  const applyTenant = (tenantId: string) => {
    setSelectedTenantId(tenantId);
    const contact = eligibleTenants.find((c) => c.id === tenantId);
    if (contact) setField('tenantName', contact.name);
  };

  const toggleClause = (idx: number) => {
    setSelectedClauses((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const previewData: RentalAgreementData = useMemo(() => ({
    agreementNumber: 'DRAFT',
    tenantName: form.tenantName || 'Tenant Name',
    tenantAddress: form.tenantAddress,
    tenantPhone: form.tenantPhone,
    tenantEmail: form.tenantEmail,
    tenantPan: form.tenantPan,
    tenantAadhaarMasked: form.tenantAadhaarMasked,
    landlordName: user?.name ?? 'Owner Name',
    landlordAddress: form.landlordAddress,
    landlordPhone: user?.phone ?? '',
    landlordEmail: user?.email ?? '',
    landlordPan: form.landlordPan,
    propertyAddress: selectedListing ? `${selectedListing.location ?? ''}${selectedListing.city ? ', ' + selectedListing.city : ''}` : 'Select a property',
    propertyDescription: form.propertyDescription,
    flatNumber: form.flatNumber,
    carpetArea: selectedListing?.area_sqft ?? 0,
    leaseStartDate: form.leaseStartDate,
    leaseEndDate: form.leaseEndDate,
    monthlyRent: selectedListing?.price ?? 0,
    securityDeposit: selectedListing?.deposit ?? 0,
    rentDueDay: Number(form.rentDueDay) || 5,
    paymentMode: form.paymentMode,
    maintenanceAmount: selectedListing?.maintenance_charge ?? 0,
    noticePeriodDays: Number(form.noticePeriodDays) || 30,
    lockInMonths: Number(form.lockInMonths) || 0,
    renewalClause: form.renewalClause,
    witness1Name: form.witness1Name,
    witness1Address: form.witness1Address,
    witness2Name: form.witness2Name,
    witness2Address: form.witness2Address,
    clauses: RENTAL_AGREEMENT_CLAUSES.filter((_, i) => selectedClauses.has(i)),
    createdAt: new Date().toISOString(),
  }), [form, selectedListing, selectedClauses, user]);

  const previewHtml = useMemo(() => buildRentalAgreementHtml(previewData), [previewData]);

  const canGenerate = Boolean(
    selectedListingId && form.tenantName.trim() && form.leaseStartDate && form.leaseEndDate &&
    (!form.tenantPhone || isValidIndianPhone(form.tenantPhone))
  );

  const handleGenerate = async () => {
    if (!user || !canGenerate) return;
    setSubmitting(true);
    const { error } = await create({
      ownerId: user.id,
      tenantId: manualTenant ? null : selectedTenantId || null,
      listingId: selectedListingId,
      ...previewData,
      agreementNumber: generateAgreementNumber(),
    });
    setSubmitting(false);
    if (error) {
      addToast(`Failed to generate agreement: ${error}`, 'error');
      return;
    }
    addToast('Rental agreement generated successfully', 'success');
    setActiveTab('history');
  };

  const viewingAgreement = agreements.find((a) => a.id === viewingAgreementId);

  if (!isOwner) {
    return (
      <div className="min-h-screen bg-offwhite flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold text-charcoal mb-2">Owners only</h2>
          <p className="text-charcoal/60 text-sm mb-6">The rental agreement generator is available to property owners.</p>
          <Link to="/owner-profile" className="bg-amber-500 text-white px-6 py-3 rounded-full text-sm font-medium hover:bg-amber-600 transition-colors whitespace-nowrap">Go to Profile</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-offwhite pb-16">
      <div className="max-w-[1440px] mx-auto px-4 md:px-8">
        <div className="mb-6">
          <Link to="/owner-profile" className="text-xs text-charcoal/40 hover:text-charcoal transition-colors">← Owner Profile</Link>
          <h1 className="text-2xl md:text-3xl font-bold text-charcoal mt-1">Rental Agreement Generator</h1>
          <p className="text-sm text-charcoal/60 mt-1">Create a properly formatted rental agreement for one of your listings.</p>
        </div>

        <div className="flex gap-1 bg-white rounded-xl border border-black/5 p-1.5 mb-6 w-fit">
          {(['create', 'history'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${activeTab === tab ? 'bg-amber-500 text-white' : 'text-charcoal/60 hover:text-charcoal hover:bg-lightgray'}`}
            >
              {tab === 'create' ? 'Create Agreement' : `History (${agreements.length})`}
            </button>
          ))}
        </div>

        {activeTab === 'create' && (
          <div className="grid grid-cols-1 lg:grid-cols-[440px_minmax(0,1fr)] gap-6 items-start">
            {/* Form */}
            <div className="space-y-5">
              <div className="bg-white rounded-3xl border border-black/5 p-5">
                <h2 className="text-sm font-bold text-charcoal mb-4">Property</h2>
                <label className="block text-xs font-semibold text-charcoal/60 uppercase tracking-wide mb-1.5">Select Listing</label>
                <select
                  value={selectedListingId}
                  onChange={(e) => setSelectedListingId(e.target.value)}
                  className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 cursor-pointer"
                >
                  <option value="">Select a property from your listings</option>
                  {listings.map((l) => (
                    <option key={l.id} value={l.id}>{l.title} — {l.location ?? l.city}</option>
                  ))}
                </select>
                {listings.length === 0 && <p className="text-xs text-charcoal/40 mt-2">You don't have any listings yet.</p>}
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div>
                    <label className="block text-xs font-semibold text-charcoal/60 uppercase tracking-wide mb-1.5">Unit / Flat No. (optional)</label>
                    <input type="text" value={form.flatNumber} onChange={(e) => setField('flatNumber', e.target.value)} className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-charcoal/60 uppercase tracking-wide mb-1.5">Description (optional)</label>
                    <input type="text" value={form.propertyDescription} onChange={(e) => setField('propertyDescription', e.target.value)} className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-3xl border border-black/5 p-5">
                <h2 className="text-sm font-bold text-charcoal mb-4">Tenant</h2>
                {!manualTenant ? (
                  <>
                    <label className="block text-xs font-semibold text-charcoal/60 uppercase tracking-wide mb-1.5">Select Tenant</label>
                    <select
                      value={selectedTenantId}
                      onChange={(e) => applyTenant(e.target.value)}
                      className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 cursor-pointer"
                    >
                      <option value="">Select from your approved tenants</option>
                      {eligibleTenants.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    {eligibleTenants.length === 0 && <p className="text-xs text-charcoal/40 mt-2">No approved tenant connections yet.</p>}
                    <button type="button" onClick={() => setManualTenant(true)} className="text-xs text-amber-600 font-medium hover:text-amber-700 mt-2 cursor-pointer">
                      Enter tenant details manually instead
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={() => { setManualTenant(false); setSelectedTenantId(''); }} className="text-xs text-amber-600 font-medium hover:text-amber-700 mb-3 cursor-pointer">
                    ← Choose from approved tenants instead
                  </button>
                )}
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-charcoal/60 uppercase tracking-wide mb-1.5">Full Name</label>
                    <input type="text" value={form.tenantName} onChange={(e) => setField('tenantName', e.target.value)} disabled={!manualTenant && !!selectedTenantId} className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:opacity-70" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-charcoal/60 uppercase tracking-wide mb-1.5">Phone</label>
                    <input
                      type="tel"
                      value={form.tenantPhone}
                      onChange={(e) => { setField('tenantPhone', formatIndianPhoneInput(e.target.value)); setTenantPhoneError(''); }}
                      onBlur={() => setTenantPhoneError(form.tenantPhone && !isValidIndianPhone(form.tenantPhone) ? 'Enter a valid 10-digit Indian mobile number.' : '')}
                      placeholder="+91 98765 43210"
                      className={`w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 ${tenantPhoneError ? 'ring-2 ring-red-300' : 'focus:ring-amber-300'}`}
                    />
                    {tenantPhoneError && <p className="text-xs text-red-500 mt-1">{tenantPhoneError}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-charcoal/60 uppercase tracking-wide mb-1.5">Email</label>
                    <input type="email" value={form.tenantEmail} onChange={(e) => setField('tenantEmail', e.target.value)} className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-charcoal/60 uppercase tracking-wide mb-1.5">PAN</label>
                    <input type="text" value={form.tenantPan} onChange={(e) => setField('tenantPan', e.target.value.toUpperCase())} className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-charcoal/60 uppercase tracking-wide mb-1.5">Aadhaar (masked)</label>
                    <input type="text" placeholder="XXXX XXXX 1234" value={form.tenantAadhaarMasked} onChange={(e) => setField('tenantAadhaarMasked', e.target.value)} className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-charcoal/60 uppercase tracking-wide mb-1.5">Present Address</label>
                    <input type="text" value={form.tenantAddress} onChange={(e) => setField('tenantAddress', e.target.value)} className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-3xl border border-black/5 p-5">
                <h2 className="text-sm font-bold text-charcoal mb-4">Owner Details</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-charcoal/60 uppercase tracking-wide mb-1.5">Address</label>
                    <input type="text" value={form.landlordAddress} onChange={(e) => setField('landlordAddress', e.target.value)} className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-charcoal/60 uppercase tracking-wide mb-1.5">PAN</label>
                    <input type="text" value={form.landlordPan} onChange={(e) => setField('landlordPan', e.target.value.toUpperCase())} className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-3xl border border-black/5 p-5">
                <h2 className="text-sm font-bold text-charcoal mb-4">Lease Terms</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-charcoal/60 uppercase tracking-wide mb-1.5">Lease Start</label>
                    <input type="date" value={form.leaseStartDate} onChange={(e) => setField('leaseStartDate', e.target.value)} className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-charcoal/60 uppercase tracking-wide mb-1.5">Lease End</label>
                    <input type="date" value={form.leaseEndDate} onChange={(e) => setField('leaseEndDate', e.target.value)} className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-charcoal/60 uppercase tracking-wide mb-1.5">Rent Due Day</label>
                    <input type="number" min={1} max={28} value={form.rentDueDay} onChange={(e) => setField('rentDueDay', e.target.value)} className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-charcoal/60 uppercase tracking-wide mb-1.5">Payment Mode</label>
                    <select value={form.paymentMode} onChange={(e) => setField('paymentMode', e.target.value)} className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 cursor-pointer">
                      {PAYMENT_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-charcoal/60 uppercase tracking-wide mb-1.5">Notice Period (days)</label>
                    <input type="number" value={form.noticePeriodDays} onChange={(e) => setField('noticePeriodDays', e.target.value)} className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-charcoal/60 uppercase tracking-wide mb-1.5">Lock-in (months)</label>
                    <input type="number" value={form.lockInMonths} onChange={(e) => setField('lockInMonths', e.target.value)} className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-charcoal/60 uppercase tracking-wide mb-1.5">Renewal Clause</label>
                    <input type="text" value={form.renewalClause} onChange={(e) => setField('renewalClause', e.target.value)} className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                  </div>
                </div>
                {selectedListing && (
                  <p className="text-xs text-charcoal/40 mt-3">
                    Rent (₹{selectedListing.price.toLocaleString('en-IN')}), deposit and maintenance are pulled automatically from the selected listing.
                  </p>
                )}
              </div>

              <div className="bg-white rounded-3xl border border-black/5 p-5">
                <h2 className="text-sm font-bold text-charcoal mb-1">Terms &amp; Conditions</h2>
                <p className="text-xs text-charcoal/60 mb-4">Choose which standard clauses to include in this agreement.</p>
                <div className="space-y-2.5">
                  {RENTAL_AGREEMENT_CLAUSES.map((clause, idx) => (
                    <label key={idx} className="flex items-start gap-3 p-3 bg-offwhite rounded-xl cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedClauses.has(idx)}
                        onChange={() => toggleClause(idx)}
                        className="mt-0.5 w-4 h-4 accent-amber-500 cursor-pointer flex-shrink-0"
                      />
                      <span className="text-xs text-charcoal/70 leading-relaxed">{clause}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-3xl border border-black/5 p-5">
                <h2 className="text-sm font-bold text-charcoal mb-4">Witnesses (optional)</h2>
                <div className="grid grid-cols-2 gap-4">
                  <input type="text" placeholder="Witness 1 name" value={form.witness1Name} onChange={(e) => setField('witness1Name', e.target.value)} className="px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                  <input type="text" placeholder="Witness 1 address" value={form.witness1Address} onChange={(e) => setField('witness1Address', e.target.value)} className="px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                  <input type="text" placeholder="Witness 2 name" value={form.witness2Name} onChange={(e) => setField('witness2Name', e.target.value)} className="px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                  <input type="text" placeholder="Witness 2 address" value={form.witness2Address} onChange={(e) => setField('witness2Address', e.target.value)} className="px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                </div>
              </div>

              <button
                onClick={handleGenerate}
                disabled={!canGenerate || submitting}
                className="w-full flex items-center justify-center gap-2 bg-amber-500 text-white text-sm font-semibold px-4 py-3.5 rounded-full hover:bg-amber-600 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? <><i className="ri-loader-4-line animate-spin" /> Generating...</> : <><i className="ri-file-add-line" /> Generate Agreement</>}
              </button>
            </div>

            {/* Live preview */}
            <div className="lg:sticky lg:top-24 lg:self-start">
              <div className="bg-white rounded-3xl border border-black/5 overflow-hidden">
                <div className="p-4 border-b border-black/5 flex items-center justify-between">
                  <h2 className="text-sm font-bold text-charcoal">Live Preview</h2>
                  <button onClick={() => viewDocument(previewHtml)} className="text-xs text-amber-600 font-medium hover:text-amber-700 flex items-center gap-1 cursor-pointer">
                    <i className="ri-printer-line" /> Print
                  </button>
                </div>
                <iframe title="Agreement preview" srcDoc={previewHtml} className="w-full h-[1100px] border-0" />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-4">
            {loading ? (
              <div className="bg-white rounded-3xl border border-black/5 p-12 text-center text-sm text-charcoal/40">Loading agreements…</div>
            ) : fetchError ? (
              // A failed fetch must never look like "no agreements yet" --
              // that invites generating a duplicate legal document.
              <div className="bg-white rounded-3xl border border-red-100 p-12 text-center">
                <div className="w-14 h-14 flex items-center justify-center mx-auto mb-4 bg-red-50 rounded-full">
                  <i className="ri-wifi-off-line text-2xl text-red-500" />
                </div>
                <h3 className="text-base font-bold text-charcoal mb-2">Couldn't load your agreements</h3>
                <p className="text-sm text-charcoal/60 mb-5">Your existing agreements may not be shown. Please retry before creating a new one.</p>
                <button onClick={() => refresh()} className="bg-charcoal text-white px-6 py-2.5 rounded-full text-sm font-medium hover:bg-black transition-colors whitespace-nowrap cursor-pointer">Retry</button>
              </div>
            ) : agreements.length === 0 ? (
              <div className="bg-white rounded-3xl border border-black/5 p-12 text-center">
                <div className="w-14 h-14 flex items-center justify-center mx-auto mb-4 bg-amber-50 rounded-full">
                  <i className="ri-file-list-3-line text-2xl text-amber-500" />
                </div>
                <h3 className="text-base font-bold text-charcoal mb-2">No agreements yet</h3>
                <p className="text-sm text-charcoal/60 mb-5">Generate your first rental agreement using the Create tab.</p>
                <button onClick={() => setActiveTab('create')} className="bg-amber-500 text-white px-6 py-2.5 rounded-full text-sm font-medium hover:bg-amber-600 transition-colors whitespace-nowrap cursor-pointer">Create Agreement</button>
              </div>
            ) : (
              agreements.map((a) => (
                <div key={a.id} className="bg-white rounded-3xl border border-black/5 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-charcoal">{a.agreementNumber}</p>
                      {a.sharedWithTenant ? (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-600">Shared with Tenant</span>
                      ) : (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">Not Shared</span>
                      )}
                    </div>
                    <p className="text-xs text-charcoal/60 mt-1">{a.tenantName} · {a.propertyAddress}</p>
                    <p className="text-xs text-charcoal/40 mt-0.5">{a.leaseStartDate} to {a.leaseEndDate} · ₹{a.monthlyRent.toLocaleString('en-IN')}/mo</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => setViewingAgreementId(a.id)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-black/10 text-xs font-medium text-charcoal hover:border-amber-400 hover:text-amber-600 transition-colors cursor-pointer whitespace-nowrap">
                      <i className="ri-eye-line text-sm" /> View
                    </button>
                    {!a.sharedWithTenant && (
                      <button onClick={() => { markShared(a.id); addToast('Agreement shared with tenant', 'success'); }} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-amber-200 text-xs font-medium text-amber-700 hover:bg-amber-50 transition-colors cursor-pointer whitespace-nowrap">
                        <i className="ri-share-forward-line text-sm" /> Share
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* View modal */}
        {viewingAgreement && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
            <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[92vh] overflow-hidden flex flex-col">
              <div className="p-4 border-b border-black/5 flex items-center justify-between flex-shrink-0">
                <h3 className="text-sm font-bold text-charcoal">{viewingAgreement.agreementNumber}</h3>
                <div className="flex items-center gap-2">
                  <button onClick={() => viewDocument(buildRentalAgreementHtml(viewingAgreement))} className="text-xs text-amber-600 font-medium hover:text-amber-700 flex items-center gap-1 cursor-pointer">
                    <i className="ri-printer-line" /> Print
                  </button>
                  <button onClick={() => setViewingAgreementId(null)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-lightgray transition-colors cursor-pointer">
                    <i className="ri-close-line text-charcoal/60" />
                  </button>
                </div>
              </div>
              <iframe title="Agreement view" srcDoc={buildRentalAgreementHtml(viewingAgreement)} className="w-full flex-1 border-0" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

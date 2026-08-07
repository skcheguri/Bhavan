import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { useOwnerListings } from '@/hooks/useListings';
import { useOwnerEligibleTenants } from '@/hooks/useReviewEligibility';
import { useRentReceipts, generateReceiptNumber } from '@/hooks/useRentReceipts';
import { buildRentReceiptHtml, type RentReceiptData } from '@/lib/documents/rentReceiptDocument';
import { useToast } from '@/hooks/useToast';
import { viewDocument } from '@/lib/viewDocument';

const PAYMENT_MODES = [
  { value: 'cash', label: 'Cash' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'card', label: 'Credit/Debit Card' },
];

function firstOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function lastOfMonth(): string {
  const d = new Date();
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`;
}

export default function RentReceiptsPage() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const isOwner = user?.role === 'owner';

  const { listings } = useOwnerListings(user?.id);
  const { contacts: eligibleTenants } = useOwnerEligibleTenants(user?.id);
  const { receipts, loading, fetchError, create, markShared, refresh } = useRentReceipts(user?.id);

  const [activeTab, setActiveTab] = useState<'create' | 'history'>('create');
  const [selectedListingId, setSelectedListingId] = useState('');
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [manualTenant, setManualTenant] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [viewingReceiptId, setViewingReceiptId] = useState<string | null>(null);

  const [form, setForm] = useState({
    tenantName: '', tenantPan: '',
    landlordPan: '',
    periodFrom: firstOfMonth(), periodTo: lastOfMonth(),
    paymentMode: 'upi', transactionRef: '', paymentDate: new Date().toISOString().split('T')[0],
    includesMaintenance: true, notes: '',
  });

  const selectedListing = listings.find((l) => l.id === selectedListingId);

  const setField = <K extends keyof typeof form>(field: K, value: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const applyTenant = (tenantId: string) => {
    setSelectedTenantId(tenantId);
    const contact = eligibleTenants.find((c) => c.id === tenantId);
    if (contact) setField('tenantName', contact.name);
  };

  const previewData: RentReceiptData = useMemo(() => ({
    receiptNumber: 'DRAFT',
    landlordName: user?.name ?? 'Owner Name',
    landlordPan: form.landlordPan,
    landlordAddress: '',
    tenantName: form.tenantName || 'Tenant Name',
    tenantPan: form.tenantPan,
    propertyAddress: selectedListing ? `${selectedListing.location ?? ''}${selectedListing.city ? ', ' + selectedListing.city : ''}` : 'Select a property',
    periodFrom: form.periodFrom,
    periodTo: form.periodTo,
    rentAmount: selectedListing?.price ?? 0,
    paymentMode: form.paymentMode,
    transactionRef: form.transactionRef,
    paymentDate: form.paymentDate,
    includesMaintenance: form.includesMaintenance,
    maintenanceAmount: form.includesMaintenance ? (selectedListing?.maintenance_charge ?? 0) : 0,
    notes: form.notes,
    createdAt: new Date().toISOString(),
  }), [form, selectedListing, user]);

  const previewHtml = useMemo(() => buildRentReceiptHtml(previewData), [previewData]);

  const canGenerate = Boolean(selectedListingId && form.tenantName.trim() && form.periodFrom && form.periodTo);

  const handleGenerate = async () => {
    if (!user || !canGenerate) return;
    setSubmitting(true);
    const { error } = await create({
      ownerId: user.id,
      tenantId: manualTenant ? null : selectedTenantId || null,
      listingId: selectedListingId,
      ...previewData,
      receiptNumber: generateReceiptNumber(),
    });
    setSubmitting(false);
    if (error) {
      addToast(`Failed to generate receipt: ${error}`, 'error');
      return;
    }
    addToast('Rent receipt generated successfully', 'success');
    setActiveTab('history');
  };

  const viewingReceipt = receipts.find((r) => r.id === viewingReceiptId);

  if (!isOwner) {
    return (
      <div className="min-h-screen bg-offwhite flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold text-charcoal mb-2">Owners only</h2>
          <p className="text-charcoal/60 text-sm mb-6">The rent receipt generator is available to property owners.</p>
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
          <h1 className="text-2xl md:text-3xl font-bold text-charcoal mt-1">Rent Receipt Generator</h1>
          <p className="text-sm text-charcoal/60 mt-1">Generate professional rent receipts for HRA exemption and ITR records.</p>
        </div>

        <div className="flex gap-1 bg-white rounded-xl border border-black/5 p-1.5 mb-6 w-fit">
          {(['create', 'history'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${activeTab === tab ? 'bg-amber-500 text-white' : 'text-charcoal/60 hover:text-charcoal hover:bg-lightgray'}`}
            >
              {tab === 'create' ? 'Create Receipt' : `History (${receipts.length})`}
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
                {selectedListing && (
                  <p className="text-xs text-charcoal/40 mt-2">
                    Rent (₹{selectedListing.price.toLocaleString('en-IN')}) and maintenance are pulled automatically from the selected listing.
                  </p>
                )}
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
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-charcoal/60 uppercase tracking-wide mb-1.5">Tenant PAN (optional)</label>
                    <input type="text" value={form.tenantPan} onChange={(e) => setField('tenantPan', e.target.value.toUpperCase())} maxLength={10} placeholder="ABCDE1234F" className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 uppercase" />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-3xl border border-black/5 p-5">
                <h2 className="text-sm font-bold text-charcoal mb-4">Landlord PAN</h2>
                <input type="text" value={form.landlordPan} onChange={(e) => setField('landlordPan', e.target.value.toUpperCase())} maxLength={10} placeholder="ABCDE1234F" className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 uppercase" />
              </div>

              <div className="bg-white rounded-3xl border border-black/5 p-5">
                <h2 className="text-sm font-bold text-charcoal mb-4">Rent Details</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-charcoal/60 uppercase tracking-wide mb-1.5">Period From</label>
                    <input type="date" value={form.periodFrom} onChange={(e) => setField('periodFrom', e.target.value)} className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-charcoal/60 uppercase tracking-wide mb-1.5">Period To</label>
                    <input type="date" value={form.periodTo} onChange={(e) => setField('periodTo', e.target.value)} className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-charcoal/60 uppercase tracking-wide mb-1.5">Payment Date</label>
                    <input type="date" value={form.paymentDate} onChange={(e) => setField('paymentDate', e.target.value)} className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-charcoal/60 uppercase tracking-wide mb-1.5">Payment Mode</label>
                    <select value={form.paymentMode} onChange={(e) => setField('paymentMode', e.target.value)} className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 cursor-pointer">
                      {PAYMENT_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-charcoal/60 uppercase tracking-wide mb-1.5">Transaction Reference</label>
                    <input type="text" value={form.transactionRef} onChange={(e) => setField('transactionRef', e.target.value)} placeholder="UPI ref, Cheque no, NEFT ID, etc." className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
                  </div>
                </div>
                <label className="flex items-center gap-2 mt-4 cursor-pointer">
                  <input type="checkbox" checked={form.includesMaintenance} onChange={(e) => setField('includesMaintenance', e.target.checked)} className="w-4 h-4 accent-amber-500 cursor-pointer" />
                  <span className="text-sm text-charcoal font-medium">Include Maintenance Charges</span>
                </label>
              </div>

              <div className="bg-white rounded-3xl border border-black/5 p-5">
                <label className="block text-xs font-semibold text-charcoal/60 uppercase tracking-wide mb-1.5">Additional Notes (optional)</label>
                <textarea value={form.notes} onChange={(e) => setField('notes', e.target.value)} rows={2} maxLength={200} placeholder="Any additional details..." className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 resize-none" />
                <p className="text-[10px] text-charcoal/40 mt-1 text-right">{form.notes.length}/200</p>
              </div>

              <button
                onClick={handleGenerate}
                disabled={!canGenerate || submitting}
                className="w-full flex items-center justify-center gap-2 bg-amber-500 text-white text-sm font-semibold px-4 py-3.5 rounded-full hover:bg-amber-600 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? <><i className="ri-loader-4-line animate-spin" /> Generating...</> : <><i className="ri-file-text-line" /> Generate Receipt</>}
              </button>
            </div>

            {/* Live preview */}
            <div className="lg:sticky lg:top-24 lg:self-start">
              <div className="bg-white rounded-3xl border border-black/5 overflow-hidden">
                <div className="p-4 border-b border-black/5 flex items-center justify-between">
                  <h2 className="text-sm font-bold text-charcoal">Live Preview</h2>
                  <button onClick={async () => { const e = await viewDocument(previewHtml); if (e) addToast(e, 'error'); }} className="text-xs text-amber-600 font-medium hover:text-amber-700 flex items-center gap-1 cursor-pointer">
                    <i className="ri-printer-line" /> Print
                  </button>
                </div>
                <iframe title="Receipt preview" srcDoc={previewHtml} className="w-full h-[900px] border-0" />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-4">
            {loading ? (
              <div className="bg-white rounded-3xl border border-black/5 p-12 text-center text-sm text-charcoal/40">Loading receipts…</div>
            ) : fetchError ? (
              // A failed fetch must never look like "no receipts yet" --
              // that invites issuing a duplicate receipt.
              <div className="bg-white rounded-3xl border border-red-100 p-12 text-center">
                <div className="w-14 h-14 flex items-center justify-center mx-auto mb-4 bg-red-50 rounded-full">
                  <i className="ri-wifi-off-line text-2xl text-red-500" />
                </div>
                <h3 className="text-base font-bold text-charcoal mb-2">Couldn't load your receipts</h3>
                <p className="text-sm text-charcoal/60 mb-5">Your existing receipts may not be shown. Please retry before creating a new one.</p>
                <button onClick={() => refresh()} className="bg-charcoal text-white px-6 py-2.5 rounded-full text-sm font-medium hover:bg-black transition-colors whitespace-nowrap cursor-pointer">Retry</button>
              </div>
            ) : receipts.length === 0 ? (
              <div className="bg-white rounded-3xl border border-black/5 p-12 text-center">
                <div className="w-14 h-14 flex items-center justify-center mx-auto mb-4 bg-amber-50 rounded-full">
                  <i className="ri-file-text-line text-2xl text-amber-500" />
                </div>
                <h3 className="text-base font-bold text-charcoal mb-2">No receipts yet</h3>
                <p className="text-sm text-charcoal/60 mb-5">Generate your first rent receipt using the Create tab.</p>
                <button onClick={() => setActiveTab('create')} className="bg-amber-500 text-white px-6 py-2.5 rounded-full text-sm font-medium hover:bg-amber-600 transition-colors whitespace-nowrap cursor-pointer">Create Receipt</button>
              </div>
            ) : (
              receipts.map((r) => (
                <div key={r.id} className="bg-white rounded-3xl border border-black/5 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-charcoal">{r.receiptNumber}</p>
                      {r.sentToTenant ? (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-600">Shared with Tenant</span>
                      ) : (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">Not Shared</span>
                      )}
                    </div>
                    <p className="text-xs text-charcoal/60 mt-1">{r.tenantName} · {r.propertyAddress}</p>
                    <p className="text-xs text-charcoal/40 mt-0.5">{r.periodFrom} to {r.periodTo} · ₹{r.rentAmount.toLocaleString('en-IN')}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => setViewingReceiptId(r.id)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-black/10 text-xs font-medium text-charcoal hover:border-amber-400 hover:text-amber-600 transition-colors cursor-pointer whitespace-nowrap">
                      <i className="ri-eye-line text-sm" /> View
                    </button>
                    {!r.sentToTenant && (
                      <button onClick={() => { markShared(r.id); addToast('Receipt shared with tenant', 'success'); }} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-amber-200 text-xs font-medium text-amber-700 hover:bg-amber-50 transition-colors cursor-pointer whitespace-nowrap">
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
        {viewingReceipt && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
            <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[92vh] overflow-hidden flex flex-col">
              <div className="p-4 border-b border-black/5 flex items-center justify-between flex-shrink-0">
                <h3 className="text-sm font-bold text-charcoal">{viewingReceipt.receiptNumber}</h3>
                <div className="flex items-center gap-2">
                  <button onClick={async () => { const e = await viewDocument(buildRentReceiptHtml(viewingReceipt), `Rent receipt ${viewingReceipt.receiptNumber}`); if (e) addToast(e, 'error'); }} className="text-xs text-amber-600 font-medium hover:text-amber-700 flex items-center gap-1 cursor-pointer">
                    <i className="ri-printer-line" /> Print
                  </button>
                  <button onClick={() => setViewingReceiptId(null)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-lightgray transition-colors cursor-pointer">
                    <i className="ri-close-line text-charcoal/60" />
                  </button>
                </div>
              </div>
              <iframe title="Receipt view" srcDoc={buildRentReceiptHtml(viewingReceipt)} className="w-full flex-1 border-0" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

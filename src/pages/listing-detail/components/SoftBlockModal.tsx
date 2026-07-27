import { useState } from 'react';
import { useBrokerReport } from '@/hooks/useBrokerReport';
import { useToast } from '@/hooks/useToast';

interface SoftBlockModalProps {
  open: boolean;
  onClose: () => void;
  tenantId: string;
  tenantName: string;
}

export default function SoftBlockModal({ open, onClose, tenantId, tenantName }: SoftBlockModalProps) {
  const broker = useBrokerReport(tenantId);
  const { addToast } = useToast();
  const [aadhaarDone, setAadhaarDone] = useState(broker.softBlockState.aadhaar_re_verified);
  const [showDetailsForm, setShowDetailsForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [employerName, setEmployerName] = useState(broker.softBlockState.details?.employerName ?? '');
  const [companyAddress, setCompanyAddress] = useState(broker.softBlockState.details?.companyAddress ?? '');
  const [referenceContact, setReferenceContact] = useState(broker.softBlockState.details?.referenceContact ?? '');
  const [purposeOfRenting, setPurposeOfRenting] = useState(broker.softBlockState.details?.purposeOfRenting ?? '');

  const handleAadhaarReverify = async () => {
    await broker.resolveAadhaar();
    setAadhaarDone(true);
    addToast('Aadhaar re-verified successfully', 'success');
  };

  const handleSubmitDetails = async () => {
    if (!employerName.trim() || !companyAddress.trim() || !referenceContact.trim() || !purposeOfRenting.trim()) {
      addToast('Please fill in all required fields', 'error');
      return;
    }
    setSubmitting(true);
    await broker.submitDetails({ employerName: employerName.trim(), companyAddress: companyAddress.trim(), referenceContact: referenceContact.trim(), purposeOfRenting: purposeOfRenting.trim() });
    setSubmitting(false);
    setShowDetailsForm(false);
    addToast('Additional details submitted for review', 'success');
  };

  const resolved = broker.softBlockState.aadhaar_re_verified && broker.softBlockState.additional_details_provided;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl max-w-md w-full shadow-xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="bg-red-50 p-5 border-b border-red-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-red-100">
                <i className="ri-error-warning-line text-lg text-red-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-charcoal">Account Restricted</h3>
                <p className="text-xs text-charcoal/60">{tenantName}</p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-red-100 transition-colors cursor-pointer">
              <i className="ri-close-line text-charcoal/60" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {resolved ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 flex items-center justify-center mx-auto mb-3 rounded-full bg-green-50">
                <i className="ri-checkbox-circle-line text-xl text-green-600" />
              </div>
              <p className="text-sm font-bold text-charcoal mb-1">All Steps Completed</p>
              <p className="text-xs text-charcoal/60">Our team is reviewing your details. You will be notified within 24 hours once the restriction is lifted.</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-charcoal/60 leading-relaxed">
                Your account was flagged after multiple owners reported suspicious activity. To continue contacting landlords, complete the steps below:
              </p>

              {/* Step 1: Aadhaar */}
              <div className={`rounded-xl border p-4 transition-all ${broker.softBlockState.aadhaar_re_verified ? 'border-green-200 bg-green-50' : 'border-black/5 bg-white'}`}>
                <div className="flex items-center gap-2.5">
                  <div className={`w-7 h-7 flex items-center justify-center rounded-full text-xs font-bold flex-shrink-0 ${broker.softBlockState.aadhaar_re_verified ? 'bg-green-500 text-white' : 'bg-red-100 text-red-600'}`}>
                    {broker.softBlockState.aadhaar_re_verified ? <i className="ri-check-line text-sm" /> : '1'}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-charcoal">Re-verify Aadhaar</p>
                    <p className="text-xs text-charcoal/40 mt-0.5">Confirm your identity with a fresh OTP.</p>
                  </div>
                  {!broker.softBlockState.aadhaar_re_verified && (
                    <button
                      onClick={handleAadhaarReverify}
                      className="px-3 py-1.5 rounded-full bg-red-500 text-white text-xs font-semibold hover:bg-red-600 transition-colors cursor-pointer whitespace-nowrap flex-shrink-0"
                    >
                      Verify Now
                    </button>
                  )}
                </div>
              </div>

              {/* Step 2: Additional Details */}
              <div className={`rounded-xl border p-4 transition-all ${broker.softBlockState.additional_details_provided ? 'border-green-200 bg-green-50' : 'border-black/5 bg-white'}`}>
                <div className="flex items-center gap-2.5">
                  <div className={`w-7 h-7 flex items-center justify-center rounded-full text-xs font-bold flex-shrink-0 ${broker.softBlockState.additional_details_provided ? 'bg-green-500 text-white' : 'bg-red-100 text-red-600'}`}>
                    {broker.softBlockState.additional_details_provided ? <i className="ri-check-line text-sm" /> : '2'}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-charcoal">Provide Additional Details</p>
                    <p className="text-xs text-charcoal/40 mt-0.5">Employer, reference, and purpose of renting.</p>
                  </div>
                  {!broker.softBlockState.additional_details_provided && (
                    <button
                      onClick={() => setShowDetailsForm(!showDetailsForm)}
                      className="px-3 py-1.5 rounded-full border border-black/10 text-xs font-semibold text-charcoal hover:bg-lightgray transition-colors cursor-pointer whitespace-nowrap flex-shrink-0"
                    >
                      {showDetailsForm ? 'Close' : 'Fill Details'}
                    </button>
                  )}
                </div>

                {showDetailsForm && !broker.softBlockState.additional_details_provided && (
                  <div className="mt-3 space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-charcoal/60 mb-1.5">Employer / Organization Name</label>
                      <input
                        value={employerName}
                        onChange={(e) => setEmployerName(e.target.value)}
                        className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-200"
                        placeholder="e.g. Infosys Ltd."
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-charcoal/60 mb-1.5">Company / Office Address</label>
                      <input
                        value={companyAddress}
                        onChange={(e) => setCompanyAddress(e.target.value)}
                        className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-200"
                        placeholder="Bangalore, Karnataka"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-charcoal/60 mb-1.5">Reference Contact (Manager / HR)</label>
                      <input
                        value={referenceContact}
                        onChange={(e) => setReferenceContact(e.target.value)}
                        className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-200"
                        placeholder="+91 98765 43210"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-charcoal/60 mb-1.5">Purpose of Renting</label>
                      <textarea
                        value={purposeOfRenting}
                        onChange={(e) => setPurposeOfRenting(e.target.value)}
                        rows={3}
                        maxLength={500}
                        className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-200 resize-none"
                        placeholder="Why are you looking for this property?"
                      />
                      <p className="text-[10px] text-charcoal/40 mt-1 text-right">{purposeOfRenting.length}/500</p>
                    </div>
                    <button
                      onClick={handleSubmitDetails}
                      disabled={submitting}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
                    >
                      {submitting ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-send-plane-line text-sm" />}
                      {submitting ? 'Submitting...' : 'Submit Details'}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="p-5 pt-0">
          <button onClick={onClose} className="w-full px-4 py-2.5 rounded-full border border-black/10 text-sm font-medium text-charcoal/60 hover:bg-lightgray transition-colors cursor-pointer whitespace-nowrap">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
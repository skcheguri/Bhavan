import { useState } from 'react';

interface Props {
  rentAmount: number;
  onClose: () => void;
  onSetup: (upiId: string, bank: string) => void;
}

const banks = [
  { id: 'icici', name: 'ICICI Bank', icon: 'ri-bank-line' },
  { id: 'hdfc', name: 'HDFC Bank', icon: 'ri-bank-line' },
  { id: 'sbi', name: 'State Bank of India', icon: 'ri-bank-line' },
  { id: 'axis', name: 'Axis Bank', icon: 'ri-bank-line' },
  { id: 'kotak', name: 'Kotak Mahindra', icon: 'ri-bank-line' },
];

export default function AutoPaySetupModal({ rentAmount, onClose, onSetup }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [upiId, setUpiId] = useState('');
  const [selectedBank, setSelectedBank] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  const handleSetup = () => {
    setStep(3);
    setTimeout(() => {
      onSetup(upiId, selectedBank);
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-brand/5 px-6 py-5 border-b border-brand/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 flex items-center justify-center rounded-xl bg-brand/20">
              <i className="ri-repeat-line text-brand text-lg" />
            </div>
            <div>
              <p className="text-xs text-brand font-semibold uppercase tracking-wide">UPI AutoPay</p>
              <h2 className="text-base font-bold text-charcoal">Setup Mandate</h2>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-lightgray transition-colors cursor-pointer">
            <i className="ri-close-line text-charcoal/40 text-xl" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {step === 3 ? (
            <div className="text-center py-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-green-100 flex items-center justify-center mb-4">
                <i className="ri-checkbox-circle-line text-green-500 text-3xl" />
              </div>
              <h3 className="text-lg font-bold text-charcoal">AutoPay Activated!</h3>
              <p className="text-sm text-charcoal/60 mt-1">Your rent of ₹{(rentAmount / 100).toLocaleString('en-IN')} will be auto-debited monthly.</p>
            </div>
          ) : (
            <>
              {/* Amount display */}
              <div className="bg-offwhite rounded-xl p-4 text-center">
                <p className="text-xs text-charcoal/40 uppercase tracking-wide mb-1">Monthly Auto-Debit</p>
                <p className="text-2xl font-black text-charcoal">₹{(rentAmount / 100).toLocaleString('en-IN')}</p>
                <p className="text-xs text-charcoal/60 mt-1">On the 1st of every month</p>
              </div>

              {/* Step indicator */}
              <div className="flex items-center gap-2">
                {[1, 2, 3].map((s) => (
                  <div key={s} className={`h-1.5 flex-1 rounded-full transition-colors ${s <= step ? 'bg-brand' : 'bg-gray-200'}`} />
                ))}
              </div>

              {step === 1 && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-charcoal mb-1.5 uppercase tracking-wide">Enter UPI ID</label>
                    <input
                      type="text"
                      value={upiId}
                      onChange={(e) => setUpiId(e.target.value)}
                      placeholder="yourname@okicici"
                      className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 border border-black/5"
                    />
                  </div>
                  <div className="bg-lightgray rounded-xl px-4 py-3 flex items-start gap-2">
                    <i className="ri-shield-check-line text-brand text-sm flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-charcoal/70 leading-relaxed">
                      Your UPI ID will be verified via Razorpay eNACH. You'll receive an approval request on your UPI app.
                    </p>
                  </div>
                  <button
                    onClick={() => setStep(2)}
                    disabled={!upiId.includes('@')}
                    className="w-full py-3 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-dark transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Continue
                  </button>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-charcoal mb-1.5 uppercase tracking-wide">Select Bank Account</label>
                    <div className="space-y-2">
                      {banks.map((bank) => (
                        <button
                          key={bank.id}
                          onClick={() => setSelectedBank(bank.id)}
                          className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                            selectedBank === bank.id
                              ? 'border-brand bg-brand/5'
                              : 'border-black/5 hover:border-black/10'
                          }`}
                        >
                          <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-lightgray">
                            <i className={`${bank.icon} text-sm text-charcoal/60`} />
                          </div>
                          <span className="text-sm font-medium text-charcoal">{bank.name}</span>
                          {selectedBank === bank.id && (
                            <i className="ri-checkbox-circle-fill text-brand text-lg ml-auto" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                      className="w-4 h-4 rounded border-black/15 text-brand focus:ring-brand/30 cursor-pointer"
                    />
                    <label className="text-xs text-charcoal/70 leading-relaxed">
                      I authorize Bhavan to auto-debit ₹{(rentAmount / 100).toLocaleString('en-IN')} monthly from my selected UPI ID until I cancel.
                    </label>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setStep(1)}
                      className="flex-1 py-3 rounded-xl border border-black/10 text-sm font-medium text-charcoal/60 hover:bg-lightgray transition-colors cursor-pointer whitespace-nowrap"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleSetup}
                      disabled={!selectedBank || !confirmed}
                      className="flex-1 py-3 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-dark transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Activate AutoPay
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
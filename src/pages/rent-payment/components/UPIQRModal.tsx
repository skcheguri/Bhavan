import { useState, useEffect } from 'react';

interface Props {
  amount: number;
  tenantName: string;
  landlordVpa: string;
  onClose: () => void;
  onPaid: () => void;
}

const paymentModes = [
  { icon: 'ri-google-fill', label: 'Google Pay' },
  { icon: 'ri-smartphone-line', label: 'PhonePe' },
  { icon: 'ri-wallet-3-line', label: 'Paytm' },
  { icon: 'ri-shield-check-line', label: 'BHIM' },
  { icon: 'ri-bank-card-line', label: 'Any UPI App' },
];

export default function UPIQRModal({ amount, tenantName, landlordVpa, onClose, onPaid }: Props) {
  const [timer, setTimer] = useState(120);
  const [status, setStatus] = useState<'waiting' | 'processing' | 'success' | 'failed'>('waiting');

  useEffect(() => {
    if (timer <= 0 || status !== 'waiting') return;
    const interval = setInterval(() => setTimer((t) => t - 1), 1000);
    return () => clearInterval(interval);
  }, [timer, status]);

  useEffect(() => {
    if (status !== 'processing') return;
    const timeout = setTimeout(() => {
      setStatus('success');
      setTimeout(onPaid, 1500);
    }, 2500);
    return () => clearTimeout(timeout);
  }, [status, onPaid]);

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-amber-50 px-6 py-5 border-b border-amber-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 flex items-center justify-center rounded-xl bg-amber-100">
              <i className="ri-qr-code-line text-amber-700 text-lg" />
            </div>
            <div>
              <p className="text-xs text-amber-600 font-semibold uppercase tracking-wide">UPI QR Payment</p>
              <h2 className="text-base font-bold text-charcoal">Scan & Pay</h2>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-amber-100 transition-colors cursor-pointer">
            <i className="ri-close-line text-charcoal/40 text-xl" />
          </button>
        </div>

        <div className="px-6 py-6 space-y-5">
          {status === 'success' && (
            <div className="text-center py-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-green-100 flex items-center justify-center mb-4">
                <i className="ri-checkbox-circle-line text-green-500 text-3xl" />
              </div>
              <h3 className="text-lg font-bold text-charcoal">Payment Successful!</h3>
              <p className="text-sm text-charcoal/60 mt-1">Your rent payment has been recorded.</p>
            </div>
          )}

          {status !== 'success' && (
            <>
              {/* Amount */}
              <div className="bg-offwhite rounded-xl p-4 text-center">
                <p className="text-xs text-charcoal/40 uppercase tracking-wide mb-1">Amount</p>
                <p className="text-3xl font-black text-charcoal">₹{(amount / 100).toLocaleString('en-IN')}</p>
                <p className="text-xs text-charcoal/60 mt-1">{tenantName} → {landlordVpa}</p>
              </div>

              {/* QR Placeholder */}
              <div className="flex flex-col items-center gap-3">
                <div className="w-56 h-56 bg-white border-2 border-black/10 rounded-xl flex flex-col items-center justify-center relative">
                  {status === 'waiting' && (
                    <>
                      <div className="w-44 h-44 bg-lightgray rounded-lg flex items-center justify-center">
                        <div className="w-36 h-36 border-2 border-dashed border-black/15 rounded-lg flex flex-col items-center justify-center gap-2">
                          <i className="ri-qr-code-line text-4xl text-charcoal/30" />
                          <p className="text-[10px] text-charcoal/40 text-center leading-tight">QR Code<br />Placeholder</p>
                        </div>
                      </div>
                      <p className="text-xs text-charcoal/40 mt-2">Expires in <span className="font-semibold text-amber-600">{formatTime(timer)}</span></p>
                    </>
                  )}
                  {status === 'processing' && (
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 rounded-full border-2 border-amber-300 border-t-amber-600 animate-spin" />
                      <p className="text-sm font-medium text-charcoal">Processing payment...</p>
                    </div>
                  )}
                  {status === 'failed' && (
                    <div className="flex flex-col items-center gap-3">
                      <i className="ri-error-warning-line text-4xl text-red-500" />
                      <p className="text-sm font-medium text-charcoal">Payment failed</p>
                      <button onClick={() => setStatus('waiting')} className="text-xs font-semibold text-amber-600 hover:text-amber-700 cursor-pointer">
                        Try Again
                      </button>
                    </div>
                  )}
                </div>
                <p className="text-xs text-charcoal/40 text-center">Scan with any UPI app on your phone</p>
              </div>

              {/* UPI App Icons */}
              <div className="grid grid-cols-5 gap-2">
                {paymentModes.map((mode) => (
                  <div key={mode.label} className="flex flex-col items-center gap-1 p-2 rounded-xl hover:bg-lightgray transition-colors cursor-pointer">
                    <div className="w-10 h-10 flex items-center justify-center">
                      <i className={`${mode.icon} text-xl text-charcoal/70`} />
                    </div>
                    <span className="text-[10px] text-charcoal/60 text-center leading-tight">{mode.label}</span>
                  </div>
                ))}
              </div>

              {/* Simulate actions */}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setStatus('processing')}
                  className="flex-1 py-3 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 transition-colors cursor-pointer whitespace-nowrap"
                >
                  Simulate Payment
                </button>
                <button
                  onClick={() => setStatus('failed')}
                  className="flex-1 py-3 rounded-xl border border-black/10 text-sm font-medium text-charcoal/60 hover:bg-lightgray transition-colors cursor-pointer whitespace-nowrap"
                >
                  Simulate Failure
                </button>
              </div>

              <div className="bg-lightgray rounded-xl px-4 py-3 flex items-start gap-2">
                <i className="ri-information-line text-charcoal/40 text-sm flex-shrink-0 mt-0.5" />
                <p className="text-xs text-charcoal/60 leading-relaxed">
                  In production, this QR would be a live Razorpay payment link. The payment status updates automatically via webhook.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
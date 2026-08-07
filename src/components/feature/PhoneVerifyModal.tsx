import { useDismissableLayer } from '@/hooks/useDismissableLayer';
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';

interface Props {
  phone: string;
  onClose: () => void;
  onVerified: () => void;
}

export default function PhoneVerifyModal({ phone, onClose, onVerified }: Props) {
  useDismissableLayer(onClose);
  const { sendPhoneVerificationOtp, confirmPhoneVerificationOtp } = useAuth();
  const [step, setStep] = useState<'send' | 'code'>('send');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSendOtp = async () => {
    setBusy(true);
    setError('');
    const { error: sendError } = await sendPhoneVerificationOtp(phone);
    setBusy(false);
    if (sendError) {
      setError(sendError);
      return;
    }
    setStep('code');
  };

  const handleConfirm = async () => {
    if (!/^\d{4,8}$/.test(code)) {
      setError('Enter the OTP you received.');
      return;
    }
    setBusy(true);
    setError('');
    const { error: confirmError } = await confirmPhoneVerificationOtp(phone, code);
    setBusy(false);
    if (confirmError) {
      setError(confirmError);
      return;
    }
    onVerified();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden">
        <div className="p-5 border-b border-black/5 flex items-center justify-between">
          <h3 className="text-sm font-bold text-charcoal">Verify phone number</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-lightgray transition-colors cursor-pointer">
            <i className="ri-close-line text-charcoal/60" />
          </button>
        </div>
        <div className="p-5">
          {step === 'send' ? (
            <>
              <p className="text-sm text-charcoal/70">
                We'll send a one-time code to <span className="font-semibold text-charcoal">{phone}</span> to confirm it's yours.
              </p>
              {error && <p className="text-xs text-red-500 mt-3">{error}</p>}
              <button
                onClick={handleSendOtp}
                disabled={busy}
                className="mt-5 w-full bg-brand hover:bg-brand-dark disabled:opacity-60 text-white text-sm font-semibold py-3 rounded-full transition-colors whitespace-nowrap cursor-pointer"
              >
                {busy ? 'Sending...' : 'Send OTP'}
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-charcoal/70">
                Enter the code sent to <span className="font-semibold text-charcoal">{phone}</span>.
              </p>
              <input
                type="text"
                inputMode="numeric"
                maxLength={8}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="6-digit code"
                className="mt-3 w-full px-4 py-3 bg-offwhite rounded-xl text-sm text-center tracking-[0.3em] focus:outline-none focus:ring-2 focus:ring-amber-300"
              />
              {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
              <button
                onClick={handleConfirm}
                disabled={busy}
                className="mt-4 w-full bg-brand hover:bg-brand-dark disabled:opacity-60 text-white text-sm font-semibold py-3 rounded-full transition-colors whitespace-nowrap cursor-pointer"
              >
                {busy ? 'Verifying...' : 'Confirm'}
              </button>
              <button
                onClick={handleSendOtp}
                disabled={busy}
                className="mt-2 w-full text-xs text-charcoal/50 hover:text-charcoal font-medium py-1 cursor-pointer"
              >
                Resend code
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

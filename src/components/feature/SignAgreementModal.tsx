import { useState } from 'react';
import { useDismissableLayer } from '@/hooks/useDismissableLayer';
import { useFocusTrap } from '@/hooks/useFocusTrap';

interface SignAgreementModalProps {
  agreementNumber: string;
  /** Pre-fills the name field with the signer's own name. */
  defaultName?: string;
  party: 'landlord' | 'tenant';
  busy?: boolean;
  onSign: (name: string) => void;
  onClose: () => void;
}

// Typed-name + consent electronic signature (the product decision for the
// MVP). The legally stamped copy still comes from the admin stamp-duty
// step; this records intent, the name signed, and the timestamp.
export default function SignAgreementModal({ agreementNumber, defaultName, party, busy, onSign, onClose }: SignAgreementModalProps) {
  useDismissableLayer(onClose);
  const dialogRef = useFocusTrap<HTMLDivElement>(onClose);
  const [name, setName] = useState(defaultName ?? '');
  const [consent, setConsent] = useState(false);

  const canSign = name.trim().length >= 2 && consent && !busy;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4" onClick={onClose}>
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Sign rental agreement" className="bg-white rounded-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b border-black/5">
          <h2 className="text-lg font-bold text-charcoal">Sign agreement</h2>
          <p className="text-xs text-charcoal/60 mt-0.5">{agreementNumber}</p>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label htmlFor="sign-agreement-name" className="block text-sm font-medium text-charcoal mb-1.5">Full name ({party})</label>
            <input
              id="sign-agreement-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Type your full legal name"
              className="w-full px-4 py-3 bg-lightgray rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          </div>
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="w-4 h-4 mt-0.5 rounded border-black/15 text-brand focus:ring-brand"
            />
            <span className="text-xs text-charcoal/70 leading-relaxed">
              I have read this rental agreement and consent to signing it electronically. I understand this signature,
              my name, and the time are recorded, and the final stamped copy will be issued after stamp duty.
            </span>
          </label>
          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-full border border-black/10 text-sm font-medium text-charcoal/60 hover:bg-lightgray transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={() => onSign(name.trim())}
              disabled={!canSign}
              className="flex-1 py-2.5 rounded-full bg-brand text-white text-sm font-semibold hover:bg-brand-dark transition-colors cursor-pointer disabled:opacity-40"
            >
              {busy ? 'Signing…' : 'Sign agreement'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useSubscription } from '@/hooks/useSubscription';
import { useToast } from '@/hooks/useToast';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  plan: 'pro_monthly' | 'pro_annual';
}

export default function UpgradeModal({ isOpen, onClose, plan }: UpgradeModalProps) {
  const { upgradeToPro } = useSubscription();
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);

  const monthlyPrice = 199;
  const annualPrice = 999;
  const selectedPlanLabel = plan === 'pro_monthly' ? 'Monthly' : 'Annual';
  const selectedPrice = plan === 'pro_monthly' ? monthlyPrice : annualPrice;
  const gst = Math.round(selectedPrice * 0.18);
  const total = selectedPrice + gst;

  const handleUpgrade = async () => {
    setLoading(true);
    const { error, cancelled } = await upgradeToPro(plan);
    setLoading(false);
    if (error) {
      addToast(error, 'error');
    } else if (cancelled) {
      // Owner closed the Razorpay window without paying -- nothing
      // happened, so no success toast and the modal stays open.
    } else {
      addToast(`Upgraded to Pro (${selectedPlanLabel}) successfully!`, 'success');
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl max-w-md w-full shadow-xl p-6">
        <div className="w-14 h-14 mx-auto rounded-full bg-amber-100 flex items-center justify-center mb-4">
          <i className="ri-vip-crown-line text-2xl text-amber-600" />
        </div>
        <h3 className="text-lg font-bold text-charcoal text-center mb-1">Upgrade to Pro</h3>
        <p className="text-sm text-charcoal/60 text-center mb-5">
          {selectedPlanLabel} plan — unlock unlimited listings, advanced analytics, and priority support.
        </p>

        <div className="bg-offwhite rounded-xl p-4 space-y-2 mb-5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-charcoal/60">Plan</span>
            <span className="font-semibold text-charcoal">Pro {selectedPlanLabel}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-charcoal/60">Subtotal</span>
            <span className="font-semibold text-charcoal">₹{selectedPrice.toLocaleString('en-IN')}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-charcoal/60">GST (18%)</span>
            <span className="font-semibold text-charcoal">₹{gst.toLocaleString('en-IN')}</span>
          </div>
          <div className="border-t border-black/10 pt-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-charcoal">Total</span>
            <span className="text-lg font-bold text-amber-600">₹{total.toLocaleString('en-IN')}</span>
          </div>
        </div>

        <p className="text-xs text-charcoal/40 text-center mb-4">
          Payment powered by Razorpay. All transactions are secure.
        </p>

        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-full border border-black/10 text-sm font-medium text-charcoal/60 hover:bg-lightgray transition-colors cursor-pointer whitespace-nowrap"
          >
            Cancel
          </button>
          <button
            onClick={handleUpgrade}
            disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-full bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60"
          >
            {loading ? 'Processing...' : `Pay ₹${total.toLocaleString('en-IN')}`}
          </button>
        </div>
      </div>
    </div>
  );
}
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSubmitContactInquiry } from '@/hooks/useContactInquiries';
import { useToast } from '@/hooks/useToast';

interface Props {
  onClose: () => void;
}

export default function DeleteAccountModal({ onClose }: Props) {
  const { user } = useAuth();
  const { submit, submitting } = useSubmitContactInquiry();
  const { addToast } = useToast();
  const [submitted, setSubmitted] = useState(false);

  const handleConfirm = async () => {
    if (!user) return;
    const { error } = await submit({
      name: user.name,
      email: user.email,
      subject: 'Account Deletion Request',
      message: `Account holder ${user.name} (${user.email}, user id ${user.id}) has requested permanent deletion of their Bhavan account and all associated data.`,
    });
    if (error) {
      addToast(error, 'error');
      return;
    }
    setSubmitted(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-black/5 flex items-center justify-between">
          <h3 className="text-sm font-bold text-charcoal">{submitted ? 'Request Submitted' : 'Delete your account?'}</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-lightgray transition-colors cursor-pointer">
            <i className="ri-close-line text-charcoal/60" />
          </button>
        </div>
        <div className="p-5">
          {submitted ? (
            <p className="text-sm text-charcoal/70 leading-relaxed">
              We've received your request. Our team will review it and confirm by email within a few business days before anything is deleted.
            </p>
          ) : (
            <>
              <p className="text-sm text-charcoal/70 leading-relaxed">
                This submits a request to permanently delete your account, listings, messages, and rental history. Our team reviews and
                confirms by email before anything is removed — this isn't instant, and can't be undone once processed.
              </p>
              <div className="mt-5 flex gap-3">
                <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-black/10 text-sm font-medium text-charcoal/60 hover:bg-lightgray transition-colors cursor-pointer whitespace-nowrap">
                  Cancel
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={submitting}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
                >
                  {submitting ? 'Submitting...' : 'Request Deletion'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

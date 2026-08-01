import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';

interface Props {
  onClose: () => void;
}

const CONFIRM_TEXT = 'DELETE';

export default function DeleteAccountModal({ onClose }: Props) {
  const { deleteMyAccount } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [confirmInput, setConfirmInput] = useState('');
  const [deleting, setDeleting] = useState(false);

  const canDelete = confirmInput === CONFIRM_TEXT && !deleting;

  const handleConfirm = async () => {
    if (!canDelete) return;
    setDeleting(true);
    const { error } = await deleteMyAccount();
    setDeleting(false);
    if (error) {
      addToast(error, 'error');
      return;
    }
    addToast('Your account has been deleted.', 'success');
    onClose();
    navigate('/', { replace: true });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-black/5 flex items-center justify-between">
          <h3 className="text-sm font-bold text-charcoal">Delete your account?</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-lightgray transition-colors cursor-pointer">
            <i className="ri-close-line text-charcoal/60" />
          </button>
        </div>
        <div className="p-5">
          <p className="text-sm text-charcoal/70 leading-relaxed">
            This happens immediately and can't be undone. Your name, email, phone, and other personal details are permanently erased,
            your listings are taken down, and you're signed out right away.
          </p>
          <p className="text-sm text-charcoal/70 leading-relaxed mt-3">
            Records shared with someone else -- rent payments, signed agreements, receipts, and reviews -- are kept for the other
            party and for legal/tax record-keeping, but will no longer show your name.
          </p>
          <div className="mt-5">
            <label htmlFor="delete-confirm-input" className="block text-xs font-semibold text-charcoal/60 mb-1.5">
              Type <span className="font-mono text-charcoal">{CONFIRM_TEXT}</span> to confirm
            </label>
            <input
              id="delete-confirm-input"
              type="text"
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              autoComplete="off"
              className="w-full px-3 py-2.5 bg-lightgray rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
              placeholder={CONFIRM_TEXT}
            />
          </div>
          <div className="mt-5 flex gap-3">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-black/10 text-sm font-medium text-charcoal/60 hover:bg-lightgray transition-colors cursor-pointer whitespace-nowrap">
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!canDelete}
              className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer whitespace-nowrap"
            >
              {deleting ? 'Deleting...' : 'Delete Account'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

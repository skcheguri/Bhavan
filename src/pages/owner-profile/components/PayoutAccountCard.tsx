import { useEffect, useState } from 'react';
import { usePayoutAccount } from '@/hooks/useHostPayouts';
import { useToast } from '@/hooks/useToast';

interface PayoutAccountCardProps {
  userId: string | undefined;
}

// Mirror the DB CHECK constraints so malformed VPAs / IFSC / account numbers
// are caught before they ever hit the network.
const UPI_RE = /^[a-zA-Z0-9._-]{2,}@[a-zA-Z]{2,}$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const ACCOUNT_RE = /^[0-9]{9,18}$/;

// Where booking earnings get transferred. Stage 1 of host payouts: the
// account is stored here and shown to the admin next to each due payout;
// the transfer itself is executed manually until Razorpay Route is live.
export default function PayoutAccountCard({ userId }: PayoutAccountCardProps) {
  const { account, loading, saving, save } = usePayoutAccount(userId);
  const { addToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [method, setMethod] = useState<'upi' | 'bank'>('upi');
  const [upiId, setUpiId] = useState('');
  const [accountHolder, setAccountHolder] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (account) {
      setMethod((account.method as 'upi' | 'bank') ?? 'upi');
      setUpiId(account.upi_id ?? '');
      setAccountHolder(account.account_holder ?? '');
      setAccountNumber(account.account_number ?? '');
      setIfsc(account.ifsc ?? '');
    }
  }, [account]);

  const handleSave = async () => {
    if (method === 'upi') {
      if (!UPI_RE.test(upiId.trim())) {
        setFormError('Enter a valid UPI ID, e.g. yourname@bank.');
        return;
      }
    } else {
      if (!ACCOUNT_RE.test(accountNumber.trim())) {
        setFormError('Enter a valid account number (9 to 18 digits).');
        return;
      }
      if (!IFSC_RE.test(ifsc.trim().toUpperCase())) {
        setFormError('Enter a valid IFSC code, e.g. HDFC0001234.');
        return;
      }
    }
    setFormError('');

    const { error } = await save({ method, upiId, accountHolder, accountNumber, ifsc });
    if (error) {
      addToast(error, 'error');
    } else {
      addToast('Payout account saved.', 'success');
      setEditing(false);
    }
  };

  const maskedSummary = account
    ? account.method === 'upi'
      ? account.upi_id
      : `${account.account_holder} · A/C ****${(account.account_number ?? '').slice(-4)} · ${account.ifsc}`
    : null;

  return (
    <div className="bg-white rounded-2xl border border-black/5 p-6 sm:p-7">
      <div className="flex items-start justify-between gap-3 mb-1.5">
        <h2 className="text-[15px] font-semibold text-charcoal flex items-center gap-2">
          <div className="w-6 h-6 flex items-center justify-center">
            <i className="ri-bank-line text-brand" />
          </div>
          Payout Account
        </h2>
        {account && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-xs font-semibold text-brand hover:text-brand-dark cursor-pointer"
          >
            <i className="ri-pencil-line mr-1" />Edit
          </button>
        )}
      </div>
      <p className="text-xs text-charcoal/50 mb-4">
        Vacation booking earnings (your nightly total; the 5% platform fee is retained) are transferred here
        after each stay completes. You&apos;ll get a notification for every payout.
      </p>

      {loading ? (
        <p className="text-sm text-charcoal/40">Loading…</p>
      ) : account && !editing ? (
        <div className="flex items-center gap-3 bg-offwhite rounded-xl px-4 py-3">
          <i className={`${account.method === 'upi' ? 'ri-smartphone-line' : 'ri-bank-card-line'} text-brand`} />
          <div>
            <p className="text-sm font-semibold text-charcoal">{account.method === 'upi' ? 'UPI' : 'Bank transfer'}</p>
            <p className="text-xs text-charcoal/60">{maskedSummary}</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {!account && (
            <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 rounded-xl px-4 py-3">
              <i className="ri-error-warning-line mt-px" />
              <span>No payout account on file — bookings can still be confirmed, but we can&apos;t transfer your earnings until you add one.</span>
            </div>
          )}
          <div className="inline-flex bg-offwhite rounded-full p-1">
            {(['upi', 'bank'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMethod(m); setFormError(''); }}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                  method === m ? 'bg-brand text-white' : 'text-charcoal/60 hover:text-charcoal'
                }`}
              >
                {m === 'upi' ? 'UPI' : 'Bank account'}
              </button>
            ))}
          </div>

          {method === 'upi' ? (
            <div>
              <label className="block text-xs font-semibold text-charcoal/60 uppercase tracking-wide mb-1.5">UPI ID</label>
              <input
                type="text"
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                placeholder="yourname@bank"
                className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-charcoal/60 uppercase tracking-wide mb-1.5">Account holder</label>
                <input
                  type="text"
                  value={accountHolder}
                  onChange={(e) => setAccountHolder(e.target.value)}
                  placeholder="Name as per bank"
                  className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-charcoal/60 uppercase tracking-wide mb-1.5">Account number</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ''))}
                  placeholder="9 to 18 digits"
                  className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-charcoal/60 uppercase tracking-wide mb-1.5">IFSC</label>
                <input
                  type="text"
                  value={ifsc}
                  onChange={(e) => setIfsc(e.target.value.toUpperCase())}
                  placeholder="e.g. HDFC0001234"
                  maxLength={11}
                  className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                />
              </div>
            </div>
          )}

          {formError && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <i className="ri-error-warning-line" /> {formError}
            </p>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving || (method === 'upi' ? !upiId.trim() : !accountHolder.trim() || !accountNumber.trim() || !ifsc.trim())}
              className="flex items-center gap-1.5 bg-brand text-white text-xs font-semibold px-5 py-2.5 rounded-full hover:bg-brand-dark transition-colors cursor-pointer disabled:opacity-40"
            >
              {saving ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-save-line" />} Save payout account
            </button>
            {account && (
              <button
                onClick={() => setEditing(false)}
                className="text-xs font-semibold text-charcoal/60 hover:text-charcoal px-4 cursor-pointer"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

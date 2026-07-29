import { useState } from 'react';
import { useRentPayment } from '@/hooks/useRentPayment';
import { useRentalAgreements } from '@/hooks/useRentalAgreements';
import { useToast } from '@/hooks/useToast';

interface BankEntry {
  id: string;
  date: string;
  amount: number;
  description: string;
  matched: boolean;
}

interface Props {
  ownerId: string;
  onClose: () => void;
}

export default function ReconciliationPanel({ ownerId, onClose }: Props) {
  const { payments, reconcilePayment, refresh } = useRentPayment();
  const { agreements } = useRentalAgreements(ownerId);
  const { addToast } = useToast();

  // No bank-feed integration exists yet -- entries are typed in by the
  // owner from their own real bank statement, not auto-imported.
  const [entries, setEntries] = useState<BankEntry[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<string | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [showAddEntryModal, setShowAddEntryModal] = useState(false);
  const [newEntry, setNewEntry] = useState({ date: '', amount: '', description: '' });

  const tenantNameByAgreementId = new Map(agreements.map((a) => [a.id, a.tenantName || 'Unknown tenant']));

  const ownerPayments = payments.filter((p) => p.owner_id === ownerId && p.status !== 'reconciled');
  const unmatchedEntries = entries.filter((e) => !e.matched);

  const handleAddEntry = () => {
    if (!newEntry.date || !newEntry.amount || !newEntry.description.trim()) return;
    const amountPaise = Math.round(parseFloat(newEntry.amount) * 100);
    if (isNaN(amountPaise) || amountPaise <= 0) return;
    setEntries((prev) => [
      ...prev,
      { id: `be-${Date.now()}`, date: newEntry.date, amount: amountPaise, description: newEntry.description.trim(), matched: false },
    ]);
    setNewEntry({ date: '', amount: '', description: '' });
    setShowAddEntryModal(false);
  };

  const handleMatch = async () => {
    if (!selectedEntry || !selectedPayment) return;
    const { error } = await reconcilePayment(selectedPayment, note || 'Matched with bank statement');
    if (error) {
      addToast(error, 'error');
      return;
    }
    setEntries((prev) => prev.map((e) => (e.id === selectedEntry ? { ...e, matched: true } : e)));
    setShowMatchModal(false);
    setSelectedEntry(null);
    setSelectedPayment(null);
    setNote('');
    addToast('Payment reconciled successfully', 'success');
    await refresh();
  };

  return (
    <div className="p-6 space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-offwhite rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-charcoal">{entries.filter((e) => e.matched).length}</p>
          <p className="text-xs text-charcoal/60 mt-0.5">Matched</p>
        </div>
        <div className="bg-offwhite rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-amber-600">{unmatchedEntries.length}</p>
          <p className="text-xs text-charcoal/60 mt-0.5">Unmatched</p>
        </div>
        <div className="bg-offwhite rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-charcoal">
            ₹{(entries.filter((e) => e.matched).reduce((s, e) => s + e.amount, 0) / 100).toLocaleString('en-IN')}
          </p>
          <p className="text-xs text-charcoal/60 mt-0.5">Total Matched</p>
        </div>
      </div>

      {/* Unmatched Entries */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-charcoal">Unmatched Bank Entries</h3>
          <button
            onClick={() => setShowAddEntryModal(true)}
            className="text-xs font-semibold text-brand hover:text-brand-dark flex items-center gap-1 cursor-pointer whitespace-nowrap"
          >
            <i className="ri-add-line" /> Add Entry
          </button>
        </div>
        {unmatchedEntries.length === 0 ? (
          <div className="bg-lightgray border border-black/5 rounded-xl p-4 text-center">
            <i className="ri-bank-line text-charcoal/30 text-xl mb-2" />
            <p className="text-sm font-medium text-charcoal/60">No bank entries added yet</p>
            <p className="text-xs text-charcoal/40 mt-0.5">Add a line from your real bank statement to match it against a rent payment.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {unmatchedEntries.map((entry) => (
              <div key={entry.id} className="bg-white border border-black/5 rounded-xl p-4 flex items-center gap-4">
                <div className="w-10 h-10 flex items-center justify-center rounded-lg bg-amber-50 flex-shrink-0">
                  <i className="ri-bank-line text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-charcoal">{entry.description}</p>
                  <p className="text-xs text-charcoal/60">{new Date(entry.date).toLocaleDateString('en-IN')} · ₹{(entry.amount / 100).toLocaleString('en-IN')}</p>
                </div>
                <button
                  onClick={() => { setSelectedEntry(entry.id); setShowMatchModal(true); }}
                  className="px-3 py-1.5 rounded-lg border border-amber-200 text-xs font-medium text-amber-700 hover:bg-amber-50 transition-colors cursor-pointer whitespace-nowrap"
                >
                  Match
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Matched Entries */}
      {entries.some((e) => e.matched) && (
        <div>
          <h3 className="text-sm font-bold text-charcoal mb-3">Matched Entries</h3>
          <div className="space-y-2">
            {entries.filter((e) => e.matched).map((entry) => (
              <div key={entry.id} className="bg-lightgray border border-black/5 rounded-xl p-4 flex items-center gap-4 opacity-70">
                <div className="w-10 h-10 flex items-center justify-center rounded-lg bg-green-50 flex-shrink-0">
                  <i className="ri-checkbox-circle-line text-green-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-charcoal">{entry.description}</p>
                  <p className="text-xs text-charcoal/60">{new Date(entry.date).toLocaleDateString('en-IN')} · ₹{(entry.amount / 100).toLocaleString('en-IN')}</p>
                </div>
                <span className="text-xs font-semibold text-green-600">Reconciled</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Bank Entry Modal */}
      {showAddEntryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setShowAddEntryModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-amber-50 px-6 py-4 border-b border-amber-100">
              <h3 className="text-base font-bold text-charcoal">Add Bank Entry</h3>
              <p className="text-xs text-charcoal/60 mt-0.5">Type in a line from your own bank statement</p>
            </div>
            <div className="px-6 py-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-charcoal/60 mb-1.5 uppercase tracking-wide">Date</label>
                <input
                  type="date"
                  value={newEntry.date}
                  onChange={(e) => setNewEntry((prev) => ({ ...prev, date: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-charcoal/60 mb-1.5 uppercase tracking-wide">Amount (₹)</label>
                <input
                  type="number"
                  min="0"
                  value={newEntry.amount}
                  onChange={(e) => setNewEntry((prev) => ({ ...prev, amount: e.target.value }))}
                  placeholder="22000"
                  className="w-full px-4 py-2.5 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-charcoal/60 mb-1.5 uppercase tracking-wide">Description</label>
                <input
                  type="text"
                  value={newEntry.description}
                  onChange={(e) => setNewEntry((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="e.g., UPI/123456789012/RENT"
                  className="w-full px-4 py-2.5 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-black/5 flex gap-3">
              <button onClick={() => setShowAddEntryModal(false)} className="flex-1 py-2.5 rounded-xl border border-black/10 text-sm font-medium text-charcoal/60 hover:bg-lightgray transition-colors cursor-pointer whitespace-nowrap">Cancel</button>
              <button
                onClick={handleAddEntry}
                disabled={!newEntry.date || !newEntry.amount || !newEntry.description.trim()}
                className="flex-1 py-2.5 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-dark transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add Entry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Match Modal */}
      {showMatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setShowMatchModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-amber-50 px-6 py-4 border-b border-amber-100">
              <h3 className="text-base font-bold text-charcoal">Match Payment</h3>
              <p className="text-xs text-charcoal/60 mt-0.5">Select the rent payment that matches this bank entry</p>
            </div>
            <div className="px-6 py-4 space-y-3 max-h-80 overflow-y-auto">
              {ownerPayments.length === 0 ? (
                <p className="text-sm text-charcoal/60 text-center py-4">No unreconciled payments found.</p>
              ) : (
                ownerPayments.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPayment(p.id)}
                    className={`w-full text-left p-3 rounded-xl border transition cursor-pointer ${
                      selectedPayment === p.id ? 'border-brand bg-brand/5' : 'border-black/5 hover:border-black/10'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-charcoal">{p.month} · {(p.agreement_id && tenantNameByAgreementId.get(p.agreement_id)) || 'Unknown tenant'}</p>
                        <p className="text-xs text-charcoal/60">{p.payment_mode.replace(/_/g, ' ').toUpperCase()} · {p.transaction_ref}</p>
                      </div>
                      <span className="text-sm font-bold text-charcoal">₹{(p.amount / 100).toLocaleString('en-IN')}</span>
                    </div>
                  </button>
                ))
              )}
              <div>
                <label className="block text-xs font-semibold text-charcoal/60 mb-1.5 uppercase tracking-wide">Reconciliation Note (optional)</label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g., Matched with ICICI statement"
                  className="w-full px-4 py-2.5 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-black/5 flex gap-3">
              <button onClick={() => setShowMatchModal(false)} className="flex-1 py-2.5 rounded-xl border border-black/10 text-sm font-medium text-charcoal/60 hover:bg-lightgray transition-colors cursor-pointer whitespace-nowrap">Cancel</button>
              <button
                onClick={handleMatch}
                disabled={!selectedPayment}
                className="flex-1 py-2.5 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-dark transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Confirm Match
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

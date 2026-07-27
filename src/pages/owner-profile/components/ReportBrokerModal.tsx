import { useState } from 'react';
import { ReportReason } from '@/hooks/useBrokerReport';

const reasons: { id: ReportReason; label: string }[] = [
  { id: 'broker_agent', label: 'This person is a broker / real estate agent' },
  { id: 'asked_commission', label: 'They asked me for commission or brokerage' },
  { id: 'shared_competing_listing', label: 'They shared listings from other brokers or competitors' },
  { id: 'refused_identity', label: 'They refused to share identity or Aadhaar details' },
  { id: 'other', label: 'Other suspicious behavior' },
];

interface ReportBrokerModalProps {
  open: boolean;
  onClose: () => void;
  prospectName: string;
  onReport: (reason: ReportReason, reasonText: string) => Promise<boolean>;
  alreadyReported: boolean;
}

export default function ReportBrokerModal({ open, onClose, prospectName, onReport, alreadyReported }: ReportBrokerModalProps) {
  const [selected, setSelected] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const handleSubmit = async () => {
    if (!selected) return;
    setError('');
    setSubmitting(true);
    const ok = await onReport(selected, details.trim());
    setSubmitting(false);
    if (ok) {
      setSubmitted(true);
    } else {
      setError('Failed to submit report. Please try again.');
    }
  };

  const resetAndClose = () => {
    setSelected(null);
    setDetails('');
    setSubmitted(false);
    setError('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={resetAndClose} />
      <div className="relative bg-white rounded-2xl max-w-md w-full shadow-xl overflow-hidden">
        <div className="bg-red-50 p-5 border-b border-red-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-red-100">
                <i className="ri-flag-line text-lg text-red-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-charcoal">Report as Broker</h3>
                <p className="text-xs text-charcoal/60">{prospectName}</p>
              </div>
            </div>
            <button onClick={resetAndClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-red-100 transition-colors cursor-pointer">
              <i className="ri-close-line text-charcoal/60" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {alreadyReported ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 flex items-center justify-center mx-auto mb-3 rounded-full bg-green-50">
                <i className="ri-checkbox-circle-line text-xl text-green-600" />
              </div>
              <p className="text-sm font-bold text-charcoal mb-1">Already Reported</p>
              <p className="text-xs text-charcoal/60">You have already submitted a report for this tenant.</p>
            </div>
          ) : submitted ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 flex items-center justify-center mx-auto mb-3 rounded-full bg-green-50">
                <i className="ri-checkbox-circle-line text-xl text-green-600" />
              </div>
              <p className="text-sm font-bold text-charcoal mb-1">Report Submitted</p>
              <p className="text-xs text-charcoal/60">Thank you. Our team will review this report within 24 hours.</p>
              <p className="text-xs text-charcoal/40 mt-2">If 2 owners report this tenant within 48 hours, their account will be temporarily restricted.</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-charcoal/60 leading-relaxed">
                Brokers and middlemen are not allowed on Bhavan. Please tell us why you believe <strong className="text-charcoal">{prospectName}</strong> is acting as a broker.
              </p>
              <div className="space-y-2">
                {reasons.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setSelected(r.id)}
                    className={`w-full text-left px-4 py-3 rounded-xl border text-sm font-medium transition-colors cursor-pointer ${
                      selected === r.id
                        ? 'border-red-300 bg-red-50 text-red-700'
                        : 'border-black/5 bg-white text-charcoal hover:border-black/10'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 ${selected === r.id ? 'border-red-500' : 'border-black/15'}`}>
                        {selected === r.id && <div className="w-2 h-2 rounded-full bg-red-500" />}
                      </div>
                      {r.label}
                    </div>
                  </button>
                ))}
              </div>
              <div>
                <label className="block text-xs font-semibold text-charcoal/60 mb-1.5">Additional details (optional)</label>
                <textarea
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  maxLength={500}
                  rows={3}
                  className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-200 resize-none"
                  placeholder="Describe what happened..."
                />
                <p className="text-[10px] text-charcoal/40 mt-1 text-right">{details.length}/500</p>
              </div>
              {error && <p className="text-xs text-red-500">{error}</p>}
            </>
          )}
        </div>

        <div className="p-5 pt-0 flex items-center gap-3">
          {alreadyReported || submitted ? (
            <button onClick={resetAndClose} className="flex-1 px-4 py-2.5 rounded-full bg-charcoal text-white text-sm font-semibold hover:bg-charcoal/90 transition-colors cursor-pointer whitespace-nowrap">
              Done
            </button>
          ) : (
            <>
              <button onClick={resetAndClose} className="flex-1 px-4 py-2.5 rounded-full border border-black/10 text-sm font-medium text-charcoal/60 hover:bg-lightgray transition-colors cursor-pointer whitespace-nowrap">
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!selected || submitting}
                className="flex-1 px-4 py-2.5 rounded-full bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Submitting…' : 'Submit Report'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
import { useState } from 'react';
import { submitListingReport, LISTING_REPORT_REASONS, type ListingReportReason } from '@/hooks/useListingReports';
import { useToast } from '@/hooks/useToast';

interface ReportListingModalProps {
  open: boolean;
  onClose: () => void;
  listingId: string;
  reporterId: string;
}

export default function ReportListingModal({ open, onClose, listingId, reporterId }: ReportListingModalProps) {
  const { addToast } = useToast();
  const [reason, setReason] = useState<ListingReportReason>('photos_dont_match');
  const [detail, setDetail] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const handleSubmit = async () => {
    setSubmitting(true);
    const { error } = await submitListingReport(listingId, reporterId, reason, detail.trim());
    setSubmitting(false);
    if (error) {
      addToast(`Failed to submit report: ${error}`, 'error');
      return;
    }
    addToast('Thanks for the report -- our team will review it.', 'success');
    setDetail('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl max-w-md w-full shadow-xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b border-black/5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-red-50">
              <i className="ri-flag-2-line text-lg text-red-600" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-charcoal">Report this listing</h3>
              <p className="text-xs text-charcoal/60">Help us keep listings accurate</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-lightgray transition-colors cursor-pointer">
            <i className="ri-close-line text-charcoal/40" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-charcoal/60 uppercase tracking-wide mb-2">What's wrong?</label>
            <div className="space-y-2">
              {LISTING_REPORT_REASONS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setReason(r.value)}
                  className={`w-full text-left px-4 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                    reason === r.value ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-offwhite text-charcoal/70 border border-transparent hover:bg-lightgray'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-charcoal/60 uppercase tracking-wide mb-1.5">
              Details <span className="normal-case font-normal text-charcoal/40">(optional)</span>
            </label>
            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="What did you notice was different from the listing?"
              className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-200 resize-none"
            />
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-full border border-black/10 text-sm font-medium text-charcoal/60 hover:bg-lightgray transition-colors cursor-pointer whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 px-4 py-3 rounded-full bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-1.5">
                  <i className="ri-loader-4-line animate-spin" /> Submitting...
                </span>
              ) : (
                'Submit Report'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

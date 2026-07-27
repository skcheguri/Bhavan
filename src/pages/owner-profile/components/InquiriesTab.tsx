import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useBrokerReport, ReportReason } from '@/hooks/useBrokerReport';
import { useOwnerRateLimit } from '@/hooks/useOwnerRateLimit';
import { useOwnerConnectionRequests, type ConnectionRequest } from '@/hooks/useConnectionRequests';
import { useToast } from '@/hooks/useToast';
import ReportBrokerModal from './ReportBrokerModal';
import UserProfileModal from '@/components/feature/UserProfileModal';

export type RequestStatus = 'pending' | 'approved' | 'declined';

const statusLabels: Record<RequestStatus, string> = {
  pending: 'Pending Review',
  approved: 'Approved',
  declined: 'Declined',
};

const statusStyles: Record<RequestStatus, string> = {
  pending: 'bg-amber-50 text-amber-700',
  approved: 'bg-green-50 text-green-700',
  declined: 'bg-red-50 text-red-500',
};

function timeAgo(isoDate: string) {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

interface RequestCardProps {
  request: ConnectionRequest;
  onApprove: (id: string) => void;
  onDecline: (id: string) => void;
  onOpenChat?: (id: string) => void;
}

function RequestCard({ request, onApprove, onDecline, onOpenChat }: RequestCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const { user } = useAuth();
  const { addToast } = useToast();

  const brokerStatus = useBrokerReport(request.prospectId);
  const alreadyReported = !brokerStatus.canBeReportedBy(user?.id ?? '');

  const handleReport = async (reason: ReportReason, reasonText: string): Promise<boolean> => {
    if (!user) return false;
    const ok = await brokerStatus.report(user.id, user.name, reason, reasonText, request.listingId);
    if (ok) {
      addToast('Report submitted. We will review within 24 hours.', 'success');
    }
    return ok;
  };

  return (
    <>
      <div className={`bg-white rounded-2xl border transition-all ${request.status === 'pending' ? 'border-amber-200' : 'border-black/5'}`}>
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <button
                onClick={() => setProfileOpen(true)}
                className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 cursor-pointer hover:ring-2 hover:ring-amber-300 transition-all"
                title="View profile"
              >
                <span className="text-sm font-bold text-amber-600">{request.prospectInitials}</span>
              </button>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={() => setProfileOpen(true)} className="text-sm font-bold text-charcoal hover:text-amber-600 transition-colors cursor-pointer">{request.prospectName}</button>
                  {request.scannedViaQR && (
                    <span className="flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600">
                      <i className="ri-qr-scan-line text-[10px]" /> Via QR
                    </span>
                  )}
                  {alreadyReported && (
                    <span className="flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-50 text-red-500">
                      <i className="ri-flag-line text-[10px]" /> Reported
                    </span>
                  )}
                </div>
                <p className="text-xs text-charcoal/60 mt-0.5 flex items-center gap-1.5 flex-wrap">
                  <span className="flex items-center gap-0.5">
                    <i className="ri-map-pin-line text-[10px]" /> {request.listingLocation}
                  </span>
                  <span className="text-charcoal/30">·</span>
                  <span>{timeAgo(request.requestedAt)}</span>
                </p>
              </div>
            </div>
            <span className={`text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap flex-shrink-0 ${statusStyles[request.status]}`}>
              {statusLabels[request.status]}
            </span>
          </div>

          {/* Quick profile chips */}
          <div className="flex flex-wrap gap-2 mt-3">
            {request.occupation && (
              <span className="flex items-center gap-1 text-xs text-charcoal/70 bg-offwhite px-2.5 py-1 rounded-full">
                <i className="ri-briefcase-line text-[10px] text-charcoal/40" /> {request.occupation}
              </span>
            )}
            {request.moveInDate && (
              <span className="flex items-center gap-1 text-xs text-charcoal/70 bg-offwhite px-2.5 py-1 rounded-full">
                <i className="ri-calendar-line text-[10px] text-charcoal/40" /> Move-in: {request.moveInDate}
              </span>
            )}
            <span className="flex items-center gap-1 text-xs text-charcoal/70 bg-offwhite px-2.5 py-1 rounded-full">
              <i className="ri-home-4-line text-[10px] text-charcoal/40" /> {request.listingTitle.length > 30 ? request.listingTitle.slice(0, 30) + '…' : request.listingTitle}
            </span>
          </div>

          {/* Message preview */}
          <div className="mt-3 p-3 bg-offwhite rounded-xl">
            <p className={`text-xs text-charcoal/70 leading-relaxed ${expanded ? '' : 'line-clamp-2'}`}>
              &ldquo;{request.prospectMessage}&rdquo;
            </p>
            {request.prospectMessage.length > 100 && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-[10px] text-amber-600 font-medium mt-1 cursor-pointer"
              >
                {expanded ? 'Show less' : 'Read more'}
              </button>
            )}
          </div>

          {/* Actions */}
          {request.status === 'pending' && (
            <div className="flex items-center gap-2 mt-4 flex-wrap">
              <button
                onClick={() => onDecline(request.id)}
                className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-full border border-black/10 text-xs font-medium text-charcoal/60 hover:border-red-200 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer whitespace-nowrap"
              >
                <i className="ri-close-line text-sm" /> Decline
              </button>
              <button
                onClick={() => onApprove(request.id)}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-full bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600 transition-colors cursor-pointer whitespace-nowrap"
              >
                <i className="ri-checkbox-circle-line text-sm" /> Approve &amp; Start Chat
              </button>
              <button
                onClick={() => setReportOpen(true)}
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-full border border-red-100 text-xs font-medium text-red-500 hover:bg-red-50 transition-colors cursor-pointer whitespace-nowrap"
                title="Report as broker"
              >
                <i className="ri-flag-line text-sm" />
              </button>
            </div>
          )}

          {request.status === 'approved' && (
            <div className="flex items-center gap-2 mt-4 flex-wrap">
              <div className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
                <i className="ri-checkbox-circle-fill text-sm" />
                Approved — Chat unlocked
              </div>
              <button
                onClick={() => onOpenChat?.(request.id)}
                className="ml-auto flex items-center justify-center gap-1.5 px-4 py-2 rounded-full bg-green-600 text-white text-xs font-semibold hover:bg-green-700 transition-colors cursor-pointer whitespace-nowrap"
              >
                <i className="ri-message-3-line text-sm" /> Open Chat
              </button>
              <button
                onClick={() => setReportOpen(true)}
                className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-full border border-red-100 text-xs font-medium text-red-500 hover:bg-red-50 transition-colors cursor-pointer whitespace-nowrap"
                title="Report as broker"
              >
                <i className="ri-flag-line text-sm" />
              </button>
            </div>
          )}

          {request.status === 'declined' && (
            <div className="flex items-center gap-1.5 text-xs text-charcoal/40 mt-4">
              <i className="ri-close-circle-line text-sm" />
              Request declined{request.respondedAt ? ` · ${timeAgo(request.respondedAt)}` : ''}
            </div>
          )}
        </div>
      </div>

      <ReportBrokerModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        prospectName={request.prospectName}
        onReport={handleReport}
        alreadyReported={alreadyReported}
      />

      {profileOpen && (
        <UserProfileModal
          userId={request.prospectId}
          roleLabel="Tenant"
          reviewRole="owner_on_renter"
          canReview={request.status === 'approved'}
          onClose={() => setProfileOpen(false)}
        />
      )}
    </>
  );
}

interface InquiriesTabProps {
  onOpenChat?: (requestId: string) => void;
}

export default function InquiriesTab({ onOpenChat }: InquiriesTabProps) {
  const [filter, setFilter] = useState<RequestStatus | 'all'>('all');
  const [showConfirm, setShowConfirm] = useState<{ id: string; action: 'approve' | 'decline' } | null>(null);
  const { user } = useAuth();
  const { requests, loading, updateStatus } = useOwnerConnectionRequests(user?.id);
  const { inquiry, recordInquiry } = useOwnerRateLimit(user?.id);
  const { addToast } = useToast();

  const filtered = filter === 'all' ? requests : requests.filter((r) => r.status === filter);
  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  const handleApprove = (id: string) => {
    setShowConfirm({ id, action: 'approve' });
  };

  const handleDecline = (id: string) => {
    setShowConfirm({ id, action: 'decline' });
  };

  const confirmAction = async () => {
    if (!showConfirm) return;

    if (!inquiry.canSend) {
      addToast(inquiry.limitReason || 'Rate limit reached. Please try again later.', 'error');
      setShowConfirm(null);
      return;
    }

    const ok = recordInquiry();
    if (!ok) {
      addToast(inquiry.limitReason || 'Rate limit reached. Please try again later.', 'error');
      setShowConfirm(null);
      return;
    }

    const success = await updateStatus(showConfirm.id, showConfirm.action === 'approve' ? 'approved' : 'declined');
    if (success) {
      addToast(
        showConfirm.action === 'approve' ? 'Request approved successfully.' : 'Request declined.',
        'success',
      );
    } else {
      addToast('Failed to update status. Please try again.', 'error');
    }
    setShowConfirm(null);
  };

  const filterTabs: { id: RequestStatus | 'all'; label: string }[] = [
    { id: 'all', label: `All (${requests.length})` },
    { id: 'pending', label: `Pending (${pendingCount})` },
    { id: 'approved', label: 'Approved' },
    { id: 'declined', label: 'Declined' },
  ];

  if (loading) {
    return (
      <div className="min-h-[300px] flex items-center justify-center">
        <div className="flex items-center gap-3">
          <i className="ri-loader-4-line animate-spin text-brand text-xl" />
          <span className="text-sm text-charcoal/60">Loading requests...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-charcoal">Connection Requests</h2>
          <p className="text-sm text-charcoal/60 mt-0.5">Review and approve prospects before chatting with them</p>
        </div>
        {pendingCount > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-amber-50 border border-amber-100">
            <div className="w-5 h-5 flex items-center justify-center rounded-full bg-amber-500">
              <span className="text-[10px] font-bold text-white">{pendingCount}</span>
            </div>
            <span className="text-xs font-semibold text-amber-700">Awaiting your review</span>
          </div>
        )}
      </div>

      {/* Rate limit status */}
      {!inquiry.canSend && inquiry.limitReason && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-4 flex items-start gap-3">
          <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-100 flex-shrink-0">
            <i className="ri-error-warning-line text-red-600 text-sm" />
          </div>
          <div>
            <p className="text-sm font-semibold text-red-700">Inquiry Response Limit Reached</p>
            <p className="text-xs text-red-500 mt-0.5">{inquiry.limitReason}</p>
          </div>
        </div>
      )}

      {/* How it works banner */}
      <div className="bg-offwhite border border-black/5 rounded-xl p-4 flex items-start gap-3">
        <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-amber-100 flex-shrink-0">
          <i className="ri-shield-check-line text-amber-600 text-sm" />
        </div>
        <div>
          <p className="text-sm font-semibold text-charcoal">You&apos;re in control</p>
          <p className="text-xs text-charcoal/60 mt-0.5 leading-relaxed">
            Prospects can only send you a request — they cannot message you directly. Review their profile and approve those you want to connect with. Declined requests are silently removed. Your phone number is never shared.
          </p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-white rounded-xl border border-black/5 p-1 w-fit">
        {filterTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              filter === tab.id ? 'bg-amber-500 text-white' : 'text-charcoal/60 hover:text-charcoal hover:bg-lightgray'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Request cards */}
      {filtered.length > 0 ? (
        <div className="space-y-4">
          {filtered.map((request) => (
            <RequestCard
              key={request.id}
              request={request}
              onApprove={handleApprove}
              onDecline={handleDecline}
              onOpenChat={onOpenChat}
            />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-black/5 p-12 text-center">
          <div className="w-14 h-14 flex items-center justify-center mx-auto mb-4 bg-offwhite rounded-full">
            <i className="ri-inbox-line text-2xl text-charcoal/40" />
          </div>
          <h3 className="text-base font-bold text-charcoal mb-2">No requests here</h3>
          <p className="text-sm text-charcoal/60">
            {filter === 'pending' ? 'You\'re all caught up! No pending requests.' : `No ${filter} requests yet.`}
          </p>
        </div>
      )}

      {/* Confirm modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowConfirm(null)} />
          <div className="relative bg-white rounded-2xl p-6 max-w-sm w-full">
            {/* Rate limit warning inside modal */}
            {!inquiry.canSend && (
              <div className="bg-red-50 border border-red-100 rounded-lg p-3 mb-4 flex items-start gap-2">
                <i className="ri-error-warning-line text-red-500 text-sm flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-600">{inquiry.limitReason}</p>
              </div>
            )}

            <div className={`w-12 h-12 flex items-center justify-center rounded-full mx-auto mb-4 ${showConfirm.action === 'approve' ? 'bg-green-50' : 'bg-red-50'}`}>
              <i className={`text-xl ${showConfirm.action === 'approve' ? 'ri-checkbox-circle-line text-green-600' : 'ri-close-circle-line text-red-500'}`} />
            </div>
            <h3 className="text-base font-bold text-charcoal text-center mb-1">
              {showConfirm.action === 'approve' ? 'Approve Request?' : 'Decline Request?'}
            </h3>
            <p className="text-sm text-charcoal/60 text-center mb-5">
              {showConfirm.action === 'approve'
                ? 'The prospect will be notified and can now message you directly through Bhavan.'
                : 'The request will be silently declined. The prospect will not be notified.'}
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowConfirm(null)}
                className="flex-1 px-4 py-2.5 rounded-full border border-black/10 text-sm font-medium text-charcoal/60 hover:bg-lightgray transition-colors cursor-pointer whitespace-nowrap"
              >
                Cancel
              </button>
              <button
                onClick={confirmAction}
                disabled={!inquiry.canSend}
                className={`flex-1 px-4 py-2.5 rounded-full text-white text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed ${
                  showConfirm.action === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-500 hover:bg-red-600'
                }`}
              >
                {showConfirm.action === 'approve' ? 'Yes, Approve' : 'Yes, Decline'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
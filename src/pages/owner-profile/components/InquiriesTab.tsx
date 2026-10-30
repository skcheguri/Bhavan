import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useBrokerReport, ReportReason } from '@/hooks/useBrokerReport';
import { useOwnerRateLimit } from '@/hooks/useOwnerRateLimit';
import { useOwnerConnectionRequests, type ConnectionRequest } from '@/hooks/useConnectionRequests';
import { useOwnerPropertyVisits, type OwnerPropertyVisit } from '@/hooks/usePropertyVisits';
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
  onToggleTenant: (id: string, confirmed: boolean) => Promise<void>;
}

function RequestCard({ request, onApprove, onDecline, onOpenChat, onToggleTenant }: RequestCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [confirmingTenant, setConfirmingTenant] = useState(false);
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
      <div className={`bg-white rounded-2xl border transition ${request.status === 'pending' ? 'border-amber-200' : 'border-black/5'}`}>
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <button
                onClick={() => setProfileOpen(true)}
                className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 cursor-pointer hover:ring-2 hover:ring-amber-300 transition"
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
            <div className="mt-4 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
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

              {/* Confirm this contact as the actual tenant. Feeds the
                  agreement & rent-receipt tenant pickers -- it does not
                  create a tenancy on its own (that's the signed agreement). */}
              <div className="flex items-center gap-2 flex-wrap border-t border-black/5 pt-3">
                {request.tenantConfirmedAt ? (
                  <>
                    <span className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-brand/10 text-brand">
                      <i className="ri-user-star-line text-[11px]" /> Confirmed tenant
                    </span>
                    <button
                      onClick={async () => { setConfirmingTenant(true); await onToggleTenant(request.id, false); setConfirmingTenant(false); }}
                      disabled={confirmingTenant}
                      className="text-xs font-medium text-charcoal/40 hover:text-red-500 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
                    >
                      Remove
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={async () => { setConfirmingTenant(true); await onToggleTenant(request.id, true); setConfirmingTenant(false); }}
                      disabled={confirmingTenant}
                      className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-full border border-brand/30 text-xs font-semibold text-brand hover:bg-brand/5 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
                    >
                      {confirmingTenant ? <i className="ri-loader-4-line animate-spin text-sm" /> : <i className="ri-user-add-line text-sm" />}
                      Confirm as tenant
                    </button>
                    <span className="text-[11px] text-charcoal/40 leading-snug">Adds them to your agreement &amp; rent-receipt tenant list.</span>
                  </>
                )}
              </div>
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

const visitStatusLabels: Record<OwnerPropertyVisit['status'], string> = {
  requested: 'Awaiting Confirmation',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  completed: 'Completed',
};

const visitStatusStyles: Record<OwnerPropertyVisit['status'], string> = {
  requested: 'bg-amber-50 text-amber-700',
  confirmed: 'bg-green-50 text-green-700',
  cancelled: 'bg-red-50 text-red-500',
  completed: 'bg-lightgray text-charcoal/60',
};

function VisitCard({ visit, onConfirm, onCancel }: { visit: OwnerPropertyVisit; onConfirm: (id: string) => void; onCancel: (id: string) => void }) {
  return (
    <div className={`bg-white rounded-2xl border p-5 ${visit.status === 'requested' ? 'border-amber-200' : 'border-black/5'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-brand/10 flex items-center justify-center flex-shrink-0">
            <i className="ri-user-line text-brand" />
          </div>
          <div>
            <p className="text-sm font-bold text-charcoal">{visit.visitor_name}</p>
            <p className="text-xs text-charcoal/60 mt-0.5 flex items-center gap-1.5 flex-wrap">
              <span className="flex items-center gap-0.5"><i className="ri-home-4-line text-[10px]" /> {visit.listing_title}</span>
            </p>
          </div>
        </div>
        <span className={`text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap flex-shrink-0 ${visitStatusStyles[visit.status]}`}>
          {visitStatusLabels[visit.status]}
        </span>
      </div>

      <div className="flex flex-wrap gap-2 mt-3">
        <span className="flex items-center gap-1 text-xs text-charcoal/70 bg-offwhite px-2.5 py-1 rounded-full">
          <i className="ri-calendar-line text-[10px] text-charcoal/40" /> {new Date(visit.visit_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
        </span>
        <span className="flex items-center gap-1 text-xs text-charcoal/70 bg-offwhite px-2.5 py-1 rounded-full">
          <i className="ri-time-line text-[10px] text-charcoal/40" /> {visit.visit_time}
        </span>
        <span className="flex items-center gap-1 text-xs text-charcoal/70 bg-offwhite px-2.5 py-1 rounded-full">
          <i className="ri-phone-line text-[10px] text-charcoal/40" /> {visit.visitor_phone}
        </span>
        <span className="flex items-center gap-1 text-xs text-charcoal/70 bg-offwhite px-2.5 py-1 rounded-full">
          <i className="ri-mail-line text-[10px] text-charcoal/40" /> {visit.visitor_email}
        </span>
      </div>

      {visit.note && (
        <div className="mt-3 p-3 bg-offwhite rounded-xl">
          <p className="text-xs text-charcoal/70 leading-relaxed">&ldquo;{visit.note}&rdquo;</p>
        </div>
      )}

      {visit.status === 'requested' && (
        <div className="flex items-center gap-2 mt-4 flex-wrap">
          <button
            onClick={() => onCancel(visit.id)}
            className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-full border border-black/10 text-xs font-medium text-charcoal/60 hover:border-red-200 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-close-line text-sm" /> Decline
          </button>
          <button
            onClick={() => onConfirm(visit.id)}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-full bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600 transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-checkbox-circle-line text-sm" /> Confirm Visit
          </button>
        </div>
      )}

      {visit.status === 'confirmed' && (
        <div className="flex items-center justify-between gap-2 mt-4">
          <div className="flex items-center gap-1.5 text-xs text-green-600 font-medium">
            <i className="ri-checkbox-circle-fill text-sm" /> Visit confirmed
          </div>
          <button
            onClick={() => onCancel(visit.id)}
            className="text-xs font-medium text-red-500 hover:text-red-600 cursor-pointer whitespace-nowrap"
          >
            Cancel visit
          </button>
        </div>
      )}
    </div>
  );
}

function VisitRequestsSection({ ownerId }: { ownerId: string | undefined }) {
  const { visits, loading, updateStatus } = useOwnerPropertyVisits(ownerId);
  const { addToast } = useToast();
  const [visitFilter, setVisitFilter] = useState<OwnerPropertyVisit['status'] | 'all'>('all');

  const filtered = visitFilter === 'all' ? visits : visits.filter((v) => v.status === visitFilter);
  const requestedCount = visits.filter((v) => v.status === 'requested').length;

  const handleConfirm = async (id: string) => {
    const { error } = await updateStatus(id, 'confirmed');
    addToast(error ? 'Failed to update visit.' : 'Visit confirmed.', error ? 'error' : 'success');
  };

  const handleCancel = async (id: string) => {
    const { error } = await updateStatus(id, 'cancelled');
    addToast(error ? 'Failed to update visit.' : 'Visit cancelled.', error ? 'error' : 'success');
  };

  const visitFilterTabs: { id: OwnerPropertyVisit['status'] | 'all'; label: string }[] = [
    { id: 'all', label: `All (${visits.length})` },
    { id: 'requested', label: `Awaiting (${requestedCount})` },
    { id: 'confirmed', label: 'Confirmed' },
    { id: 'cancelled', label: 'Cancelled' },
  ];

  if (loading) {
    return (
      <div className="min-h-[300px] flex items-center justify-center">
        <div className="flex items-center gap-3">
          <i className="ri-loader-4-line animate-spin text-brand text-xl" />
          <span className="text-sm text-charcoal/60">Loading visit requests...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-charcoal">Visit Requests</h2>
          <p className="text-sm text-charcoal/60 mt-0.5">Confirm or decline in-person property tours</p>
        </div>
        {requestedCount > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-full bg-amber-50 border border-amber-100">
            <div className="w-5 h-5 flex items-center justify-center rounded-full bg-amber-500">
              <span className="text-[10px] font-bold text-white">{requestedCount}</span>
            </div>
            <span className="text-xs font-semibold text-amber-700">Awaiting your response</span>
          </div>
        )}
      </div>

      <div className="flex gap-1 bg-white rounded-xl border border-black/5 p-1 w-fit">
        {visitFilterTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setVisitFilter(tab.id)}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              visitFilter === tab.id ? 'bg-brand text-white' : 'text-charcoal/60 hover:text-charcoal hover:bg-lightgray'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {filtered.length > 0 ? (
        <div className="space-y-4">
          {filtered.map((visit) => (
            <VisitCard key={visit.id} visit={visit} onConfirm={handleConfirm} onCancel={handleCancel} />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-black/5 p-12 text-center">
          <div className="w-14 h-14 flex items-center justify-center mx-auto mb-4 bg-offwhite rounded-full">
            <i className="ri-calendar-line text-2xl text-charcoal/40" />
          </div>
          <h3 className="text-base font-bold text-charcoal mb-2">No visit requests here</h3>
          <p className="text-sm text-charcoal/60">
            {visitFilter === 'requested' ? "You're all caught up! No visits awaiting a response." : `No ${visitFilter === 'all' ? '' : visitFilter + ' '}visit requests yet.`}
          </p>
        </div>
      )}
    </div>
  );
}

interface InquiriesTabProps {
  onOpenChat?: (requestId: string) => void;
}

export default function InquiriesTab({ onOpenChat }: InquiriesTabProps) {
  const [section, setSection] = useState<'connections' | 'visits'>('connections');
  const [filter, setFilter] = useState<RequestStatus | 'all'>('all');
  const [showConfirm, setShowConfirm] = useState<{ id: string; action: 'approve' | 'decline' } | null>(null);
  const { user } = useAuth();
  const { requests, loading, updateStatus, confirmTenant } = useOwnerConnectionRequests(user?.id);
  const { inquiry, recordInquiry } = useOwnerRateLimit(user?.id);
  const { addToast } = useToast();

  const handleToggleTenant = async (id: string, confirmed: boolean) => {
    const { error } = await confirmTenant(id, confirmed);
    if (error) {
      addToast(error, 'error');
      return;
    }
    addToast(confirmed ? 'Confirmed as your tenant.' : 'Removed from your tenants.', 'success');
  };

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

    const isApprove = showConfirm.action === 'approve';

    // Only approvals are rate-limited and debited. Declining a request is
    // free — it neither charges the inquiry quota nor gets blocked by it.
    if (isApprove && !inquiry.canSend) {
      addToast(inquiry.limitReason || 'Rate limit reached. Please try again later.', 'error');
      setShowConfirm(null);
      return;
    }

    const success = await updateStatus(showConfirm.id, isApprove ? 'approved' : 'declined');
    if (success) {
      if (isApprove) recordInquiry();
      addToast(
        isApprove ? 'Request approved successfully.' : 'Request declined.',
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

  return (
    <div className="space-y-5">
      {/* Section toggle */}
      <div className="flex gap-1 bg-white rounded-xl border border-black/5 p-1 w-fit">
        <button
          onClick={() => setSection('connections')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
            section === 'connections' ? 'bg-brand text-white' : 'text-charcoal/60 hover:text-charcoal hover:bg-lightgray'
          }`}
        >
          <i className="ri-user-add-line text-sm" /> Connection Requests
        </button>
        <button
          onClick={() => setSection('visits')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
            section === 'visits' ? 'bg-brand text-white' : 'text-charcoal/60 hover:text-charcoal hover:bg-lightgray'
          }`}
        >
          <i className="ri-calendar-schedule-line text-sm" /> Visit Requests
        </button>
      </div>

      {section === 'visits' ? (
        <VisitRequestsSection ownerId={user?.id} />
      ) : loading ? (
        <div className="min-h-[300px] flex items-center justify-center">
          <div className="flex items-center gap-3">
            <i className="ri-loader-4-line animate-spin text-brand text-xl" />
            <span className="text-sm text-charcoal/60">Loading requests...</span>
          </div>
        </div>
      ) : (
      <>
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
              filter === tab.id ? 'bg-brand text-white' : 'text-charcoal/60 hover:text-charcoal hover:bg-lightgray'
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
              onToggleTenant={handleToggleTenant}
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
            {filter === 'pending' ? 'You\'re all caught up! No pending requests.' : `No ${filter === 'all' ? '' : filter + ' '}requests yet.`}
          </p>
        </div>
      )}

      {/* Confirm modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowConfirm(null)} />
          <div className="relative bg-white rounded-2xl p-6 max-w-sm w-full">
            {/* Rate limit warning inside modal — only approvals are gated */}
            {showConfirm.action === 'approve' && !inquiry.canSend && (
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
                disabled={showConfirm.action === 'approve' && !inquiry.canSend}
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
      </>
      )}
    </div>
  );
}
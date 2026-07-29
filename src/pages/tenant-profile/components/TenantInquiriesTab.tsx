import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useTenantConnectionRequests, type ConnectionRequest } from '@/hooks/useConnectionRequests';
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

function initialsOf(name: string) {
  return name.trim().split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
}

interface RequestCardProps {
  request: ConnectionRequest;
  onOpenChat?: (id: string) => void;
}

function RequestCard({ request, onOpenChat }: RequestCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <>
      <div className={`bg-white rounded-2xl border transition ${request.status === 'pending' ? 'border-amber-200' : 'border-black/5'}`}>
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <button
                onClick={() => setProfileOpen(true)}
                className="w-10 h-10 rounded-full bg-brand/10 flex items-center justify-center flex-shrink-0 cursor-pointer hover:ring-2 hover:ring-brand/30 transition overflow-hidden"
                title="View owner profile"
              >
                {request.ownerAvatar ? (
                  <img src={request.ownerAvatar} alt={request.ownerName} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-sm font-bold text-brand">{initialsOf(request.ownerName)}</span>
                )}
              </button>
              <div>
                <button onClick={() => setProfileOpen(true)} className="text-sm font-bold text-charcoal hover:text-brand transition-colors cursor-pointer">
                  {request.ownerName}
                </button>
                <p className="text-xs text-charcoal/60 mt-0.5 flex items-center gap-1.5 flex-wrap">
                  <span className="flex items-center gap-0.5">
                    <i className="ri-map-pin-line text-[10px]" /> {request.listingLocation}
                  </span>
                  <span className="text-charcoal/30">·</span>
                  <span>Sent {timeAgo(request.requestedAt)}</span>
                </p>
              </div>
            </div>
            <span className={`text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap flex-shrink-0 ${statusStyles[request.status]}`}>
              {statusLabels[request.status]}
            </span>
          </div>

          <div className="flex flex-wrap gap-2 mt-3">
            <span className="flex items-center gap-1 text-xs text-charcoal/70 bg-offwhite px-2.5 py-1 rounded-full">
              <i className="ri-home-4-line text-[10px] text-charcoal/40" /> {request.listingTitle.length > 30 ? request.listingTitle.slice(0, 30) + '…' : request.listingTitle}
            </span>
            <span className="flex items-center gap-1 text-xs text-charcoal/70 bg-offwhite px-2.5 py-1 rounded-full">
              <i className="ri-money-rupee-circle-line text-[10px] text-charcoal/40" /> ₹{request.listingPrice.toLocaleString('en-IN')}/mo
            </span>
          </div>

          {/* Message preview */}
          <div className="mt-3 p-3 bg-offwhite rounded-xl">
            <p className="text-xs text-charcoal/60 font-medium mb-1">Your message:</p>
            <p className={`text-xs text-charcoal/70 leading-relaxed ${expanded ? '' : 'line-clamp-2'}`}>
              &ldquo;{request.prospectMessage}&rdquo;
            </p>
            {request.prospectMessage.length > 100 && (
              <button onClick={() => setExpanded(!expanded)} className="text-[10px] text-brand font-medium mt-1 cursor-pointer">
                {expanded ? 'Show less' : 'Read more'}
              </button>
            )}
          </div>

          {/* Status-specific actions */}
          {request.status === 'pending' && (
            <div className="flex items-center gap-1.5 text-xs text-amber-700 mt-4">
              <i className="ri-time-line" />
              The owner is reviewing your request. You&apos;ll be notified once they respond.
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
            </div>
          )}

          {request.status === 'declined' && (
            <div className="flex items-center justify-between gap-3 mt-4 flex-wrap">
              <div className="flex items-center gap-1.5 text-xs text-charcoal/40">
                <i className="ri-close-circle-line text-sm" />
                Request declined{request.respondedAt ? ` · ${timeAgo(request.respondedAt)}` : ''}
              </div>
              <Link
                to="/listings"
                className="flex items-center gap-1.5 px-4 py-2 rounded-full border border-black/10 text-xs font-medium text-charcoal hover:border-brand/40 hover:text-brand transition-colors cursor-pointer whitespace-nowrap"
              >
                <i className="ri-search-line text-sm" /> Browse Other Listings
              </Link>
            </div>
          )}
        </div>
      </div>

      {profileOpen && (
        <UserProfileModal
          userId={request.ownerId}
          roleLabel="Property Owner"
          reviewRole="renter_on_owner"
          canReview={request.status === 'approved'}
          onClose={() => setProfileOpen(false)}
        />
      )}
    </>
  );
}

interface TenantInquiriesTabProps {
  onOpenChat?: (requestId: string) => void;
}

export default function TenantInquiriesTab({ onOpenChat }: TenantInquiriesTabProps) {
  const { user } = useAuth();
  const [filter, setFilter] = useState<RequestStatus | 'all'>('all');
  const { requests, loading } = useTenantConnectionRequests(user?.id);

  const filtered = filter === 'all' ? requests : requests.filter((r) => r.status === filter);
  const pendingCount = requests.filter((r) => r.status === 'pending').length;

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
          <span className="text-sm text-charcoal/60">Loading your requests...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-charcoal">My Inquiries</h2>
          <p className="text-sm text-charcoal/60 mt-0.5">Track the status of your requests to property owners</p>
        </div>
        <Link
          to="/listings"
          className="flex items-center gap-2 px-4 py-2 rounded-full border border-black/10 text-sm font-medium text-charcoal hover:border-brand/40 hover:text-brand transition-colors cursor-pointer whitespace-nowrap"
        >
          <i className="ri-search-line text-sm" /> Browse More
        </Link>
      </div>

      {/* How it works banner */}
      <div className="bg-offwhite border border-black/5 rounded-xl p-4 flex items-start gap-3">
        <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-brand/10 flex-shrink-0">
          <i className="ri-shield-check-line text-brand text-sm" />
        </div>
        <div>
          <p className="text-sm font-semibold text-charcoal">How it works</p>
          <p className="text-xs text-charcoal/60 mt-0.5 leading-relaxed">
            You send a request to the owner. They review your profile and decide to approve or decline. Once approved, you can chat directly through Bhavan. Your phone number stays private throughout.
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
            <RequestCard key={request.id} request={request} onOpenChat={onOpenChat} />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-black/5 p-12 text-center">
          <div className="w-14 h-14 flex items-center justify-center mx-auto mb-4 bg-offwhite rounded-full">
            <i className="ri-inbox-line text-2xl text-charcoal/40" />
          </div>
          <h3 className="text-base font-bold text-charcoal mb-2">No requests here</h3>
          <p className="text-sm text-charcoal/60">
            {filter === 'pending' ? 'You have no pending requests.' : `No ${filter} requests yet.`}
          </p>
          <Link
            to="/listings"
            className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-brand text-white text-sm font-medium hover:bg-brand-dark transition-colors whitespace-nowrap"
          >
            <i className="ri-search-line text-sm" /> Browse Listings
          </Link>
        </div>
      )}
    </div>
  );
}

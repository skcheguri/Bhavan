import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useBrokerReport, ReportReason } from '@/hooks/useBrokerReport';
import { useOwnerConnectionRequests, type ConnectionRequest } from '@/hooks/useConnectionRequests';
import { useChatMessages, getLastMessagesByRequest, getUnreadCountsByRequest, type ChatMessageFromDB } from '@/hooks/useChatMessages';
import { useToast } from '@/hooks/useToast';
import ReportBrokerModal from './ReportBrokerModal';
import UserProfileModal from '@/components/feature/UserProfileModal';

interface ChatTabProps {
  initialRequestId?: string | null;
}

function timeAgo(isoDate: string) {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatTime(isoDate: string) {
  return new Date(isoDate).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

export default function ChatTab({ initialRequestId }: ChatTabProps) {
  const { user } = useAuth();
  const { requests, loading: requestsLoading } = useOwnerConnectionRequests(user?.id);
  const approvedRequests = useMemo(() => requests.filter((r) => r.status === 'approved'), [requests]);

  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [reportOpen, setReportOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const { addToast } = useToast();

  const [lastMessages, setLastMessages] = useState<Record<string, ChatMessageFromDB>>({});
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (approvedRequests.length === 0) return;
    const ids = approvedRequests.map((r) => r.id);
    getLastMessagesByRequest(ids).then(setLastMessages);
    getUnreadCountsByRequest(ids, 'tenant').then(setUnreadCounts);
  }, [approvedRequests]);

  useEffect(() => {
    if (!activeChatId && approvedRequests.length > 0) {
      const preselected = initialRequestId && approvedRequests.some((r) => r.id === initialRequestId)
        ? initialRequestId
        : approvedRequests[0].id;
      setActiveChatId(preselected);
    }
  }, [initialRequestId, approvedRequests, activeChatId]);

  const activeChat: ConnectionRequest | null = approvedRequests.find((r) => r.id === activeChatId) ?? null;
  const { messages, sendMessage, markRead } = useChatMessages(activeChat?.id);

  useEffect(() => {
    if (activeChat) markRead('tenant');
  }, [activeChat, markRead]);

  const brokerStatus = useBrokerReport(activeChat?.prospectId);
  const alreadyReported = activeChat ? !brokerStatus.canBeReportedBy(user?.id ?? '') : false;

  const handleSend = async () => {
    if (!replyText.trim() || !activeChat) return;

    const text = replyText.trim();
    setReplyText('');
    const { error } = await sendMessage('landlord', text);
    if (error) {
      addToast(`Failed to send message: ${error}`, 'error');
    }
  };

  const handleReport = async (reason: ReportReason, reasonText: string): Promise<boolean> => {
    if (!user || !activeChat) return false;
    const ok = await brokerStatus.report(user.id, user.name, reason, reasonText, activeChat.listingId);
    if (ok) {
      addToast('Report submitted. We will review within 24 hours.', 'success');
    }
    return ok;
  };

  if (requestsLoading) {
    return (
      <div className="bg-white rounded-3xl border border-black/5 p-12 text-center text-sm text-charcoal/40">
        Loading conversations…
      </div>
    );
  }

  if (approvedRequests.length === 0) {
    return (
      <div className="bg-white rounded-3xl border border-black/5 p-12 text-center">
        <div className="w-14 h-14 flex items-center justify-center mx-auto mb-4 bg-offwhite rounded-full">
          <i className="ri-message-3-line text-2xl text-charcoal/40" />
        </div>
        <h3 className="text-base font-bold text-charcoal mb-2">No active chats</h3>
        <p className="text-sm text-charcoal/60">Approve connection requests to start chatting with prospects.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 bg-white rounded-3xl border border-black/5 overflow-hidden min-h-[500px]">
      {/* Chat list sidebar */}
      <div className="lg:col-span-1 border-r border-black/5">
        <div className="p-4 border-b border-black/5">
          <h3 className="text-sm font-bold text-charcoal">Messages</h3>
          <p className="text-xs text-charcoal/40 mt-0.5">{approvedRequests.length} active conversation{approvedRequests.length > 1 ? 's' : ''}</p>
        </div>
        <div className="overflow-y-auto max-h-[500px]">
          {approvedRequests.map((req) => {
            const lastMsg = lastMessages[req.id];
            const unread = unreadCounts[req.id] ?? 0;
            const isActive = activeChatId === req.id;
            return (
              <button
                key={req.id}
                onClick={() => setActiveChatId(req.id)}
                className={`w-full text-left p-4 flex items-start gap-3 transition-colors cursor-pointer border-b border-gray-50 last:border-0 ${
                  isActive ? 'bg-amber-50' : 'hover:bg-offwhite'
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-amber-600">{req.prospectInitials}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-sm truncate ${unread > 0 ? 'font-bold text-charcoal' : 'font-medium text-charcoal'}`}>
                      {req.prospectName}
                    </p>
                    {lastMsg && (
                      <span className="text-[10px] text-charcoal/40 flex-shrink-0">{timeAgo(lastMsg.created_at)}</span>
                    )}
                  </div>
                  <p className={`text-xs truncate mt-0.5 ${unread > 0 ? 'text-charcoal font-medium' : 'text-charcoal/40'}`}>
                    {lastMsg ? (lastMsg.sender === 'landlord' ? 'You: ' : '') + lastMsg.text : 'No messages yet'}
                  </p>
                  {unread > 0 && (
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] font-bold mt-1">
                      {unread}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Chat area */}
      <div className="lg:col-span-2 flex flex-col">
        {activeChat ? (
          <>
            {/* Chat header */}
            <div className="p-4 border-b border-black/5 flex items-center gap-3">
              <button
                onClick={() => setProfileOpen(true)}
                className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 cursor-pointer hover:ring-2 hover:ring-amber-300 transition"
                title="View profile"
              >
                <span className="text-sm font-bold text-amber-600">{activeChat.prospectInitials}</span>
              </button>
              <button onClick={() => setProfileOpen(true)} className="flex-1 text-left cursor-pointer">
                <p className="text-sm font-bold text-charcoal hover:text-amber-600 transition-colors">{activeChat.prospectName}</p>
                <p className="text-xs text-charcoal/40">{activeChat.occupation ?? 'N/A'} · {activeChat.moveInDate ?? 'N/A'}</p>
              </button>
              <div className="flex items-center gap-2">
                {alreadyReported && (
                  <span className="flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-50 text-red-500">
                    <i className="ri-flag-line text-[10px]" /> Reported
                  </span>
                )}
                <div className="flex items-center gap-1 text-xs text-green-600 font-medium">
                  <i className="ri-checkbox-circle-fill text-sm" /> Approved
                </div>
                <button
                  onClick={() => setReportOpen(true)}
                  className="w-8 h-8 flex items-center justify-center rounded-full border border-red-100 text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
                  title="Report tenant"
                >
                  <i className="ri-flag-line text-sm" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[400px]">
              {messages.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-sm text-charcoal/40">No messages yet. Start the conversation!</p>
                </div>
              )}
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.sender === 'landlord' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                    msg.sender === 'landlord'
                      ? 'bg-amber-500 text-white rounded-br-md'
                      : 'bg-offwhite text-charcoal rounded-bl-md'
                  }`}>
                    <p className="text-sm leading-relaxed">{msg.text}</p>
                    <p className={`text-[10px] mt-1 ${msg.sender === 'landlord' ? 'text-amber-100' : 'text-charcoal/40'}`}>
                      {formatTime(msg.created_at)}
                      {msg.sender === 'landlord' && (
                        <span className="ml-1">{msg.read ? <i className="ri-check-double-line" /> : <i className="ri-check-line" />}</span>
                      )}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Reply input */}
            <div className="p-4 border-t border-black/5">
              <div className="flex items-center gap-2">
                <input
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
                  placeholder="Type a message..."
                  className="flex-1 px-4 py-3 bg-offwhite rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <button
                  onClick={handleSend}
                  disabled={!replyText.trim()}
                  className="w-10 h-10 flex items-center justify-center rounded-full bg-amber-500 text-white hover:bg-amber-600 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                >
                  <i className="ri-send-plane-fill text-sm" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-charcoal/40">Select a conversation to start chatting</p>
          </div>
        )}
      </div>

      <ReportBrokerModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        prospectName={activeChat?.prospectName ?? ''}
        onReport={handleReport}
        alreadyReported={alreadyReported}
      />

      {profileOpen && activeChat && (
        <UserProfileModal
          userId={activeChat.prospectId}
          roleLabel="Tenant"
          reviewRole="owner_on_renter"
          canReview
          onClose={() => setProfileOpen(false)}
        />
      )}
    </div>
  );
}

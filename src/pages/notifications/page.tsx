import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { useNotifications, NotificationFromDB } from '@/hooks/useNotifications';
import PushSetupBanner from './components/PushSetupBanner';

type NotificationType = 'maintenance' | 'inquiry' | 'message' | 'lease' | 'payment' | 'platform';

function timeAgo(isoDate: string) {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const typeIcons: Record<NotificationType, string> = {
  inquiry: 'ri-user-received-line',
  message: 'ri-chat-3-line',
  lease: 'ri-file-list-3-line',
  maintenance: 'ri-tools-line',
  payment: 'ri-money-rupee-circle-line',
  platform: 'ri-megaphone-line',
};

const typeColors: Record<NotificationType, string> = {
  inquiry: 'bg-amber-50 text-amber-600',
  message: 'bg-emerald-50 text-emerald-600',
  lease: 'bg-blue-50 text-blue-600',
  maintenance: 'bg-orange-50 text-orange-600',
  payment: 'bg-teal-50 text-teal-600',
  platform: 'bg-purple-50 text-purple-600',
};

const typeLabels: Record<NotificationType | 'all' | 'unread', string> = {
  all: 'All',
  unread: 'Unread',
  inquiry: 'Inquiries',
  message: 'Messages',
  lease: 'Lease',
  maintenance: 'Maintenance',
  payment: 'Payments',
  platform: 'Platform',
};

type FilterKey = 'all' | 'unread' | NotificationType;

const filterKeys: FilterKey[] = ['all', 'unread', 'inquiry', 'maintenance', 'lease', 'payment', 'platform'];

export default function NotificationsPage() {
  const { user } = useAuth();
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead } = useNotifications(user?.id);
  const [filter, setFilter] = useState<FilterKey>('all');
  const navigate = useNavigate();

  const filtered = notifications.filter((n) => {
    if (filter === 'all') return true;
    if (filter === 'unread') return !n.read;
    return n.type === filter;
  });

  const handleClick = (notif: NotificationFromDB) => {
    if (!notif.read) markAsRead(notif.id);
    if (notif.action_url) {
      navigate(notif.action_url);
    }
  };

  const counts: Record<FilterKey, number> = {
    all: notifications.length,
    unread: unreadCount,
    inquiry: notifications.filter((n) => n.type === 'inquiry').length,
    message: notifications.filter((n) => n.type === 'message').length,
    lease: notifications.filter((n) => n.type === 'lease').length,
    maintenance: notifications.filter((n) => n.type === 'maintenance').length,
    payment: notifications.filter((n) => n.type === 'payment').length,
    platform: notifications.filter((n) => n.type === 'platform').length,
  };

  return (
    <div className="min-h-screen bg-offwhite pb-16">
      <div className="max-w-3xl mx-auto px-4 md:px-8">
        {/* Header */}
        <div className="flex items-start sm:items-center justify-between gap-4 mb-6 pt-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-charcoal">Notifications</h1>
            <p className="text-sm text-charcoal/60 mt-1">
              {unreadCount} unread of {notifications.length} total
            </p>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="flex-shrink-0 text-sm text-amber-600 font-semibold hover:text-amber-700 transition-colors cursor-pointer whitespace-nowrap"
            >
              Mark all as read
            </button>
          )}
        </div>

        {/* Push setup banner */}
        <PushSetupBanner />

        {/* Filters */}
        <div className="flex gap-1.5 mb-6 overflow-x-auto pb-1">
          {filterKeys.map((key) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap flex-shrink-0 ${
                filter === key
                  ? 'bg-amber-500 text-white'
                  : 'bg-white text-charcoal/60 hover:text-charcoal border border-black/5'
              }`}
            >
              {typeLabels[key]}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                filter === key ? 'bg-white/20 text-white' : 'bg-lightgray text-charcoal/40'
              }`}>
                {counts[key]}
              </span>
            </button>
          ))}
        </div>

        {/* List */}
        <div className="space-y-3">
          {loading ? (
            <div className="bg-white rounded-3xl border border-black/5 p-12 text-center text-sm text-charcoal/40">
              Loading notifications…
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-white rounded-3xl border border-black/5 p-12 text-center">
              <div className="w-14 h-14 flex items-center justify-center mx-auto mb-4 bg-offwhite rounded-full">
                <i className="ri-notification-off-line text-2xl text-charcoal/40" />
              </div>
              <h3 className="text-base font-bold text-charcoal mb-2">
                {filter === 'unread' ? 'All caught up!' : 'No notifications here'}
              </h3>
              <p className="text-sm text-charcoal/60">
                {filter === 'unread'
                  ? 'You have read all your notifications.'
                  : `No ${typeLabels[filter] !== 'All' ? typeLabels[filter].toLowerCase() : ''} notifications yet.`}
              </p>
            </div>
          ) : (
            filtered.map((notif) => {
              const type = notif.type as NotificationType;
              return (
                <button
                  key={notif.id}
                  onClick={() => handleClick(notif)}
                  className={`w-full text-left bg-white rounded-2xl border p-4 sm:p-5 flex items-start gap-4 transition cursor-pointer ${
                    notif.read
                      ? 'border-black/5 hover:border-black/10'
                      : 'border-amber-200 shadow-sm hover:shadow-md'
                  }`}
                >
                  {/* Icon */}
                  <div className={`w-10 h-10 sm:w-11 sm:h-11 flex items-center justify-center rounded-xl flex-shrink-0 ${typeColors[type]}`}>
                    <i className={`${typeIcons[type]} text-base sm:text-lg`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm sm:text-base ${notif.read ? 'font-medium text-charcoal' : 'font-bold text-charcoal'}`}>
                        {notif.title}
                      </p>
                      <span className="text-[10px] sm:text-xs text-charcoal/40 flex-shrink-0 mt-0.5">
                        {timeAgo(notif.created_at)}
                      </span>
                    </div>
                    <p className={`text-xs sm:text-sm mt-1 leading-relaxed ${notif.read ? 'text-charcoal/40' : 'text-charcoal/70'}`}>
                      {notif.message}
                    </p>

                    {/* Delivery status */}
                    <div className="flex items-center gap-2 mt-2 text-[10px] text-charcoal/40">
                      <i className="ri-signal-tower-line" />
                      {[
                        notif.push_delivered && 'Push',
                        notif.sms_delivered && 'SMS',
                        notif.email_delivered && 'Email',
                      ].filter(Boolean).join(' · ') || 'No delivery yet'}
                    </div>

                    <div className="flex items-center gap-3 mt-2.5">
                      {!notif.read && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                          Unread
                        </span>
                      )}
                      {notif.action_url && (
                        <span className="text-[10px] sm:text-xs text-charcoal/40 flex items-center gap-1">
                          <i className="ri-arrow-right-line" />
                          Tap to view
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Hover action */}
                  {!notif.read && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        markAsRead(notif.id);
                      }}
                      className="hidden sm:flex w-8 h-8 items-center justify-center rounded-full hover:bg-lightgray transition-colors flex-shrink-0"
                      title="Mark as read"
                    >
                      <i className="ri-check-double-line text-sm text-charcoal/40" />
                    </button>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

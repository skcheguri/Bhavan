import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useNotifications } from '@/hooks/useNotifications';

// Deliberately not a dropdown: this bell renders inside profile header
// cards that use overflow-hidden (for the cover photo's rounded
// corners), which clips an absolutely-positioned dropdown no matter its
// z-index. /notifications is already a full, well-built notification
// center, so it's simpler and more reliable to just go there.
export default function NotificationBell() {
  const { user } = useAuth();
  const { unreadCount } = useNotifications(user?.id);
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate('/notifications')}
      className="relative w-10 h-10 flex items-center justify-center rounded-full hover:bg-lightgray transition-colors cursor-pointer"
    >
      <i className="ri-notification-3-line text-lg text-charcoal" />
      {unreadCount > 0 && (
        <span className="absolute top-0 right-0 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
          {unreadCount}
        </span>
      )}
    </button>
  );
}

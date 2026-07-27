import { useToast } from '@/hooks/useToast';

const iconMap = {
  success: 'ri-checkbox-circle-line text-green-600',
  info: 'ri-information-line text-brand',
  warning: 'ri-error-warning-line text-amber-600',
  error: 'ri-close-circle-line text-red-500',
};

const bgMap = {
  success: 'bg-white border-l-4 border-green-500',
  info: 'bg-white border-l-4 border-brand',
  warning: 'bg-white border-l-4 border-amber-500',
  error: 'bg-white border-l-4 border-red-500',
};

export default function ToastContainer() {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-6 right-6 z-[100] flex flex-col gap-2.5 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg shadow-xl min-w-[260px] max-w-sm ${bgMap[toast.type]}`}
          role="alert"
        >
          <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
            <i className={`${iconMap[toast.type]} text-base`} />
          </div>
          <p className="text-sm font-medium text-charcoal flex-1">{toast.message}</p>
          <button
            onClick={() => removeToast(toast.id)}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-lightgray transition-colors cursor-pointer flex-shrink-0"
            aria-label="Dismiss notification"
          >
            <i className="ri-close-line text-charcoal/40 text-sm" />
          </button>
        </div>
      ))}
    </div>
  );
}
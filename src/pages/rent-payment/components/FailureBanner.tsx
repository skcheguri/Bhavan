interface Props {
  failureReason: string;
  onRetry: () => void;
  onAlternative: () => void;
  onContactLandlord?: () => void;
}

const failureMessages: Record<string, { title: string; description: string; action: string }> = {
  UPI_TIMEOUT: {
    title: 'UPI Timeout',
    description: 'The UPI request timed out. Your bank may be experiencing high traffic.',
    action: 'Retry with UPI',
  },
  BANK_REJECTED: {
    title: 'Bank Rejected',
    description: 'Your bank declined the transaction. Please check your account status.',
    action: 'Try Bank Transfer',
  },
  INSUFFICIENT_FUNDS: {
    title: 'Insufficient Funds',
    description: 'Your account does not have enough balance for this transaction.',
    action: 'Try Another Account',
  },
  USER_CANCELLED: {
    title: 'Payment Cancelled',
    description: 'You cancelled the payment on your UPI app. No amount was deducted.',
    action: 'Retry Payment',
  },
  RISK_REJECTED: {
    title: 'Risk Rejected',
    description: 'The transaction was flagged for security reasons. Contact your bank.',
    action: 'Try Alternative Method',
  },
};

export default function FailureBanner({ failureReason, onRetry, onAlternative, onContactLandlord }: Props) {
  const info = failureMessages[failureReason] ?? {
    title: 'Payment Failed',
    description: 'Something went wrong with your payment. Please try again.',
    action: 'Retry Payment',
  };

  return (
    <div className="bg-red-50 border border-red-200 rounded-2xl p-5 mb-6">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-red-100 flex-shrink-0">
          <i className="ri-error-warning-line text-red-500 text-lg" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-red-700">{info.title}</h3>
          <p className="text-xs text-red-600 leading-relaxed mt-0.5">{info.description}</p>
          <div className="flex flex-wrap gap-2 mt-3">
            <button
              onClick={onRetry}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-500 text-white text-xs font-semibold hover:bg-red-600 transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className="ri-refresh-line text-xs" /> {info.action}
            </button>
            <button
              onClick={onAlternative}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-red-200 text-xs font-medium text-red-600 hover:bg-red-100 transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className="ri-swap-line text-sm" /> Try Another Method
            </button>
            {onContactLandlord && (
              <button
                onClick={onContactLandlord}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium text-red-600 hover:text-red-700 transition-colors cursor-pointer whitespace-nowrap"
              >
                <i className="ri-phone-line text-sm" /> Contact Landlord
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
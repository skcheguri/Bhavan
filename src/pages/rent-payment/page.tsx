import { useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { useRentPayment, type RentPayment } from '@/hooks/useRentPayment';
import { useTenantRentalAgreements } from '@/hooks/useRentalAgreements';
import { useToast } from '@/hooks/useToast';
import { getSupabase, functionErrorMessage } from '@/lib/supabase';
import { loadRazorpayScript } from '@/lib/razorpay';
import FailureBanner from './components/FailureBanner';
import ReconciliationPanel from './components/ReconciliationPanel';

type PaymentTab = 'pay' | 'autopay' | 'offline' | 'history' | 'reconcile';

const paymentModeLabels: Record<string, string> = {
  upi_autopay: 'UPI AutoPay',
  razorpay: 'Online Payment',
  cash: 'Cash',
};

const statusBadges: Record<string, string> = {
  paid: 'bg-green-50 text-green-600',
  pending: 'bg-amber-50 text-amber-600',
  failed: 'bg-red-50 text-red-600',
  refunded: 'bg-lightgray text-charcoal/60',
  reconciled: 'bg-blue-50 text-blue-600',
};

const statusLabels: Record<string, string> = {
  paid: 'Paid',
  pending: 'Pending',
  failed: 'Failed',
  refunded: 'Refunded',
  reconciled: 'Reconciled',
};

export default function RentPayment() {
  const { user } = useAuth();
  const { payments, mandates, tenantPayments, getMandateForTenant, createPayment, refresh, error: paymentsFetchError } = useRentPayment();
  const { addToast } = useToast();
  const isTenant = user?.role === 'tenant';
  const isOwner = user?.role === 'owner';
  const profileLink = isTenant ? '/tenant-profile' : isOwner ? '/owner-profile' : '/';
  const profileLabel = isTenant ? 'Tenant Profile' : isOwner ? 'Owner Profile' : 'Home';

  const [activeTab, setActiveTab] = useState<PaymentTab>('pay');
  const [payStatus, setPayStatus] = useState<'idle' | 'opening' | 'verifying' | 'failed'>('idle');
  const [payError, setPayError] = useState<string | null>(null);
  const [showReconcilePanel, setShowReconcilePanel] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [monthFilter, setMonthFilter] = useState<string>('all');
  const [offlineReceipt, setOfflineReceipt] = useState('');
  const [offlineDate, setOfflineDate] = useState(new Date().toISOString().split('T')[0]);

  const { agreements: rentalAgreements } = useTenantRentalAgreements(user?.id);
  const [selectedAgreementId, setSelectedAgreementId] = useState<string | null>(null);
  const activeAgreement = rentalAgreements.find((a) => a.id === selectedAgreementId) ?? rentalAgreements[0] ?? null;
  const rentAmount = activeAgreement?.monthlyRent ?? 0; // rupees
  const propertyName = activeAgreement?.propertyAddress || 'Your property';
  const flatNumber = activeAgreement?.flatNumber ?? '';
  const landlordName = activeAgreement?.landlordName || 'Your landlord';
  const dueDay = activeAgreement?.rentDueDay || 5;
  const today = new Date();
  const daysUntilDue = dueDay - today.getDate() > 0 ? dueDay - today.getDate() : 30 + dueDay - today.getDate();

  const myPayments = isTenant && user ? tenantPayments(user.id) : payments;
  const myMandate = isTenant && user ? getMandateForTenant(user.id) : null;
  // Scoped to the currently selected property -- a failed payment on a
  // different property shouldn't block or mislabel the retry button here,
  // since retrying always pays against activeAgreement.
  const activePropertyPayments = activeAgreement ? myPayments.filter((p) => p.agreement_id === activeAgreement.id) : [];
  const latestFailed = activePropertyPayments.find((p) => p.status === 'failed');
  const hasFailed = isTenant && !!latestFailed;

  const months = Array.from(new Set(payments.map((p) => p.month))).sort();

  const filteredHistory = myPayments.filter((p) => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (monthFilter !== 'all' && p.month !== monthFilter) return false;
    return true;
  });

  const handleLogOffline = async () => {
    if (!offlineReceipt.trim()) {
      addToast('Please enter a receipt or reference number', 'error');
      return;
    }
    if (!user) return;
    if (!activeAgreement) {
      addToast('No rental agreement found for your account yet.', 'error');
      return;
    }
    const { data, error } = await createPayment({
      tenant_id: user.id,
      owner_id: activeAgreement.ownerId,
      agreement_id: activeAgreement.id,
      amount: Math.round(rentAmount * 100),
      month: formatMonthKey(new Date(offlineDate)),
      payment_mode: 'cash',
      transaction_ref: offlineReceipt,
    });
    if (error) {
      addToast(error, 'error');
      return;
    }
    addToast('Offline payment logged successfully', 'success');
    setOfflineReceipt('');
    await refresh();
  };

  const handlePayNow = async (monthOverride?: string, agreementIdOverride?: string) => {
    const agreementId = agreementIdOverride ?? activeAgreement?.id;
    if (!agreementId) return;
    const supabase = getSupabase();
    if (!supabase) {
      setPayStatus('failed');
      setPayError('Payments are not available right now.');
      return;
    }

    setPayStatus('opening');
    setPayError(null);

    const month = monthOverride || formatMonthKey(new Date());
    const { data: orderData, error: orderError } = await supabase.functions.invoke('create-rent-payment-order', {
      body: { agreementId, month },
    });

    if (orderError || !orderData?.orderId) {
      setPayStatus('failed');
      setPayError((await functionErrorMessage(orderError)) || 'Could not start this payment. Please try again.');
      return;
    }

    const scriptLoaded = await loadRazorpayScript();
    if (!scriptLoaded || !window.Razorpay) {
      setPayStatus('failed');
      setPayError('Could not load the payment window. Check your connection and try again.');
      return;
    }

    const razorpay = new window.Razorpay({
      key: orderData.keyId,
      amount: orderData.amount,
      currency: orderData.currency,
      order_id: orderData.orderId,
      name: 'Bhavan',
      description: `Rent — ${month}`,
      prefill: {
        name: orderData.tenantName,
        email: orderData.tenantEmail,
      },
      theme: { color: '#f59e0b' },
      handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
        setPayStatus('verifying');
        const { data: verifyData, error: verifyError } = await supabase.functions.invoke('verify-rent-payment', {
          body: {
            paymentRowId: orderData.paymentRowId,
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
          },
        });
        if (verifyError || !verifyData?.success) {
          setPayStatus('failed');
          setPayError((await functionErrorMessage(verifyError)) || 'We could not confirm this payment. If money was deducted, it will reconcile shortly — contact your landlord if it does not.');
          return;
        }
        setPayStatus('idle');
        addToast('Rent payment successful!', 'success');
        await refresh();
      },
      modal: {
        ondismiss: () => setPayStatus('idle'),
      },
    });
    razorpay.open();
  };

  // Retrying must target the property the failed payment actually belongs
  // to, not whatever happens to be selected in the property dropdown --
  // passing agreementId explicitly avoids relying on setSelectedAgreementId
  // (async state) having applied before handlePayNow reads it.
  const handleRetryPayment = (payment: RentPayment) => {
    if (payment.agreement_id) setSelectedAgreementId(payment.agreement_id);
    setActiveTab('pay');
    handlePayNow(payment.month, payment.agreement_id ?? undefined);
  };

  const tabs: { id: PaymentTab; label: string; icon: string; show: boolean }[] = [
    { id: 'pay', label: 'Pay Rent', icon: 'ri-bank-card-line', show: true },
    { id: 'autopay', label: 'UPI AutoPay', icon: 'ri-repeat-line', show: true },
    { id: 'offline', label: 'Cash Payment', icon: 'ri-money-rupee-circle-line', show: true },
    { id: 'history', label: 'History', icon: 'ri-history-line', show: true },
    { id: 'reconcile', label: 'Reconcile', icon: 'ri-bank-line', show: isOwner },
  ];

  return (
    <div className="min-h-screen bg-offwhite pb-16">
      <div className="max-w-5xl mx-auto px-4 md:px-8">

        {/* Breadcrumb */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <Link to={profileLink} className="text-sm text-charcoal/40 hover:text-brand transition-colors cursor-pointer">{profileLabel}</Link>
            <i className="ri-arrow-right-s-line text-charcoal/30" />
            <span className="text-sm text-charcoal font-medium">Rent Payment</span>
          </div>
        </div>

        {/* Header Card */}
        <div className="bg-white rounded-2xl border border-black/5 p-6 sm:p-7 mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-[2rem] font-semibold text-charcoal tracking-[-.03em] leading-tight">Rent Payment</h1>
              <p className="text-sm text-charcoal/60 mt-1">Pay your rent online, set up AutoPay, or log a cash payment</p>
            </div>
            {isTenant && (
              <div className="flex items-center gap-3">
                <div className="bg-amber-50 rounded-xl px-4 py-3 border border-amber-100">
                  <p className="text-xs text-charcoal/40 uppercase tracking-wide">Due in {daysUntilDue} days</p>
                  <p className="text-xl font-black text-charcoal">₹{rentAmount.toLocaleString('en-IN')}</p>
                </div>
              </div>
            )}
            {isOwner && (
              <div className="flex items-center gap-3">
                <div className="bg-green-50 rounded-xl px-4 py-3 border border-green-100">
                  <p className="text-xs text-charcoal/40 uppercase tracking-wide">Collected This Month</p>
                  <p className="text-xl font-black text-charcoal">
                    ₹{((payments.filter((p) => p.status === 'paid' || p.status === 'reconciled').reduce((s, p) => s + p.amount, 0)) / 100).toLocaleString('en-IN')}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Property Selector -- only relevant once a tenant has more than one rental agreement */}
          {isTenant && rentalAgreements.length > 1 && (
            <div className="mt-5 pt-5 border-t border-black/5">
              <label className="block text-xs font-semibold text-charcoal/60 mb-1.5 uppercase tracking-wide">Which property is this for?</label>
              <select
                value={activeAgreement?.id ?? ''}
                onChange={(e) => setSelectedAgreementId(e.target.value)}
                className="w-full md:w-96 px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 border border-black/5 cursor-pointer"
              >
                {rentalAgreements.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.propertyAddress}{a.flatNumber ? ` · ${a.flatNumber}` : ''} — ₹{a.monthlyRent.toLocaleString('en-IN')}/mo
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Failure Banner */}
          {hasFailed && latestFailed && (
            <div className="mt-5">
              <FailureBanner
                failureReason={latestFailed.failure_reason ?? 'UPI_TIMEOUT'}
                onRetry={() => handleRetryPayment(latestFailed)}
                onAlternative={() => setActiveTab('pay')}
              />
            </div>
          )}
        </div>

        {/* Payment Method Tabs */}
        <div className="flex gap-1 bg-white rounded-xl border border-black/5 p-1.5 mb-6 overflow-x-auto">
          {tabs.filter((t) => t.show).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap flex-shrink-0 ${
                activeTab === tab.id ? 'bg-brand text-white' : 'text-charcoal/60 hover:text-charcoal hover:bg-lightgray'
              }`}
            >
              <i className={`${tab.icon} text-sm`} />
              {tab.label}
              {tab.id === 'autopay' && (
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-600'}`}>
                  SOON
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Pay Rent Tab */}
        {activeTab === 'pay' && (
          <div className="bg-white rounded-2xl border border-black/5 p-6 sm:p-7">
            <div className="max-w-md mx-auto">
              <h2 className="text-[15px] font-semibold text-charcoal mb-1 text-center">Pay Rent</h2>
              <p className="text-sm text-charcoal/60 mb-5 text-center">Card, UPI, or netbanking — pick whatever's easiest on the next screen</p>

              <div className="bg-offwhite rounded-2xl p-6 border border-black/5 mb-5 text-center">
                <p className="text-xs text-charcoal/40 uppercase tracking-wide mb-1">Amount Due</p>
                <p className="text-3xl font-black text-charcoal">₹{rentAmount.toLocaleString('en-IN')}</p>
                <p className="text-xs text-charcoal/60 mt-2">{propertyName}{flatNumber ? ` · ${flatNumber}` : ''}</p>
                <p className="text-xs text-charcoal/40 mt-0.5">to {landlordName} · due in {daysUntilDue} days</p>
              </div>

              {payStatus === 'failed' && payError && (
                <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 flex items-start gap-2 mb-4">
                  <i className="ri-error-warning-line text-red-500 text-sm flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700 leading-relaxed">{payError}</p>
                </div>
              )}

              {isTenant && !activeAgreement ? (
                <p className="text-xs text-charcoal/40 text-center py-2">No rental agreement found for your account yet — ask your landlord to share one before paying rent.</p>
              ) : (
                <button
                  onClick={() => handlePayNow()}
                  disabled={!activeAgreement || payStatus === 'opening' || payStatus === 'verifying'}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-dark disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
                >
                  {payStatus === 'opening' && <><i className="ri-loader-4-line animate-spin" /> Opening payment window…</>}
                  {payStatus === 'verifying' && <><i className="ri-loader-4-line animate-spin" /> Confirming payment…</>}
                  {(payStatus === 'idle' || payStatus === 'failed') && <><i className="ri-secure-payment-line" /> Pay Rent Now</>}
                </button>
              )}
              <p className="text-xs text-charcoal/40 text-center mt-3">Secured by Razorpay</p>
            </div>
          </div>
        )}

        {/* UPI AutoPay Tab */}
        {activeTab === 'autopay' && (
          <div className="bg-white rounded-2xl border border-black/5 p-6 sm:p-7">
            <div className="flex flex-col lg:flex-row gap-8">
              <div className="flex-1">
                <h2 className="text-[15px] font-semibold text-charcoal mb-1">UPI AutoPay</h2>
                <p className="text-sm text-charcoal/60 mb-5">Set up automatic monthly rent debit — never miss a due date</p>

                {myMandate ? (
                  <div className="space-y-4">
                    <div className="bg-green-50 rounded-2xl p-5 border border-green-100">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-green-100">
                          <i className="ri-repeat-line text-green-600 text-lg" />
                        </div>
                        <div>
                          <p className="text-[15px] font-semibold text-charcoal">AutoPay {myMandate.status === 'active' ? 'Active' : 'Paused'}</p>
                          <p className="text-xs text-charcoal/60">{myMandate.upi_id}</p>
                        </div>
                        <span className={`ml-auto text-xs font-semibold px-2.5 py-1 rounded-full ${myMandate.status === 'active' ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'}`}>
                          {myMandate.status.charAt(0).toUpperCase() + myMandate.status.slice(1)}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-white rounded-xl p-3">
                          <p className="text-xs text-charcoal/40">Monthly Debit</p>
                          <p className="text-[15px] font-semibold text-charcoal">₹{(myMandate.mandate_amount / 100).toLocaleString('en-IN')}</p>
                        </div>
                        <div className="bg-white rounded-xl p-3">
                          <p className="text-xs text-charcoal/40">Next Debit</p>
                          <p className="text-[15px] font-semibold text-charcoal">{new Date(myMandate.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={async () => {
                          // pause mandate
                          addToast('Mandate paused', 'success');
                          await refresh();
                        }}
                        className="flex-1 py-3 rounded-xl border border-black/10 text-sm font-medium text-charcoal hover:bg-lightgray transition-colors cursor-pointer whitespace-nowrap"
                      >
                        Pause Mandate
                      </button>
                      <button
                        onClick={async () => {
                          addToast('Mandate cancelled', 'success');
                          await refresh();
                        }}
                        className="flex-1 py-3 rounded-xl border border-red-100 text-sm font-medium text-red-500 hover:bg-red-50 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        Cancel AutoPay
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-offwhite rounded-2xl p-6 border border-black/5 text-center">
                    <div className="w-16 h-16 mx-auto rounded-full bg-brand/10 flex items-center justify-center mb-4">
                      <i className="ri-repeat-line text-brand text-2xl" />
                    </div>
                    <h3 className="text-[15px] font-semibold text-charcoal mb-1">Coming Soon</h3>
                    <p className="text-sm text-charcoal/60">UPI AutoPay isn't available yet — for now, pay each month from the Pay Rent tab. We'll let you know when automatic monthly debit is ready.</p>
                  </div>
                )}
              </div>

              <div className="lg:w-72">
                <div className="bg-offwhite rounded-2xl p-5 border border-black/5">
                  <h3 className="text-[15px] font-semibold text-charcoal mb-3">How It Will Work</h3>
                  <div className="space-y-3">
                    {[
                      { step: '1', text: 'Enter your UPI ID and select bank' },
                      { step: '2', text: 'Approve mandate on your UPI app' },
                      { step: '3', text: 'Rent auto-debited every month on the 1st' },
                    ].map((item) => (
                      <div key={item.step} className="flex items-start gap-3">
                        <div className="w-6 h-6 flex items-center justify-center rounded-full bg-brand text-white text-xs font-bold flex-shrink-0">
                          {item.step}
                        </div>
                        <p className="text-xs text-charcoal/70 leading-relaxed">{item.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Offline Tab */}
        {activeTab === 'offline' && (
          <div className="bg-white rounded-2xl border border-black/5 p-6 sm:p-7">
            <h2 className="text-[15px] font-semibold text-charcoal mb-1">Log a Cash Payment</h2>
            <p className="text-sm text-charcoal/60 mb-5">Record rent paid in person so it shows up in your payment history</p>

            <div className="max-w-md space-y-4">
              <div className="bg-offwhite rounded-2xl p-5 border border-black/5">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs text-charcoal/40 uppercase tracking-wide">Amount</span>
                  <span className="text-lg font-black text-charcoal">₹{rentAmount.toLocaleString('en-IN')}</span>
                </div>
                <label className="block text-xs font-semibold text-charcoal/60 mb-1.5 uppercase tracking-wide">Receipt / Reference Number</label>
                <input
                  type="text"
                  value={offlineReceipt}
                  onChange={(e) => setOfflineReceipt(e.target.value)}
                  placeholder="e.g., CASH/RECPT/001"
                  className="w-full px-4 py-3 bg-white rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 border border-black/5"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-charcoal/60 mb-1.5 uppercase tracking-wide">Payment Date</label>
                <input
                  type="date"
                  value={offlineDate}
                  onChange={(e) => setOfflineDate(e.target.value)}
                  className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 border border-black/5"
                />
              </div>
              <button
                onClick={handleLogOffline}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-dark transition-colors cursor-pointer whitespace-nowrap"
              >
                <i className="ri-save-line text-sm" /> Log Payment
              </button>
              <p className="text-xs text-charcoal/40 leading-relaxed">Get a signed receipt from your landlord with the date, amount, and property details for your own records.</p>
            </div>
          </div>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <div className="bg-white rounded-2xl border border-black/5 p-6 sm:p-7">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
              <div>
                <h2 className="text-[15px] font-semibold text-charcoal">Payment History</h2>
                <p className="text-sm text-charcoal/60 mt-0.5">{filteredHistory.length} payment records</p>
              </div>
              <div className="flex gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-3 py-2 bg-offwhite rounded-xl text-sm text-charcoal/70 focus:outline-none focus:ring-2 focus:ring-brand/30 border border-black/5 cursor-pointer"
                >
                  <option value="all">All Status</option>
                  <option value="paid">Paid</option>
                  <option value="pending">Pending</option>
                  <option value="failed">Failed</option>
                  <option value="reconciled">Reconciled</option>
                </select>
                <select
                  value={monthFilter}
                  onChange={(e) => setMonthFilter(e.target.value)}
                  className="px-3 py-2 bg-offwhite rounded-xl text-sm text-charcoal/70 focus:outline-none focus:ring-2 focus:ring-brand/30 border border-black/5 cursor-pointer"
                >
                  <option value="all">All Months</option>
                  {months.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            </div>

            {paymentsFetchError ? (
              // The hook exposes a real fetch-error state -- an empty
              // history on failure would look like "never paid rent."
              <div className="text-center py-12">
                <div className="w-14 h-14 flex items-center justify-center mx-auto mb-4 bg-red-50 rounded-full">
                  <i className="ri-wifi-off-line text-2xl text-red-500" />
                </div>
                <p className="text-sm font-semibold text-charcoal mb-1">Couldn't load payment history</p>
                <p className="text-sm text-charcoal/60 mb-4">Your past payments may exist but couldn't be shown right now.</p>
                <button onClick={() => refresh()} className="bg-charcoal text-white px-5 py-2 rounded-full text-xs font-medium hover:bg-black transition-colors cursor-pointer">Retry</button>
              </div>
            ) : filteredHistory.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-14 h-14 flex items-center justify-center mx-auto mb-4 bg-lightgray rounded-full">
                  <i className="ri-history-line text-2xl text-charcoal/40" />
                </div>
                <p className="text-sm text-charcoal/60">No payments match your filters.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px]">
                  <thead>
                    <tr className="border-b border-black/5">
                      {rentalAgreements.length > 1 && (
                        <th className="text-left px-4 py-3 text-xs font-semibold text-charcoal/40 uppercase tracking-wide">Property</th>
                      )}
                      <th className="text-left px-4 py-3 text-xs font-semibold text-charcoal/40 uppercase tracking-wide">Month</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-charcoal/40 uppercase tracking-wide">Amount</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-charcoal/40 uppercase tracking-wide">Mode</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-charcoal/40 uppercase tracking-wide">Reference</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-charcoal/40 uppercase tracking-wide">Date</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-charcoal/40 uppercase tracking-wide">Status</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-charcoal/40 uppercase tracking-wide">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHistory.map((p) => (
                      <tr key={p.id} className="border-b border-gray-50 last:border-0 hover:bg-offwhite transition-colors">
                        {rentalAgreements.length > 1 && (
                          <td className="px-4 py-3.5 text-sm text-charcoal/60">
                            {rentalAgreements.find((a) => a.id === p.agreement_id)?.propertyAddress || '—'}
                          </td>
                        )}
                        <td className="px-4 py-3.5 text-sm font-semibold text-charcoal">{p.month}</td>
                        <td className="px-4 py-3.5 text-[15px] font-semibold text-charcoal">₹{(p.amount / 100).toLocaleString('en-IN')}</td>
                        <td className="px-4 py-3.5 text-sm text-charcoal/60">{paymentModeLabels[p.payment_mode]}</td>
                        <td className="px-4 py-3.5 text-sm text-charcoal/60 font-mono text-xs">{p.transaction_ref}</td>
                        <td className="px-4 py-3.5 text-sm text-charcoal/60">{new Date(p.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</td>
                        <td className="px-4 py-3.5">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusBadges[p.status]}`}>
                            {statusLabels[p.status]}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            {p.status === 'failed' && (
                              <button
                                onClick={() => handleRetryPayment(p)}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-200 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors cursor-pointer whitespace-nowrap"
                              >
                                <i className="ri-refresh-line text-sm" /> Retry
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Reconcile Tab (Owner only) */}
        {activeTab === 'reconcile' && isOwner && (
          <div className="bg-white rounded-2xl border border-black/5 overflow-hidden">
            <div className="px-6 py-5 border-b border-black/5 flex items-center justify-between">
              <div>
                <h2 className="text-[15px] font-semibold text-charcoal">Payment Reconciliation</h2>
                <p className="text-sm text-charcoal/60 mt-0.5">Match bank statement entries to rent payment records</p>
              </div>
            </div>
            <ReconciliationPanel ownerId={user?.id ?? ''} onClose={() => setActiveTab('history')} />
          </div>
        )}
      </div>

    </div>
  );
}

function formatMonthKey(date: Date): string {
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${months[date.getMonth()]} ${date.getFullYear()}`;
}
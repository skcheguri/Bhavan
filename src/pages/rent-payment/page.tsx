import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useRentPayment } from '@/hooks/useRentPayment';
import { useToast } from '@/hooks/useToast';
import UPIQRModal from './components/UPIQRModal';
import AutoPaySetupModal from './components/AutoPaySetupModal';
import FailureBanner from './components/FailureBanner';
import ReconciliationPanel from './components/ReconciliationPanel';

type PaymentTab = 'autopay' | 'upiqr' | 'bank' | 'offline' | 'history' | 'reconcile';

const paymentModeLabels: Record<string, string> = {
  upi_autopay: 'UPI AutoPay',
  upi_qr: 'UPI QR',
  bank_transfer: 'Bank Transfer',
  cash: 'Cash',
  cheque: 'Cheque',
  razorpay_recurring: 'Razorpay Recurring',
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
  const { payments, mandates, tenantPayments, hasFailedPayment, getMandateForTenant, retryPayment, createPayment, refresh } = useRentPayment();
  const { addToast } = useToast();
  const isTenant = user?.role === 'tenant';
  const isOwner = user?.role === 'owner';
  const profileLink = isTenant ? '/tenant-profile' : isOwner ? '/owner-profile' : '/';
  const profileLabel = isTenant ? 'Tenant Profile' : isOwner ? 'Owner Profile' : 'Home';

  const [activeTab, setActiveTab] = useState<PaymentTab>('upiqr');
  const [showQRModal, setShowQRModal] = useState(false);
  const [showAutoPayModal, setShowAutoPayModal] = useState(false);
  const [showReconcilePanel, setShowReconcilePanel] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [monthFilter, setMonthFilter] = useState<string>('all');
  const [offlineReceipt, setOfflineReceipt] = useState('');
  const [offlineDate, setOfflineDate] = useState(new Date().toISOString().split('T')[0]);

  // Mock tenant data (in real app, from tenant record)
  const rentAmount = 2200000; // ₹22,000 in paise
  const propertyName = 'Prestige Towers';
  const flatNumber = 'B-204';
  const landlordVpa = 'suresh.patel@okaxis';
  const dueDay = 1;
  const today = new Date();
  const daysUntilDue = dueDay - today.getDate() > 0 ? dueDay - today.getDate() : 30 + dueDay - today.getDate();

  const myPayments = isTenant && user ? tenantPayments(user.id) : payments;
  const myMandate = isTenant && user ? getMandateForTenant(user.id) : null;
  const hasFailed = isTenant && user ? hasFailedPayment(user.id) : false;
  const latestFailed = myPayments.find((p) => p.status === 'failed');

  const months = Array.from(new Set(payments.map((p) => p.month))).sort();

  const filteredHistory = myPayments.filter((p) => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (monthFilter !== 'all' && p.month !== monthFilter) return false;
    return true;
  });

  const handleRetry = async (paymentId: string) => {
    const { data, error } = await retryPayment(paymentId);
    if (error) {
      addToast(error, 'error');
      return;
    }
    if (data) {
      addToast('Payment retry initiated', 'success');
      await refresh();
    }
  };

  const handleLogOffline = async () => {
    if (!offlineReceipt.trim()) {
      addToast('Please enter a receipt or reference number', 'error');
      return;
    }
    if (!user) return;
    const { data, error } = await createPayment({
      tenant_id: user.id,
      property_id: 'p1',
      owner_id: 'mock-owner-001',
      amount: rentAmount,
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

  const handleQRPaid = async () => {
    if (!user) return;
    const { data, error } = await createPayment({
      tenant_id: user.id,
      property_id: 'p1',
      owner_id: 'mock-owner-001',
      amount: rentAmount,
      month: formatMonthKey(new Date()),
      payment_mode: 'upi_qr',
      transaction_ref: `UPI/QR/${Date.now()}`,
    });
    if (error) {
      addToast(error, 'error');
      return;
    }
    addToast('Rent payment successful!', 'success');
    setShowQRModal(false);
    await refresh();
  };

  const handleAutoPaySetup = async (upiId: string, bank: string) => {
    setShowAutoPayModal(false);
    addToast(`UPI AutoPay activated with ${upiId}`, 'success');
    await refresh();
  };

  const tabs: { id: PaymentTab; label: string; icon: string; show: boolean }[] = [
    { id: 'upiqr', label: 'UPI QR', icon: 'ri-qr-code-line', show: true },
    { id: 'autopay', label: 'UPI AutoPay', icon: 'ri-repeat-line', show: true },
    { id: 'bank', label: 'Bank Transfer', icon: 'ri-exchange-line', show: true },
    { id: 'offline', label: 'Offline', icon: 'ri-money-rupee-circle-line', show: true },
    { id: 'history', label: 'History', icon: 'ri-history-line', show: true },
    { id: 'reconcile', label: 'Reconcile', icon: 'ri-bank-line', show: isOwner },
  ];

  return (
    <div className="min-h-screen bg-offwhite pt-20 pb-16">
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
        <div className="bg-white rounded-3xl border border-black/5 p-6 mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-charcoal">Rent Payment</h1>
              <p className="text-sm text-charcoal/60 mt-1">Pay your rent securely via UPI, bank transfer, or offline methods</p>
            </div>
            {isTenant && (
              <div className="flex items-center gap-3">
                <div className="bg-amber-50 rounded-xl px-4 py-3 border border-amber-100">
                  <p className="text-xs text-charcoal/40 uppercase tracking-wide">Due in {daysUntilDue} days</p>
                  <p className="text-xl font-black text-charcoal">₹{(rentAmount / 100).toLocaleString('en-IN')}</p>
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

          {/* Failure Banner */}
          {hasFailed && latestFailed && (
            <div className="mt-5">
              <FailureBanner
                failureReason={latestFailed.failure_reason ?? 'UPI_TIMEOUT'}
                onRetry={() => handleRetry(latestFailed.id)}
                onAlternative={() => setActiveTab('bank')}
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
            </button>
          ))}
        </div>

        {/* UPI QR Tab */}
        {activeTab === 'upiqr' && (
          <div className="bg-white rounded-3xl border border-black/5 p-6">
            <div className="flex flex-col lg:flex-row gap-8">
              <div className="flex-1">
                <h2 className="text-base font-bold text-charcoal mb-1">UPI QR Payment</h2>
                <p className="text-sm text-charcoal/60 mb-5">Scan the QR code with any UPI app to pay instantly</p>

                <div className="bg-offwhite rounded-2xl p-6 border border-black/5 mb-5">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-xs text-charcoal/40 uppercase tracking-wide">Property</p>
                      <p className="text-sm font-bold text-charcoal">{propertyName} · {flatNumber}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-charcoal/40 uppercase tracking-wide">Amount</p>
                      <p className="text-xl font-black text-charcoal">₹{(rentAmount / 100).toLocaleString('en-IN')}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-charcoal/60">
                    <span className="flex items-center gap-1"><i className="ri-user-line" /> {isTenant ? user?.name : 'Tenant'}</span>
                    <span className="flex items-center gap-1"><i className="ri-home-4-line" /> {landlordVpa}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-5">
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-green-50 border border-green-100">
                    <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-green-100">
                      <i className="ri-shield-check-line text-green-600" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-charcoal">Instant</p>
                      <p className="text-[10px] text-charcoal/60">Payment reflects in minutes</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-50 border border-amber-100">
                    <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-amber-100">
                      <i className="ri-secure-payment-line text-amber-600" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-charcoal">Secure</p>
                      <p className="text-[10px] text-charcoal/60">Razorpay-encrypted link</p>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setShowQRModal(true)}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-dark transition-colors cursor-pointer whitespace-nowrap"
                >
                  <i className="ri-qr-code-line text-sm" /> Generate QR Code
                </button>
              </div>

              <div className="lg:w-72">
                <div className="bg-offwhite rounded-2xl p-5 border border-black/5 h-full">
                  <h3 className="text-sm font-bold text-charcoal mb-4">Supported UPI Apps</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {['Google Pay', 'PhonePe', 'Paytm', 'BHIM', 'Amazon Pay', 'Samsung Pay'].map((app) => (
                      <div key={app} className="flex items-center gap-2 p-2 rounded-lg bg-white border border-black/5">
                        <div className="w-6 h-6 flex items-center justify-center">
                          <i className="ri-smartphone-line text-sm text-charcoal/60" />
                        </div>
                        <span className="text-xs font-medium text-charcoal">{app}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 bg-amber-50 rounded-xl p-3 flex items-start gap-2">
                    <i className="ri-information-line text-amber-500 text-sm flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700 leading-relaxed">
                      QR codes expire after 24 hours for security. You can generate a new one anytime.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* UPI AutoPay Tab */}
        {activeTab === 'autopay' && (
          <div className="bg-white rounded-3xl border border-black/5 p-6">
            <div className="flex flex-col lg:flex-row gap-8">
              <div className="flex-1">
                <h2 className="text-base font-bold text-charcoal mb-1">UPI AutoPay</h2>
                <p className="text-sm text-charcoal/60 mb-5">Set up automatic monthly rent debit — never miss a due date</p>

                {myMandate ? (
                  <div className="space-y-4">
                    <div className="bg-green-50 rounded-2xl p-5 border border-green-100">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-green-100">
                          <i className="ri-repeat-line text-green-600 text-lg" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-charcoal">AutoPay {myMandate.status === 'active' ? 'Active' : 'Paused'}</p>
                          <p className="text-xs text-charcoal/60">{myMandate.upi_id}</p>
                        </div>
                        <span className={`ml-auto text-xs font-semibold px-2.5 py-1 rounded-full ${myMandate.status === 'active' ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'}`}>
                          {myMandate.status.charAt(0).toUpperCase() + myMandate.status.slice(1)}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-white rounded-xl p-3">
                          <p className="text-xs text-charcoal/40">Monthly Debit</p>
                          <p className="text-sm font-bold text-charcoal">₹{(myMandate.mandate_amount / 100).toLocaleString('en-IN')}</p>
                        </div>
                        <div className="bg-white rounded-xl p-3">
                          <p className="text-xs text-charcoal/40">Next Debit</p>
                          <p className="text-sm font-bold text-charcoal">{new Date(myMandate.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
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
                  <div className="space-y-4">
                    <div className="bg-offwhite rounded-2xl p-6 border border-black/5 text-center">
                      <div className="w-16 h-16 mx-auto rounded-full bg-brand/10 flex items-center justify-center mb-4">
                        <i className="ri-repeat-line text-brand text-2xl" />
                      </div>
                      <h3 className="text-base font-bold text-charcoal mb-1">No AutoPay Set Up</h3>
                      <p className="text-sm text-charcoal/60 mb-5">Activate UPI AutoPay to never miss a rent payment again.</p>
                      <button
                        onClick={() => setShowAutoPayModal(true)}
                        className="px-6 py-3 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-dark transition-colors cursor-pointer whitespace-nowrap"
                      >
                        Setup UPI AutoPay
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { icon: 'ri-calendar-check-line', label: 'Auto-debit on 1st', color: 'text-brand' },
                        { icon: 'ri-notification-off-line', label: 'No reminders needed', color: 'text-amber-600' },
                        { icon: 'ri-shield-check-line', label: 'Bank-grade security', color: 'text-green-600' },
                      ].map((item) => (
                        <div key={item.label} className="flex flex-col items-center gap-2 p-3 rounded-xl bg-lightgray">
                          <div className="w-8 h-8 flex items-center justify-center">
                            <i className={`${item.icon} text-lg ${item.color}`} />
                          </div>
                          <p className="text-xs text-center text-charcoal/70 leading-tight">{item.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="lg:w-72">
                <div className="bg-offwhite rounded-2xl p-5 border border-black/5">
                  <h3 className="text-sm font-bold text-charcoal mb-3">How It Works</h3>
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

        {/* Bank Transfer Tab */}
        {activeTab === 'bank' && (
          <div className="bg-white rounded-3xl border border-black/5 p-6">
            <div className="flex flex-col lg:flex-row gap-8">
              <div className="flex-1">
                <h2 className="text-base font-bold text-charcoal mb-1">Bank Transfer</h2>
                <p className="text-sm text-charcoal/60 mb-5">Transfer rent via NEFT, RTGS, or IMPS to your landlord's account</p>

                <div className="bg-offwhite rounded-2xl p-6 border border-black/5 space-y-4">
                  <div className="flex items-center justify-between pb-4 border-b border-black/5">
                    <span className="text-xs text-charcoal/40 uppercase tracking-wide">Account Holder</span>
                    <span className="text-sm font-semibold text-charcoal">Suresh Patel</span>
                  </div>
                  <div className="flex items-center justify-between pb-4 border-b border-black/5">
                    <span className="text-xs text-charcoal/40 uppercase tracking-wide">Bank Name</span>
                    <span className="text-sm font-semibold text-charcoal">Axis Bank</span>
                  </div>
                  <div className="flex items-center justify-between pb-4 border-b border-black/5">
                    <span className="text-xs text-charcoal/40 uppercase tracking-wide">Account Number</span>
                    <span className="text-sm font-semibold text-charcoal">XXXX XXXX 4521</span>
                  </div>
                  <div className="flex items-center justify-between pb-4 border-b border-black/5">
                    <span className="text-xs text-charcoal/40 uppercase tracking-wide">IFSC Code</span>
                    <span className="text-sm font-semibold text-charcoal">UTIB0001234</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-charcoal/40 uppercase tracking-wide">Branch</span>
                    <span className="text-sm font-semibold text-charcoal">Koramangala, Bangalore</span>
                  </div>
                </div>

                <div className="mt-5 bg-amber-50 rounded-xl p-4 flex items-start gap-3 border border-amber-100">
                  <i className="ri-lightbulb-line text-amber-500 text-sm flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-amber-800 mb-1">Transfer Tips</p>
                    <ul className="space-y-1">
                      {['Use your flat number as reference (e.g., B-204)', 'NEFT/IMPS usually clears within 30 minutes', 'Keep the transaction screenshot for records'].map((tip) => (
                        <li key={tip} className="text-xs text-amber-700 leading-relaxed">• {tip}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              <div className="lg:w-72">
                <div className="bg-offwhite rounded-2xl p-5 border border-black/5">
                  <h3 className="text-sm font-bold text-charcoal mb-3">Transfer Methods</h3>
                  <div className="space-y-3">
                    {[
                      { name: 'NEFT', desc: '2-4 hours, any amount', icon: 'ri-bank-line' },
                      { name: 'IMPS', desc: 'Instant, up to ₹5L', icon: 'ri-flashlight-line' },
                      { name: 'RTGS', desc: 'Instant, ₹2L+ only', icon: 'ri-arrow-right-up-line' },
                    ].map((method) => (
                      <div key={method.name} className="flex items-center gap-3 p-3 rounded-xl bg-white border border-black/5">
                        <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-brand/10">
                          <i className={`${method.icon} text-sm text-brand`} />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-charcoal">{method.name}</p>
                          <p className="text-[10px] text-charcoal/60">{method.desc}</p>
                        </div>
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
          <div className="bg-white rounded-3xl border border-black/5 p-6">
            <h2 className="text-base font-bold text-charcoal mb-1">Offline Payment</h2>
            <p className="text-sm text-charcoal/60 mb-5">Log cash or cheque payments for record-keeping</p>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="bg-offwhite rounded-2xl p-5 border border-black/5">
                  <div className="mb-4">
                    <label className="block text-xs font-semibold text-charcoal/60 mb-1.5 uppercase tracking-wide">Payment Mode</label>
                    <div className="flex gap-2">
                      <button className="flex-1 py-2.5 rounded-xl bg-brand text-white text-sm font-medium cursor-pointer whitespace-nowrap">Cash</button>
                      <button className="flex-1 py-2.5 rounded-xl border border-black/10 text-sm font-medium text-charcoal/60 hover:bg-lightgray transition-colors cursor-pointer whitespace-nowrap">Cheque</button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-charcoal/60 mb-1.5 uppercase tracking-wide">Receipt / Reference Number</label>
                    <input
                      type="text"
                      value={offlineReceipt}
                      onChange={(e) => setOfflineReceipt(e.target.value)}
                      placeholder="e.g., CASH/RECPT/001 or CHQ/ICIC/001234"
                      className="w-full px-4 py-3 bg-white rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 border border-black/5"
                    />
                  </div>
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
              </div>

              <div className="bg-offwhite rounded-2xl p-5 border border-black/5">
                <h3 className="text-sm font-bold text-charcoal mb-3">Offline Guidelines</h3>
                <div className="space-y-3">
                  {[
                    { title: 'Cash', desc: 'Get a signed receipt from your landlord with date, amount, and property details.' },
                    { title: 'Cheque', desc: 'Write the flat number on the back of the cheque. Allow 2-3 working days for clearance.' },
                    { title: 'Record Keeping', desc: 'Always upload a photo of the receipt or cheque for your rent payment history.' },
                  ].map((g) => (
                    <div key={g.title} className="bg-white rounded-xl p-3 border border-black/5">
                      <p className="text-xs font-bold text-charcoal mb-0.5">{g.title}</p>
                      <p className="text-xs text-charcoal/60 leading-relaxed">{g.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <div className="bg-white rounded-3xl border border-black/5 p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
              <div>
                <h2 className="text-base font-bold text-charcoal">Payment History</h2>
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

            {filteredHistory.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-14 h-14 flex items-center justify-center mx-auto mb-4 bg-lightgray rounded-full">
                  <i className="ri-history-line text-2xl text-charcoal/40" />
                </div>
                <p className="text-sm text-charcoal/60">No payments match your filters.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-black/5">
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
                        <td className="px-4 py-3.5 text-sm font-semibold text-charcoal">{p.month}</td>
                        <td className="px-4 py-3.5 text-sm font-bold text-charcoal">₹{(p.amount / 100).toLocaleString('en-IN')}</td>
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
                                onClick={() => handleRetry(p.id)}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-200 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors cursor-pointer whitespace-nowrap"
                              >
                                <i className="ri-refresh-line text-sm" /> Retry
                              </button>
                            )}
                            {p.receipt_url && (
                              <button className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-black/10 text-xs font-medium text-charcoal hover:border-brand/40 hover:text-brand transition-colors cursor-pointer whitespace-nowrap">
                                <i className="ri-download-line text-sm" /> Receipt
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
          <div className="bg-white rounded-3xl border border-black/5 overflow-hidden">
            <div className="px-6 py-5 border-b border-black/5 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-charcoal">Payment Reconciliation</h2>
                <p className="text-sm text-charcoal/60 mt-0.5">Match bank statement entries to rent payment records</p>
              </div>
            </div>
            <ReconciliationPanel ownerId={user?.id ?? ''} onClose={() => setActiveTab('history')} />
          </div>
        )}
      </div>

      {/* Modals */}
      {showQRModal && (
        <UPIQRModal
          amount={rentAmount}
          tenantName={user?.name ?? 'Tenant'}
          landlordVpa={landlordVpa}
          onClose={() => setShowQRModal(false)}
          onPaid={handleQRPaid}
        />
      )}
      {showAutoPayModal && (
        <AutoPaySetupModal
          rentAmount={rentAmount}
          onClose={() => setShowAutoPayModal(false)}
          onSetup={handleAutoPaySetup}
        />
      )}
    </div>
  );
}

function formatMonthKey(date: Date): string {
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${months[date.getMonth()]} ${date.getFullYear()}`;
}
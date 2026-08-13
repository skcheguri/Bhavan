import { useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import { useRentPayment } from '@/hooks/useRentPayment';
import { useTenantRentalAgreements, agreementStatusMeta, getStampedAgreementUrl } from '@/hooks/useRentalAgreements';
import { useTenantRentReceipts } from '@/hooks/useRentReceipts';
import { buildRentalAgreementHtml } from '@/lib/documents/rentalAgreementDocument';
import { buildRentReceiptHtml } from '@/lib/documents/rentReceiptDocument';
import { viewDocument } from '@/lib/viewDocument';
import SignAgreementModal from '@/components/feature/SignAgreementModal';
import RequestsTab from './RequestsTab';

type SubTab = 'requests' | 'documents' | 'payments';

interface Props {
  initialSubTab?: SubTab;
}

export default function RentManagementTab({ initialSubTab }: Props) {
  const { addToast } = useToast();
  const { user } = useAuth();
  const [subTab, setSubTab] = useState<SubTab>(initialSubTab ?? 'requests');

  const { tenantPayments, mandates: userMandates, getMandateForTenant } = useRentPayment();
  const { agreements, loading: agreementsLoading, fetchError: agreementsError, refresh: refreshAgreements, sign: signAgreement } = useTenantRentalAgreements(user?.id);
  const [signAgreementId, setSignAgreementId] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const { receipts, loading: receiptsLoading, fetchError: receiptsError, refresh: refreshReceipts } = useTenantRentReceipts(user?.id);

  const myPayments = user?.id ? tenantPayments(user.id) : [];
  const myMandate = user?.id ? getMandateForTenant(user.id) : null;
  void userMandates;

  // The Rent Summary used to hardcode "Monthly Rent Rs.22,000" and a 5th-
  // of-the-month due date for everyone. Read the tenant's real agreement
  // (most recent) instead, and be honest when there isn't one.
  const activeAgreement = agreements[0] ?? null;
  const today = new Date();
  const rentDueDay = activeAgreement?.rentDueDay || 5;
  // 0 on the due day; correct across real month lengths (see rent-payment).
  const daysUntilRentDue = (() => {
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    let next = new Date(today.getFullYear(), today.getMonth(), rentDueDay);
    if (next.getTime() < start.getTime()) next = new Date(today.getFullYear(), today.getMonth() + 1, rentDueDay);
    return Math.round((next.getTime() - start.getTime()) / 86400000);
  })();
  const ordinal = (n: number) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
  };

  const subTabs: { id: SubTab; label: string; icon: string }[] = [
    { id: 'requests', label: 'Maintenance Requests', icon: 'ri-tools-line' },
    { id: 'documents', label: 'Documents', icon: 'ri-file-text-line' },
    { id: 'payments', label: 'Rent Payment', icon: 'ri-money-rupee-circle-line' },
  ];

  if (!user) return null;

  return (
    <div className="space-y-5">
      {/* Sub-tabs */}
      <div className="flex gap-1 bg-white rounded-xl border border-black/5 p-1.5 overflow-x-auto">
        {subTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSubTab(tab.id)}
            className={`flex items-center justify-center gap-2 px-5 py-3 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap flex-shrink-0 md:flex-1 ${
              subTab === tab.id ? 'bg-brand text-white' : 'text-charcoal/60 hover:text-charcoal hover:bg-lightgray'
            }`}
          >
            <i className={`${tab.icon} text-sm`} />
            {tab.label}
          </button>
        ))}
      </div>

      {subTab === 'requests' && <RequestsTab tenantId={user.id} />}

      {subTab === 'documents' && (
        <div className="space-y-6">
          {/* Rental Agreements */}
          <div>
            <h2 className="text-base font-bold text-charcoal mb-1">My Rental Agreements</h2>
            <p className="text-sm text-charcoal/60 mb-3">Sign and access your rental agreements</p>
            {agreementsLoading ? (
              <div className="bg-white rounded-3xl border border-black/5 p-10 text-center text-sm text-charcoal/40">Loading…</div>
            ) : agreementsError ? (
              <div className="bg-white rounded-3xl border border-red-100 p-10 text-center">
                <h3 className="text-base font-bold text-charcoal mb-2">Couldn't load your agreements</h3>
                <p className="text-sm text-charcoal/60 mb-4">Your agreements may exist but couldn't be shown right now.</p>
                <button onClick={() => refreshAgreements()} className="bg-charcoal text-white px-5 py-2 rounded-full text-xs font-medium hover:bg-black transition-colors cursor-pointer">Retry</button>
              </div>
            ) : agreements.length === 0 ? (
              <div className="bg-white rounded-3xl border border-black/5 p-10 text-center">
                <div className="w-14 h-14 flex items-center justify-center mx-auto mb-4 bg-amber-50 rounded-full">
                  <i className="ri-file-list-3-line text-2xl text-amber-500" />
                </div>
                <h3 className="text-base font-bold text-charcoal mb-2">No agreements yet</h3>
                <p className="text-sm text-charcoal/60">Agreements will appear here once your landlord shares them.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {agreements.map((a) => {
                  const meta = agreementStatusMeta(a.agreementStatus);
                  return (
                  <div key={a.id} className="bg-white rounded-2xl border border-black/5 p-4 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-charcoal truncate">{a.agreementNumber}</p>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${meta.cls}`}>{meta.label}</span>
                      </div>
                      <p className="text-xs text-charcoal/60 mt-0.5">{a.propertyAddress}</p>
                      <p className="text-xs text-charcoal/40 mt-0.5">{a.leaseStartDate} to {a.leaseEndDate} · ₹{a.monthlyRent.toLocaleString('en-IN')}/mo</p>
                    </div>
                    <div className="flex-shrink-0 flex items-center gap-2 flex-wrap justify-end">
                      {a.agreementStatus === 'draft' && !a.signedByTenant && (
                        <button
                          onClick={() => setSignAgreementId(a.id)}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-brand/30 text-xs font-medium text-brand hover:bg-brand/5 transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <i className="ri-quill-pen-line text-xs" /> Sign
                        </button>
                      )}
                      {a.stampedDocumentPath && a.agreementStatus === 'completed' && (
                        <button
                          onClick={async () => { const url = await getStampedAgreementUrl(a.stampedDocumentPath!); if (url) window.open(url, '_blank'); else addToast('Could not open the stamped document.', 'error'); }}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-200 text-xs font-medium text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <i className="ri-file-download-line text-xs" /> Stamped
                        </button>
                      )}
                      <button
                        onClick={async () => { const e = await viewDocument(buildRentalAgreementHtml(a), `Rental agreement ${a.agreementNumber}`); if (e) addToast(e, 'error'); }}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-black/10 text-xs font-medium text-charcoal hover:border-brand/40 hover:text-brand transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <i className="ri-eye-line text-xs" /> View
                      </button>
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Rent Receipts */}
          <div>
            <h2 className="text-base font-bold text-charcoal mb-1">Rent Receipts</h2>
            <p className="text-sm text-charcoal/60 mb-3">Receipts generated by your landlord</p>
            {receiptsLoading ? (
              <div className="bg-white rounded-3xl border border-black/5 p-10 text-center text-sm text-charcoal/40">Loading…</div>
            ) : receiptsError ? (
              <div className="bg-white rounded-3xl border border-red-100 p-10 text-center">
                <h3 className="text-base font-bold text-charcoal mb-2">Couldn't load your receipts</h3>
                <p className="text-sm text-charcoal/60 mb-4">Your receipts may exist but couldn't be shown right now.</p>
                <button onClick={() => refreshReceipts()} className="bg-charcoal text-white px-5 py-2 rounded-full text-xs font-medium hover:bg-black transition-colors cursor-pointer">Retry</button>
              </div>
            ) : receipts.length === 0 ? (
              <div className="bg-white rounded-3xl border border-black/5 p-10 text-center">
                <div className="w-14 h-14 flex items-center justify-center mx-auto mb-4 bg-green-50 rounded-full">
                  <i className="ri-receipt-line text-2xl text-green-500" />
                </div>
                <h3 className="text-base font-bold text-charcoal mb-2">No receipts yet</h3>
                <p className="text-sm text-charcoal/60">Receipts will appear here once generated.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {receipts.map((r) => (
                  <div key={r.id} className="bg-white rounded-2xl border border-black/5 p-4 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-charcoal truncate">{r.receiptNumber}</p>
                      <p className="text-xs text-charcoal/60 mt-0.5">{r.periodFrom} to {r.periodTo}</p>
                      <p className="text-xs text-charcoal/40 mt-0.5">₹{r.rentAmount.toLocaleString('en-IN')}</p>
                    </div>
                    <button
                      onClick={async () => { const e = await viewDocument(buildRentReceiptHtml(r), `Rent receipt ${r.receiptNumber}`); if (e) addToast(e, 'error'); }}
                      className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg border border-black/10 text-xs font-medium text-charcoal hover:border-brand/40 hover:text-brand transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <i className="ri-eye-line text-xs" /> View
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tax & Legal Forms */}
          <div>
            <h2 className="text-base font-bold text-charcoal mb-1">Tax &amp; Legal Forms</h2>
            <p className="text-sm text-charcoal/60 mb-3">Documents for your tax filing and legal compliance</p>
            <div className="bg-white rounded-3xl border border-black/5 p-10 text-center">
              <div className="w-14 h-14 flex items-center justify-center mx-auto mb-4 bg-teal-50 rounded-full">
                <i className="ri-government-line text-2xl text-teal-500" />
              </div>
              <h3 className="text-base font-bold text-charcoal mb-2">Generate tax and legal forms</h3>
              <p className="text-sm text-charcoal/60 mb-5">Use your rent receipts to prepare HRA and tax filing documents.</p>
              <Link to="/tax-forms" className="bg-teal-600 text-white px-6 py-2.5 rounded-full text-sm font-medium hover:bg-teal-700 transition-colors whitespace-nowrap">
                Generate Documents
              </Link>
            </div>
          </div>
        </div>
      )}

      {subTab === 'payments' && (
        <div className="space-y-6">
          {/* Rent Due Card */}
          <div className="bg-white rounded-3xl border border-black/5 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold text-charcoal flex items-center gap-2">
                <i className="ri-money-rupee-circle-line text-brand" />
                Rent Summary
              </h2>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${daysUntilRentDue <= 3 ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                {daysUntilRentDue <= 3 ? 'Due Soon' : 'On Track'}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-offwhite rounded-xl p-4">
                <p className="text-xs text-charcoal/40 font-medium">Monthly Rent</p>
                <p className="text-xl font-bold text-charcoal mt-1">
                  {activeAgreement ? `₹${activeAgreement.monthlyRent.toLocaleString('en-IN')}` : 'Not set'}
                </p>
                <p className="text-xs text-charcoal/60 mt-0.5">
                  {activeAgreement ? `Due on the ${ordinal(rentDueDay)} of every month` : 'No active rental agreement'}
                </p>
              </div>
              <div className="bg-offwhite rounded-xl p-4">
                <p className="text-xs text-charcoal/40 font-medium">Days Until Due</p>
                <p className="text-xl font-bold text-charcoal mt-1">{activeAgreement ? `${daysUntilRentDue} days` : '—'}</p>
              </div>
              <div className="bg-offwhite rounded-xl p-4">
                <p className="text-xs text-charcoal/40 font-medium">Current Flat</p>
                <p className="text-xl font-bold text-charcoal mt-1">{user.currentFlat || 'Not set'}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 mt-5">
              <Link to="/rent-payment" className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-dark transition-colors whitespace-nowrap">
                <i className="ri-qr-code-line" /> Pay Rent Now
              </Link>
              <Link to="/rent-payment?tab=autopay" className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-black/10 text-sm font-medium text-charcoal hover:border-brand/40 hover:text-brand transition-colors whitespace-nowrap">
                <i className="ri-refresh-line" /> Setup AutoPay
              </Link>
            </div>
          </div>

          {/* UPI AutoPay Status */}
          <div className="bg-white rounded-3xl border border-black/5 p-6">
            <h2 className="text-base font-bold text-charcoal mb-4 flex items-center gap-2">
              <i className="ri-refresh-line text-brand" />
              UPI AutoPay
            </h2>
            {myMandate ? (
              <div className="flex items-center justify-between p-4 bg-offwhite rounded-xl">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 flex items-center justify-center rounded-lg ${myMandate.status === 'active' ? 'bg-green-50' : 'bg-amber-50'}`}>
                    <i className={`ri-smartphone-line text-lg ${myMandate.status === 'active' ? 'text-green-600' : 'text-amber-600'}`} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-charcoal">{myMandate.upi_id}</p>
                    <p className="text-xs text-charcoal/60">{myMandate.bank_account}</p>
                  </div>
                </div>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${myMandate.status === 'active' ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600'}`}>
                  {myMandate.status === 'active' ? 'Active' : 'Paused'}
                </span>
              </div>
            ) : (
              <div className="text-center py-6 bg-offwhite rounded-xl">
                <div className="w-12 h-12 flex items-center justify-center mx-auto mb-3 bg-lightgray rounded-full">
                  <i className="ri-refresh-line text-xl text-charcoal/40" />
                </div>
                <p className="text-sm font-semibold text-charcoal mb-1">No AutoPay setup</p>
                <p className="text-xs text-charcoal/60 mb-4">Enable UPI AutoPay to pay rent automatically every month</p>
                <Link to="/rent-payment?tab=autopay" className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-brand text-white text-sm font-medium hover:bg-brand-dark transition-colors whitespace-nowrap">
                  <i className="ri-add-line" /> Setup AutoPay
                </Link>
              </div>
            )}
          </div>

          {/* Payment History */}
          <div className="bg-white rounded-3xl border border-black/5 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-charcoal flex items-center gap-2">
                <i className="ri-history-line text-brand" />
                Payment History
              </h2>
              <Link to="/rent-payment?tab=history" className="text-xs font-semibold text-brand hover:text-brand-dark transition-colors whitespace-nowrap flex items-center gap-1">
                View All <i className="ri-arrow-right-line" />
              </Link>
            </div>
            {myPayments.length > 0 ? (
              <div className="space-y-2">
                {myPayments.slice(0, 5).map((payment) => (
                  <div key={payment.id} className="flex items-center justify-between p-3.5 bg-offwhite rounded-xl hover:bg-brand/5 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 flex items-center justify-center rounded-lg ${
                        payment.status === 'paid' ? 'bg-green-50' :
                        payment.status === 'failed' ? 'bg-red-50' :
                        payment.status === 'reconciled' ? 'bg-blue-50' :
                        'bg-amber-50'
                      }`}>
                        <i className={`${
                          payment.payment_mode === 'upi_autopay' ? 'ri-refresh-line' :
                          payment.payment_mode === 'razorpay' ? 'ri-secure-payment-line' :
                          'ri-hand-coin-line'
                        } text-sm ${
                          payment.status === 'paid' ? 'text-green-600' :
                          payment.status === 'failed' ? 'text-red-600' :
                          payment.status === 'reconciled' ? 'text-blue-600' :
                          'text-amber-600'
                        }`} />
                      </div>
                      <div>
                        {/* amount is stored in paise (see
                            create-rent-payment-order and the cash logger,
                            both x100) -- render in rupees. */}
                        <p className="text-sm font-semibold text-charcoal">₹{(payment.amount / 100).toLocaleString('en-IN')}</p>
                        <p className="text-xs text-charcoal/60">
                          {new Date(payment.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          {' · '}
                          {payment.payment_mode === 'upi_autopay' ? 'UPI AutoPay' :
                           payment.payment_mode === 'razorpay' ? 'Online Payment' :
                           'Cash'}
                        </p>
                      </div>
                    </div>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      payment.status === 'paid' ? 'bg-green-50 text-green-600' :
                      payment.status === 'failed' ? 'bg-red-50 text-red-600' :
                      payment.status === 'reconciled' ? 'bg-blue-50 text-blue-600' :
                      'bg-amber-50 text-amber-600'
                    }`}>
                      {payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-10 bg-offwhite rounded-xl">
                <div className="w-14 h-14 flex items-center justify-center mx-auto mb-4 bg-lightgray rounded-full">
                  <i className="ri-history-line text-2xl text-charcoal/40" />
                </div>
                <p className="text-sm text-charcoal/60">No payment history yet.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {signAgreementId && (
        <SignAgreementModal
          agreementNumber={agreements.find((a) => a.id === signAgreementId)?.agreementNumber ?? ''}
          defaultName={agreements.find((a) => a.id === signAgreementId)?.tenantName}
          party="tenant"
          busy={signing}
          onSign={async (name) => {
            setSigning(true);
            const { error } = await signAgreement(signAgreementId, name);
            setSigning(false);
            if (error) { addToast(error, 'error'); return; }
            addToast('You signed the agreement.', 'success');
            setSignAgreementId(null);
          }}
          onClose={() => setSignAgreementId(null)}
        />
      )}
    </div>
  );
}

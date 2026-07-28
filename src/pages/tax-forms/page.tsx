import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useTenantRentReceipts } from '@/hooks/useRentReceipts';
import { useTenantRentalAgreements, useRentalAgreements } from '@/hooks/useRentalAgreements';
import { tenantTaxDocuments } from '@/content/tenant-tax-documents';

/* ───────────── Owner Types ───────────── */
interface PropertyIncome {
  id: string;
  propertyName: string;
  address: string;
  tenantName: string;
  tenantPan: string;
  annualRent: string;
  municipalTaxes: string;
  interestOnLoan: string;
  coOwned: boolean;
  ownershipShare: string;
}

const ownerInitialProperties: PropertyIncome[] = [];

/* ───────────── Helpers ───────────── */
function formatCurrency(value: string | number): string {
  const num = typeof value === 'number' ? value : parseFloat(value || '0');
  if (isNaN(num)) return '\u20b90';
  return `\u20b9${num.toLocaleString('en-IN')}`;
}
function parseNum(value: string): number {
  return parseFloat(value || '0') || 0;
}

/* ════════════════════════════════════ */
/*  OWNER VIEW                          */
/* ════════════════════════════════════ */
function OwnerTaxView({ userName }: { userName: string }) {
  const { user } = useAuth();
  const { agreements: ownerAgreements } = useRentalAgreements(user?.id);
  const ownerPan = ownerAgreements.find((a) => a.landlordPan)?.landlordPan || '';
  const [activeTab, setActiveTab] = useState<'schedule-hp' | 'summary' | 'filing'>('schedule-hp');
  const [properties, setProperties] = useState<PropertyIncome[]>(ownerInitialProperties);
  const [selectedYear, setSelectedYear] = useState('2025-26');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const [newProp, setNewProp] = useState<Partial<PropertyIncome>>({
    coOwned: false,
    ownershipShare: '100',
  });

  const handlePropertyChange = (id: string, field: keyof PropertyIncome, value: string | boolean) => {
    setProperties((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
  };

  const handleAddProperty = () => {
    if (!newProp.propertyName || !newProp.annualRent) return;
    const prop: PropertyIncome = {
      id: `prop-${Date.now()}`,
      propertyName: newProp.propertyName || '',
      address: newProp.address || '',
      tenantName: newProp.tenantName || '',
      tenantPan: newProp.tenantPan || '',
      annualRent: newProp.annualRent || '0',
      municipalTaxes: newProp.municipalTaxes || '0',
      interestOnLoan: newProp.interestOnLoan || '0',
      coOwned: newProp.coOwned || false,
      ownershipShare: newProp.ownershipShare || '100',
    };
    setProperties((prev) => [...prev, prop]);
    setNewProp({ coOwned: false, ownershipShare: '100' });
    setShowAddModal(false);
  };

  const handleRemoveProperty = (id: string) => {
    setProperties((prev) => prev.filter((p) => p.id !== id));
  };

  const handleSaveDraft = () => {
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  };

  const computations = properties.map((p) => {
    const grossRent = parseNum(p.annualRent);
    const municipalTaxes = parseNum(p.municipalTaxes);
    const netAnnualValue = Math.max(0, grossRent - municipalTaxes);
    const standardDeduction = netAnnualValue * 0.30;
    const interestOnLoan = parseNum(p.interestOnLoan);
    const incomeFromHouse = netAnnualValue - standardDeduction - interestOnLoan;
    const share = parseNum(p.ownershipShare) / 100;
    const shareOfIncome = incomeFromHouse * share;
    return { ...p, grossRent, municipalTaxes, netAnnualValue, standardDeduction, interestOnLoan, incomeFromHouse, shareOfIncome };
  });

  const totalIncome = computations.reduce((sum, c) => sum + c.shareOfIncome, 0);
  const totalGrossRent = computations.reduce((sum, c) => sum + c.grossRent, 0);
  const totalMunicipalTaxes = computations.reduce((sum, c) => sum + c.municipalTaxes, 0);
  const totalNetAnnualValue = computations.reduce((sum, c) => sum + c.netAnnualValue, 0);
  const totalStandardDeduction = computations.reduce((sum, c) => sum + c.standardDeduction, 0);
  const totalInterestOnLoan = computations.reduce((sum, c) => sum + c.interestOnLoan, 0);

  const taxableIncome = Math.max(0, totalIncome);
  let taxLiability = 0;
  if (taxableIncome > 300000) {
    const slabs = [
      { limit: 300000, rate: 0 },
      { limit: 700000, rate: 0.05 },
      { limit: 1000000, rate: 0.10 },
      { limit: 1200000, rate: 0.15 },
      { limit: 1500000, rate: 0.20 },
      { limit: Infinity, rate: 0.30 },
    ];
    let remaining = taxableIncome;
    let prevLimit = 0;
    for (const slab of slabs) {
      const taxableInSlab = Math.min(remaining, slab.limit - prevLimit);
      if (taxableInSlab <= 0) break;
      taxLiability += taxableInSlab * slab.rate;
      remaining -= taxableInSlab;
      prevLimit = slab.limit;
    }
  }
  const cess = taxLiability * 0.04;
  const totalTax = taxLiability + cess;

  const tabs = [
    { id: 'schedule-hp' as const, label: 'Schedule HP', icon: 'ri-home-4-line' },
    { id: 'summary' as const, label: 'Tax Summary', icon: 'ri-calculator-line' },
    { id: 'filing' as const, label: 'Filing Guide', icon: 'ri-file-list-3-line' },
  ];

  return (
    <>
      {showSuccess && (
        <div className="fixed top-24 right-6 z-50 bg-green-600 text-white px-5 py-3 rounded-xl text-sm font-medium flex items-center gap-2">
          <i className="ri-check-line" /> Draft saved successfully
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Link to="/owner-profile" className="text-sm text-charcoal/40 hover:text-brand transition-colors cursor-pointer">Owner Profile</Link>
          <i className="ri-arrow-right-s-line text-charcoal/30" />
          <span className="text-sm text-charcoal font-medium">Tax Forms</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-charcoal">Income Tax Return</h1>
            <p className="text-sm text-charcoal/60 mt-1">Schedule HP — Income from House Property (ITR-2)</p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="border border-black/10 rounded-xl px-4 py-2.5 text-sm text-charcoal focus:outline-none focus:border-amber-400 cursor-pointer bg-white"
            >
              <option value="2025-26">FY 2025-26 (AY 2026-27)</option>
              <option value="2024-25">FY 2024-25 (AY 2025-26)</option>
              <option value="2023-24">FY 2023-24 (AY 2024-25)</option>
            </select>
            <button onClick={handleSaveDraft} className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 transition-colors cursor-pointer whitespace-nowrap">
              <i className="ri-save-line text-sm" /> Save Draft
            </button>
          </div>
        </div>
      </div>

      {/* Assessee Info */}
      <div className="bg-white rounded-3xl border border-black/5 p-5 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-amber-50">
            <i className="ri-user-line text-lg text-amber-600" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-charcoal">Assessee Details</h2>
            <p className="text-xs text-charcoal/40">Pre-filled from your profile</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Name', value: userName },
            { label: 'PAN', value: ownerPan || 'Not added' },
            { label: 'Aadhaar', value: user?.aadhaarLast4 ? `XXXX XXXX ${user.aadhaarLast4}` : 'Not verified' },
            { label: 'Status', value: 'Individual' },
          ].map((field) => (
            <div key={field.label} className="bg-offwhite rounded-xl p-3">
              <p className="text-[10px] text-charcoal/40 font-semibold uppercase tracking-wide">{field.label}</p>
              <p className="text-sm font-semibold text-charcoal mt-1">{field.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white rounded-xl border border-black/5 p-1 mb-6 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`relative flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap flex-shrink-0 ${
              activeTab === tab.id ? 'bg-amber-500 text-white' : 'text-charcoal/60 hover:text-charcoal hover:bg-lightgray'
            }`}
          >
            <i className={`${tab.icon} text-sm`} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Schedule HP */}
      {activeTab === 'schedule-hp' && (
        <div className="space-y-6">
          {properties.length === 0 && (
            <div className="bg-white rounded-3xl border border-dashed border-black/10 p-8 text-center">
              <i className="ri-building-line text-2xl text-charcoal/30" />
              <p className="text-sm font-medium text-charcoal mt-2">No properties added yet</p>
              <p className="text-xs text-charcoal/50 mt-1">Add a rental property to calculate your Income from House Property.</p>
            </div>
          )}
          {computations.map((prop, index) => (
            <div key={prop.id} className="bg-white rounded-3xl border border-black/5 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-amber-50">
                    <span className="text-sm font-bold text-amber-600">{index + 1}</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-charcoal">{prop.propertyName}</h3>
                    <p className="text-xs text-charcoal/40 mt-0.5">{prop.address}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleRemoveProperty(prop.id)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                  title="Remove property"
                >
                  <i className="ri-delete-bin-line text-sm text-red-400" />
                </button>
              </div>
              <div className="p-5 space-y-5">
                <div>
                  <h4 className="text-xs font-semibold text-charcoal/40 uppercase tracking-wide mb-3">Tenant Information</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-charcoal/60 mb-1.5">Tenant Name</label>
                      <input
                        value={prop.tenantName}
                        onChange={(e) => handlePropertyChange(prop.id, 'tenantName', e.target.value)}
                        className="w-full px-4 py-2.5 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                        placeholder="Enter tenant name"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-charcoal/60 mb-1.5">Tenant PAN (if available)</label>
                      <input
                        value={prop.tenantPan}
                        onChange={(e) => handlePropertyChange(prop.id, 'tenantPan', e.target.value.toUpperCase())}
                        className="w-full px-4 py-2.5 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 uppercase"
                        placeholder="ABCDE1234F"
                        maxLength={10}
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-charcoal/40 uppercase tracking-wide mb-3">Income &amp; Deductions</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[
                      { label: 'Annual Rent Received (\u20b9)', field: 'annualRent', value: prop.annualRent },
                      { label: 'Municipal Taxes Paid (\u20b9)', field: 'municipalTaxes', value: prop.municipalTaxes },
                      { label: 'Interest on Housing Loan (\u20b9)', field: 'interestOnLoan', value: prop.interestOnLoan },
                    ].map((f) => (
                      <div key={f.field}>
                        <label className="block text-xs text-charcoal/60 mb-1.5">{f.label}</label>
                        <input
                          type="number"
                          value={f.value}
                          onChange={(e) => handlePropertyChange(prop.id, f.field as keyof PropertyIncome, e.target.value)}
                          className="w-full px-4 py-2.5 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                          placeholder="0"
                        />
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={prop.coOwned}
                      onChange={(e) => handlePropertyChange(prop.id, 'coOwned', e.target.checked)}
                      className="w-4 h-4 rounded border-black/15 text-amber-500 focus:ring-amber-400 cursor-pointer"
                    />
                    <span className="text-sm text-charcoal font-medium">Co-owned Property</span>
                  </label>
                  {prop.coOwned && (
                    <div className="sm:w-1/3 mt-3">
                      <label className="block text-xs text-charcoal/60 mb-1.5">Your Ownership Share (%)</label>
                      <input
                        type="number"
                        value={prop.ownershipShare}
                        onChange={(e) => handlePropertyChange(prop.id, 'ownershipShare', e.target.value)}
                        className="w-full px-4 py-2.5 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                        placeholder="50"
                        min="1"
                        max="100"
                      />
                    </div>
                  )}
                </div>
                <div className="bg-offwhite rounded-xl p-4">
                  <h4 className="text-xs font-semibold text-charcoal/40 uppercase tracking-wide mb-3">Computed Income</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: 'Gross Annual Value', value: formatCurrency(String(prop.grossRent)) },
                      { label: 'Less: Municipal Taxes', value: `-${formatCurrency(String(prop.municipalTaxes))}` },
                      { label: 'Net Annual Value', value: formatCurrency(String(prop.netAnnualValue)) },
                      { label: 'Less: Std Deduction (30%)', value: `-${formatCurrency(String(Math.round(prop.standardDeduction)))}` },
                    ].map((item) => (
                      <div key={item.label} className="text-center">
                        <p className="text-[10px] text-charcoal/40 font-medium">{item.label}</p>
                        <p className="text-sm font-semibold text-charcoal mt-1">{item.value}</p>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3 pt-3 border-t border-black/10">
                    {[
                      { label: 'Less: Interest on Loan', value: `-${formatCurrency(String(prop.interestOnLoan))}` },
                      { label: 'Income from House Property', value: formatCurrency(String(Math.round(prop.incomeFromHouse))) },
                      { label: 'Your Share of Income', value: formatCurrency(String(Math.round(prop.shareOfIncome))), bold: true },
                    ].map((item) => (
                      <div key={item.label} className="text-center">
                        <p className="text-[10px] text-charcoal/40 font-medium">{item.label}</p>
                        <p className={`text-sm font-semibold mt-1 ${item.bold ? 'text-amber-600' : 'text-charcoal'}`}>{item.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
          <button
            onClick={() => setShowAddModal(true)}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl border-2 border-dashed border-black/10 text-charcoal/40 hover:border-amber-300 hover:text-amber-600 transition-colors cursor-pointer"
          >
            <i className="ri-add-line text-lg" />
            <span className="text-sm font-medium">Add Another Property</span>
          </button>
          <div className="bg-white rounded-3xl border border-black/5 p-5">
            <h3 className="text-sm font-bold text-charcoal mb-4 flex items-center gap-2">
              <div className="w-6 h-6 flex items-center justify-center">
                <i className="ri-calculator-line text-amber-600" />
              </div>
              Total Income from House Property
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: 'Total Gross Rent', value: formatCurrency(String(totalGrossRent)) },
                { label: 'Total Municipal Taxes', value: `-${formatCurrency(String(totalMunicipalTaxes))}` },
                { label: 'Total Net Annual Value', value: formatCurrency(String(totalNetAnnualValue)) },
                { label: 'Total Std Deduction', value: `-${formatCurrency(String(Math.round(totalStandardDeduction)))}` },
                { label: 'Total Interest on Loan', value: `-${formatCurrency(String(totalInterestOnLoan))}` },
                { label: 'Net HP Income', value: formatCurrency(String(Math.round(totalIncome))), bold: true },
              ].map((item) => (
                <div key={item.label} className="bg-offwhite rounded-xl p-3 text-center">
                  <p className="text-[10px] text-charcoal/40 font-medium">{item.label}</p>
                  <p className={`text-sm font-bold mt-1 ${item.bold ? 'text-amber-600' : 'text-charcoal'}`}>{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Summary */}
      {activeTab === 'summary' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl border border-black/5 p-6">
            <h2 className="text-base font-bold text-charcoal mb-5 flex items-center gap-2">
              <div className="w-6 h-6 flex items-center justify-center">
                <i className="ri-pie-chart-line text-amber-600" />
              </div>
              Tax Computation Summary
            </h2>
            <div className="space-y-4">
              <div className="bg-offwhite rounded-xl p-4">
                <h3 className="text-xs font-semibold text-charcoal/40 uppercase tracking-wide mb-3">Income Breakdown</h3>
                <div className="space-y-2">
                  {[
                    { label: 'Income from House Property (Schedule HP)', value: totalIncome },
                    { label: 'Income from Salary', value: 0 },
                    { label: 'Income from Business/Profession', value: 0 },
                    { label: 'Income from Capital Gains', value: 0 },
                    { label: 'Income from Other Sources', value: 0 },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between py-1.5">
                      <span className="text-sm text-charcoal">{item.label}</span>
                      <span className="text-sm font-semibold text-charcoal">{formatCurrency(Math.round(item.value))}</span>
                    </div>
                  ))}
                  <div className="border-t border-black/10 pt-2 flex items-center justify-between">
                    <span className="text-sm font-bold text-charcoal">Gross Total Income</span>
                    <span className="text-sm font-bold text-charcoal">{formatCurrency(Math.round(totalIncome))}</span>
                  </div>
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                <h3 className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-3">Tax Calculation (New Regime)</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between py-1.5">
                    <span className="text-sm text-charcoal">Gross Total Income</span>
                    <span className="text-sm font-semibold text-charcoal">{formatCurrency(Math.round(totalIncome))}</span>
                  </div>
                  <div className="flex items-center justify-between py-1.5">
                    <span className="text-sm text-charcoal">Less: Total Deductions</span>
                    <span className="text-sm font-semibold text-charcoal">-{formatCurrency(0)}</span>
                  </div>
                  <div className="border-t border-amber-200 pt-2 flex items-center justify-between">
                    <span className="text-sm font-bold text-charcoal">Taxable Income</span>
                    <span className="text-sm font-bold text-charcoal">{formatCurrency(Math.round(taxableIncome))}</span>
                  </div>
                  <div className="flex items-center justify-between py-1.5">
                    <span className="text-sm text-charcoal">Tax on Total Income</span>
                    <span className="text-sm font-semibold text-charcoal">{formatCurrency(Math.round(taxLiability))}</span>
                  </div>
                  <div className="flex items-center justify-between py-1.5">
                    <span className="text-sm text-charcoal">Add: Health &amp; Education Cess (4%)</span>
                    <span className="text-sm font-semibold text-charcoal">{formatCurrency(Math.round(cess))}</span>
                  </div>
                  <div className="border-t border-amber-200 pt-2 flex items-center justify-between">
                    <span className="text-base font-bold text-charcoal">Total Tax Liability</span>
                    <span className="text-base font-bold text-amber-600">{formatCurrency(Math.round(totalTax))}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filing Guide */}
      {activeTab === 'filing' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl border border-black/5 p-6">
            <h2 className="text-base font-bold text-charcoal mb-5 flex items-center gap-2">
              <div className="w-6 h-6 flex items-center justify-center">
                <i className="ri-file-list-3-line text-amber-600" />
              </div>
              ITR-2 Filing Guide for Landlords
            </h2>
            <div className="space-y-5">
              {[
                { step: 1, title: 'Determine the Correct ITR Form', desc: 'Use ITR-2 if you have income from house property along with salary, capital gains, or other sources. ITR-1 is only for salaried individuals with income up to \u20b950 lakh and one house property.', icon: 'ri-file-text-line' },
                { step: 2, title: 'Gather Required Documents', desc: 'Keep ready: PAN card, Aadhaar, rent agreements, rent receipts, municipal tax receipts, home loan interest certificate, TDS certificates (Form 16A), and bank statements.', icon: 'ri-folder-open-line' },
                { step: 3, title: 'Fill Schedule HP (House Property)', desc: 'Report gross rent received, deduct municipal taxes paid to arrive at Net Annual Value (NAV). From NAV, deduct 30% standard deduction and interest on housing loan to compute income/loss from house property.', icon: 'ri-home-4-line' },
                { step: 4, title: 'Report Co-owned Properties', desc: 'If the property is co-owned, report only your share of income. Each co-owner must file separately mentioning their ownership percentage.', icon: 'ri-group-line' },
                { step: 5, title: 'Claim Deductions under Chapter VI-A', desc: 'Under the old tax regime, claim deductions like 80C (\u20b91.5L limit), 80D (health insurance), 80G (donations). Under the new regime, most deductions are not available.', icon: 'ri-scissors-cut-line' },
                { step: 6, title: 'Verify and Submit', desc: 'E-verify using Aadhaar OTP, net banking, or DSC within 30 days of filing. Alternatively, send signed ITR-V to CPC Bangalore by post.', icon: 'ri-checkbox-circle-line' },
              ].map((item) => (
                <div key={item.step} className="flex items-start gap-4">
                  <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-amber-50 flex-shrink-0">
                    <span className="text-sm font-bold text-amber-600">{item.step}</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-charcoal flex items-center gap-2">
                      <i className={`${item.icon} text-amber-600`} />
                      {item.title}
                    </h3>
                    <p className="text-xs text-charcoal/60 mt-1 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Add Property Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-black/5 flex items-center justify-between">
              <h3 className="text-base font-bold text-charcoal">Add Property for Tax Filing</h3>
              <button onClick={() => setShowAddModal(false)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-lightgray transition-colors cursor-pointer">
                <i className="ri-close-line text-charcoal/40" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-charcoal/60 mb-1.5 uppercase tracking-wide">Property Name</label>
                <input value={newProp.propertyName || ''} onChange={(e) => setNewProp((p) => ({ ...p, propertyName: e.target.value }))} className="w-full px-4 py-2.5 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" placeholder="e.g., Sunshine Apartments - 3BHK" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-charcoal/60 mb-1.5 uppercase tracking-wide">Address</label>
                <input value={newProp.address || ''} onChange={(e) => setNewProp((p) => ({ ...p, address: e.target.value }))} className="w-full px-4 py-2.5 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" placeholder="Full address with PIN code" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-charcoal/60 mb-1.5 uppercase tracking-wide">Tenant Name</label>
                  <input value={newProp.tenantName || ''} onChange={(e) => setNewProp((p) => ({ ...p, tenantName: e.target.value }))} className="w-full px-4 py-2.5 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" placeholder="Tenant name" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-charcoal/60 mb-1.5 uppercase tracking-wide">Tenant PAN</label>
                  <input value={newProp.tenantPan || ''} onChange={(e) => setNewProp((p) => ({ ...p, tenantPan: e.target.value.toUpperCase() }))} className="w-full px-4 py-2.5 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300 uppercase" placeholder="ABCDE1234F" maxLength={10} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-charcoal/60 mb-1.5 uppercase tracking-wide">Annual Rent (\u20b9)</label>
                  <input type="number" value={newProp.annualRent || ''} onChange={(e) => setNewProp((p) => ({ ...p, annualRent: e.target.value }))} className="w-full px-4 py-2.5 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" placeholder="0" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-charcoal/60 mb-1.5 uppercase tracking-wide">Municipal Taxes (\u20b9)</label>
                  <input type="number" value={newProp.municipalTaxes || ''} onChange={(e) => setNewProp((p) => ({ ...p, municipalTaxes: e.target.value }))} className="w-full px-4 py-2.5 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" placeholder="0" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-charcoal/60 mb-1.5 uppercase tracking-wide">Interest on Housing Loan (\u20b9)</label>
                <input type="number" value={newProp.interestOnLoan || ''} onChange={(e) => setNewProp((p) => ({ ...p, interestOnLoan: e.target.value }))} className="w-full px-4 py-2.5 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" placeholder="0" />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={newProp.coOwned || false} onChange={(e) => setNewProp((p) => ({ ...p, coOwned: e.target.checked }))} className="w-4 h-4 rounded border-black/15 text-amber-500 focus:ring-amber-400 cursor-pointer" />
                <span className="text-sm text-charcoal font-medium">Co-owned Property</span>
              </label>
              {newProp.coOwned && (
                <div>
                  <label className="block text-xs font-semibold text-charcoal/60 mb-1.5 uppercase tracking-wide">Ownership Share (%)</label>
                  <input type="number" value={newProp.ownershipShare || ''} onChange={(e) => setNewProp((p) => ({ ...p, ownershipShare: e.target.value }))} className="w-full px-4 py-2.5 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" placeholder="50" min="1" max="100" />
                </div>
              )}
            </div>
            <div className="p-5 border-t border-black/5 flex items-center justify-end gap-3">
              <button onClick={() => setShowAddModal(false)} className="px-5 py-2.5 rounded-full border border-black/10 text-sm font-medium text-charcoal/60 hover:bg-lightgray transition-colors cursor-pointer whitespace-nowrap">Cancel</button>
              <button onClick={handleAddProperty} className="px-5 py-2.5 rounded-full bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 transition-colors cursor-pointer whitespace-nowrap">Add Property</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ════════════════════════════════════ */
/*  TENANT VIEW                         */
/* ════════════════════════════════════ */
function TenantTaxView({ userName }: { userName: string }) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'hra' | 'summary' | 'forms' | 'guide'>('hra');
  const [hraResult, setHraResult] = useState<{ exempt: number; taxable: number } | null>(null);
  const [hraInputs, setHraInputs] = useState({ basicSalary: '60000', hraReceived: '15000', rentPaid: '22000', cityType: 'metro' });

  const { agreements: tenantAgreements } = useTenantRentalAgreements(user?.id);
  const { receipts: tenantReceipts } = useTenantRentReceipts(user?.id);
  const agreement = tenantAgreements[0];
  const yearlyRent = tenantReceipts.reduce((sum, r) => sum + r.rentAmount, 0);

  const calculateHRA = () => {
    const basic = parseNum(hraInputs.basicSalary);
    const hra = parseNum(hraInputs.hraReceived);
    const rent = parseNum(hraInputs.rentPaid);
    const isMetro = hraInputs.cityType === 'metro';

    const a = hra;
    const b = rent - basic * 0.1;
    const c = basic * (isMetro ? 0.5 : 0.4);

    const exempt = Math.max(0, Math.min(a, b, c));
    setHraResult({ exempt: Math.round(exempt), taxable: Math.round(hra - exempt) });
  };

  const tabs = [
    { id: 'hra' as const, label: 'HRA Calculator', icon: 'ri-home-4-line' },
    { id: 'summary' as const, label: 'Rent Summary', icon: 'ri-file-list-3-line' },
    { id: 'forms' as const, label: 'Tax Forms', icon: 'ri-government-line' },
    { id: 'guide' as const, label: 'Filing Guide', icon: 'ri-book-open-line' },
  ];

  return (
    <>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Link to="/tenant-profile" className="text-sm text-charcoal/40 hover:text-brand transition-colors cursor-pointer">My Dashboard</Link>
          <i className="ri-arrow-right-s-line text-charcoal/30" />
          <span className="text-sm text-charcoal font-medium">Tax &amp; Legal Forms</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-charcoal">Tax Documents</h1>
            <p className="text-sm text-charcoal/60 mt-1">HRA, rent receipts &amp; ITR filing tools for tenants</p>
          </div>
        </div>
      </div>

      {/* Assessee Info */}
      <div className="bg-white rounded-3xl border border-black/5 p-5 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-brand/10">
            <i className="ri-user-line text-lg text-brand" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-charcoal">Tenant Details</h2>
            <p className="text-xs text-charcoal/40">Pre-filled from your profile</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Name', value: userName },
            { label: 'PAN', value: agreement?.tenantPan || '—' },
            { label: 'Aadhaar', value: agreement?.tenantAadhaarMasked || (user?.aadhaarLast4 ? `XXXX-XXXX-${user.aadhaarLast4}` : '—') },
            { label: 'Landlord PAN', value: agreement?.landlordPan || '—' },
          ].map((field) => (
            <div key={field.label} className="bg-offwhite rounded-xl p-3">
              <p className="text-[10px] text-charcoal/40 font-semibold uppercase tracking-wide">{field.label}</p>
              <p className="text-sm font-semibold text-charcoal mt-1">{field.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white rounded-xl border border-black/5 p-1 mb-6 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`relative flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap flex-shrink-0 ${
              activeTab === tab.id ? 'bg-brand text-white' : 'text-charcoal/60 hover:text-charcoal hover:bg-lightgray'
            }`}
          >
            <i className={`${tab.icon} text-sm`} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* HRA Calculator */}
      {activeTab === 'hra' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-3xl border border-black/5 p-6">
              <h2 className="text-base font-bold text-charcoal mb-5 flex items-center gap-2">
                <div className="w-6 h-6 flex items-center justify-center">
                  <i className="ri-calculator-line text-brand" />
                </div>
                HRA Exemption Calculator (FY 2025-26)
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { label: 'Basic Salary (monthly \u20b9)', field: 'basicSalary', value: hraInputs.basicSalary, placeholder: 'e.g. 60000' },
                  { label: 'HRA Received (monthly \u20b9)', field: 'hraReceived', value: hraInputs.hraReceived, placeholder: 'e.g. 15000' },
                  { label: 'Rent Paid (monthly \u20b9)', field: 'rentPaid', value: hraInputs.rentPaid, placeholder: 'e.g. 22000' },
                ].map((f) => (
                  <div key={f.field}>
                    <label className="block text-xs font-semibold text-charcoal/60 mb-1.5 uppercase tracking-wide">{f.label}</label>
                    <input
                      type="number"
                      value={f.value}
                      onChange={(e) => setHraInputs((prev) => ({ ...prev, [f.field]: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30"
                      placeholder={f.placeholder}
                    />
                  </div>
                ))}
                <div>
                  <label className="block text-xs font-semibold text-charcoal/60 mb-1.5 uppercase tracking-wide">City Type</label>
                  <div className="flex items-center gap-3 mt-2">
                    {[
                      { value: 'metro', label: 'Metro City' },
                      { value: 'non-metro', label: 'Non-Metro' },
                    ].map((opt) => (
                      <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="cityType"
                          value={opt.value}
                          checked={hraInputs.cityType === opt.value}
                          onChange={(e) => setHraInputs((prev) => ({ ...prev, cityType: e.target.value }))}
                          className="w-4 h-4 text-brand focus:ring-brand/30 cursor-pointer"
                        />
                        <span className="text-sm text-charcoal">{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <button
                onClick={calculateHRA}
                className="mt-5 flex items-center gap-2 px-6 py-2.5 rounded-full bg-brand text-white text-sm font-medium hover:bg-brand-dark transition-colors cursor-pointer whitespace-nowrap"
              >
                <i className="ri-calculator-line text-sm" /> Calculate Exemption
              </button>

              {hraResult && (
                <div className="mt-5 bg-offwhite rounded-xl p-5">
                  <h3 className="text-sm font-bold text-charcoal mb-3">Result</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="bg-white rounded-xl p-3 text-center border border-black/5">
                      <p className="text-[10px] text-charcoal/40 font-medium">HRA Received (Yearly)</p>
                      <p className="text-sm font-bold text-charcoal mt-1">{formatCurrency(parseNum(hraInputs.hraReceived) * 12)}</p>
                    </div>
                    <div className="bg-green-50 rounded-xl p-3 text-center border border-green-100">
                      <p className="text-[10px] text-green-600 font-medium">Exempt HRA</p>
                      <p className="text-sm font-bold text-green-700 mt-1">{formatCurrency(hraResult.exempt * 12)}</p>
                    </div>
                    <div className="bg-amber-50 rounded-xl p-3 text-center border border-amber-100">
                      <p className="text-[10px] text-amber-600 font-medium">Taxable HRA</p>
                      <p className="text-sm font-bold text-amber-700 mt-1">{formatCurrency(hraResult.taxable * 12)}</p>
                    </div>
                  </div>
                  <p className="text-xs text-charcoal/40 mt-3 leading-relaxed">
                    Exemption is the least of: (a) HRA received, (b) Rent paid minus 10% of basic salary, (c) 50% of basic salary (metro) or 40% (non-metro).
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-3xl border border-black/5 p-5">
              <h3 className="text-sm font-bold text-charcoal mb-4">Quick Tips</h3>
              <div className="space-y-3">
                {[
                  { icon: 'ri-home-4-line', text: 'Metro cities: Delhi, Mumbai, Chennai, Kolkata, Bangalore, Hyderabad' },
                  { icon: 'ri-file-text-line', text: 'Keep rent receipts for all 12 months for ITR proof' },
                  { icon: 'ri-shield-check-line', text: 'Landlord PAN is mandatory if annual rent > \u20b91,00,000' },
                  { icon: 'ri-money-rupee-circle-line', text: 'If no HRA received, claim 80GG deduction instead' },
                ].map((tip, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <div className="w-6 h-6 flex items-center justify-center rounded-lg bg-brand/10 flex-shrink-0 mt-0.5">
                      <i className={`${tip.icon} text-xs text-brand`} />
                    </div>
                    <p className="text-xs text-charcoal/60 leading-relaxed">{tip.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rent Summary */}
      {activeTab === 'summary' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl border border-black/5 p-6">
            <h2 className="text-base font-bold text-charcoal mb-5 flex items-center gap-2">
              <div className="w-6 h-6 flex items-center justify-center">
                <i className="ri-file-list-3-line text-brand" />
              </div>
              Rent Payment Summary (FY 2025-26)
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-black/5">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-charcoal/40 uppercase tracking-wide">Month</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-charcoal/40 uppercase tracking-wide">Receipt #</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-charcoal/40 uppercase tracking-wide">Rent Amount</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-charcoal/40 uppercase tracking-wide">Maintenance</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-charcoal/40 uppercase tracking-wide">Total</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-charcoal/40 uppercase tracking-wide">Mode</th>
                  </tr>
                </thead>
                <tbody>
                  {tenantReceipts.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-charcoal/40">
                        No rent receipts on file yet.
                      </td>
                    </tr>
                  )}
                  {tenantReceipts.map((rcpt) => (
                    <tr key={rcpt.id} className="border-b border-gray-50 last:border-0 hover:bg-offwhite transition-colors">
                      <td className="px-4 py-3.5 text-sm font-medium text-charcoal">
                        {rcpt.periodFrom ? new Date(rcpt.periodFrom).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : '—'}
                      </td>
                      <td className="px-4 py-3.5 text-sm text-charcoal/60">{rcpt.receiptNumber}</td>
                      <td className="px-4 py-3.5 text-sm font-semibold text-charcoal">{formatCurrency(rcpt.rentAmount)}</td>
                      <td className="px-4 py-3.5 text-sm text-charcoal/60">{rcpt.includesMaintenance ? formatCurrency(rcpt.maintenanceAmount) : '-'}</td>
                      <td className="px-4 py-3.5 text-sm font-bold text-charcoal">
                        {formatCurrency(rcpt.rentAmount + (rcpt.includesMaintenance ? rcpt.maintenanceAmount : 0))}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-brand/10 text-brand capitalize">{rcpt.paymentMode.replace('_', ' ')}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 bg-offwhite rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-charcoal/40 font-medium">Total Rent Paid (Year)</p>
                <p className="text-lg font-bold text-charcoal">{formatCurrency(yearlyRent)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-charcoal/40 font-medium">Landlord</p>
                <p className="text-sm font-semibold text-charcoal">{agreement?.landlordName || '—'}</p>
              </div>
            </div>
          </div>

          {/* 80GG Section */}
          <div className="bg-white rounded-3xl border border-black/5 p-6">
            <h2 className="text-base font-bold text-charcoal mb-4 flex items-center gap-2">
              <div className="w-6 h-6 flex items-center justify-center">
                <i className="ri-file-text-line text-teal-600" />
              </div>
              Section 80GG Declaration
            </h2>
            <p className="text-sm text-charcoal/60 mb-4 leading-relaxed">
              If you do <strong>not</strong> receive HRA from your employer, you can claim deduction under Section 80GG for rent paid.
              Maximum deduction is the least of: \u20b960,000/year, 25% of total income, or rent paid minus 10% of total income.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { label: 'Max Deduction', value: '\u20b960,000' },
                { label: '25% of Total Income', value: 'As per ITR' },
                { label: 'Rent - 10% of Income', value: 'As per ITR' },
              ].map((item) => (
                <div key={item.label} className="bg-offwhite rounded-xl p-3 text-center">
                  <p className="text-[10px] text-charcoal/40 font-medium">{item.label}</p>
                  <p className="text-sm font-bold text-charcoal mt-1">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tax Forms */}
      {activeTab === 'forms' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {tenantTaxDocuments.map((doc) => (
              <div key={doc.id} className={`bg-white rounded-3xl border border-black/5 p-5 transition-colors ${doc.status === 'available' ? 'hover:border-brand/30' : 'opacity-60'}`}>
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-10 h-10 flex items-center justify-center rounded-xl flex-shrink-0 ${doc.color}`}>
                    <i className={`${doc.icon} text-lg`} />
                  </div>
                  <p className="text-sm font-bold text-charcoal">{doc.title}</p>
                </div>
                <p className="text-xs text-charcoal/60 leading-relaxed mb-3">{doc.description}</p>
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    doc.status === 'available' ? 'bg-brand/10 text-brand' : 'bg-lightgray text-charcoal/50'
                  }`}>
                    {doc.status === 'available' ? 'Available' : 'Coming Soon'}
                  </span>
                  {doc.status === 'available' && (
                    <button
                      onClick={() => doc.tab && setActiveTab(doc.tab)}
                      className="text-xs font-semibold text-brand hover:text-brand-dark transition-colors whitespace-nowrap flex items-center gap-1 cursor-pointer"
                    >
                      Open <i className="ri-arrow-right-line" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tenant Filing Guide */}
      {activeTab === 'guide' && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl border border-black/5 p-6">
            <h2 className="text-base font-bold text-charcoal mb-5 flex items-center gap-2">
              <div className="w-6 h-6 flex items-center justify-center">
                <i className="ri-book-open-line text-brand" />
              </div>
              ITR Filing Guide for Tenants
            </h2>
            <div className="space-y-5">
              {[
                { step: 1, title: 'Choose the Right ITR Form', desc: 'Salaried tenants with HRA should file ITR-1 (if income \u2264 \u20b950 lakh). If you have capital gains or multiple properties, use ITR-2.', icon: 'ri-file-text-line' },
                { step: 2, title: 'Collect Rent Documents', desc: 'Gather all 12 monthly rent receipts, rent agreement copy, and landlord PAN. These are essential for HRA exemption proof.', icon: 'ri-folder-open-line' },
                { step: 3, title: 'Enter HRA Details in ITR', desc: 'In ITR-1, enter basic salary, HRA received, rent paid, and city type (metro/non-metro). The system auto-calculates exempt HRA.', icon: 'ri-home-4-line' },
                { step: 4, title: 'Claim 80GG if No HRA', desc: 'If your employer does not provide HRA, claim Section 80GG deduction. You need Form 10BA and must not own a house in the same city.', icon: 'ri-file-text-line' },
                { step: 5, title: 'Check Form 16/16A', desc: 'Verify Form 16 from employer and Form 16A from landlord (if TDS deducted on rent > \u20b950,000/month). Match TDS credits in AIS.', icon: 'ri-shield-check-line' },
                { step: 6, title: 'E-Verify Your Return', desc: 'After filing, e-verify within 30 days using Aadhaar OTP, net banking, or bank ATM. Without verification, your ITR is not valid.', icon: 'ri-checkbox-circle-line' },
              ].map((item) => (
                <div key={item.step} className="flex items-start gap-4">
                  <div className="w-10 h-10 flex items-center justify-center rounded-xl bg-brand/10 flex-shrink-0">
                    <span className="text-sm font-bold text-brand">{item.step}</span>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-charcoal flex items-center gap-2">
                      <i className={`${item.icon} text-brand`} />
                      {item.title}
                    </h3>
                    <p className="text-xs text-charcoal/60 mt-1 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 bg-brand/5 border border-brand/10 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-brand/10 flex-shrink-0">
                  <i className="ri-lightbulb-line text-brand" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-charcoal">Important Deadlines</p>
                  <p className="text-xs text-charcoal/60 mt-1 leading-relaxed">
                    Due date for filing ITR is <strong>July 31, 2026</strong> for FY 2025-26. Late filing attracts penalty up to \u20b95,000 under Section 234F.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Quick links */}
          <div className="bg-white rounded-3xl border border-black/5 p-6">
            <h3 className="text-sm font-bold text-charcoal mb-4">Useful Links</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { label: 'Income Tax e-Filing Portal', url: 'https://www.incometax.gov.in/iec/foportal/', icon: 'ri-external-link-line' },
                { label: 'ITR-1 Form & Instructions', url: 'https://www.incometax.gov.in/iec/foportal/help/itr-forms', icon: 'ri-file-download-line' },
                { label: 'Tax Calculator (Official)', url: 'https://www.incometax.gov.in/iec/foportal/help/tax-calculator', icon: 'ri-calculator-line' },
                { label: 'Form 10BA (80GG)', url: 'https://www.incometax.gov.in/iec/foportal/help/form-10ba', icon: 'ri-file-text-line' },
              ].map((link) => (
                <a key={link.label} href={link.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 rounded-xl hover:bg-offwhite transition-colors cursor-pointer">
                  <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-brand/10 flex-shrink-0">
                    <i className={`${link.icon} text-sm text-brand`} />
                  </div>
                  <span className="text-sm font-medium text-charcoal">{link.label}</span>
                  <div className="w-4 h-4 flex items-center justify-center ml-auto">
                    <i className="ri-arrow-right-up-line text-charcoal/40 text-xs" />
                  </div>
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ════════════════════════════════════ */
/*  MAIN PAGE                           */
/* ════════════════════════════════════ */
export default function TaxForms() {
  const { user } = useAuth();
  const isOwner = user?.role === 'owner';
  const userName = user?.name || 'User';

  return (
    <div className="min-h-screen bg-offwhite pb-16">
      <div className="max-w-5xl mx-auto px-4 md:px-8">
        {isOwner ? <OwnerTaxView userName={userName} /> : <TenantTaxView userName={userName} />}
      </div>
    </div>
  );
}
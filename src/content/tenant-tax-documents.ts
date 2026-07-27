// Static navigation cards for the tenant Tax Forms page. Each "available"
// entry links to a real tab on this same page; there is no separate
// document-generation or storage system behind these, so entries without a
// real feature yet are marked 'coming_soon' rather than faking a status
// like "Generated" or "Pending".
export type TaxDocStatus = 'available' | 'coming_soon';

export interface TenantTaxDocument {
  id: string;
  title: string;
  description: string;
  status: TaxDocStatus;
  icon: string;
  color: string;
  tab?: 'hra' | 'summary';
}

export const tenantTaxDocuments: TenantTaxDocument[] = [
  {
    id: 'tax-1',
    title: 'HRA Exemption Calculator',
    description: 'Calculate your House Rent Allowance exemption based on rent paid, salary, and city classification.',
    status: 'available',
    icon: 'ri-home-4-line',
    color: 'bg-amber-50 text-amber-600',
    tab: 'hra',
  },
  {
    id: 'tax-2',
    title: 'Rent Summary for ITR',
    description: 'Yearly rent payment summary with landlord PAN for claiming HRA or 80GG deduction in your ITR.',
    status: 'available',
    icon: 'ri-file-list-3-line',
    color: 'bg-green-50 text-green-600',
    tab: 'summary',
  },
  {
    id: 'tax-3',
    title: '80GG Declaration',
    description: 'For those not receiving HRA — claim deduction for rent paid under Section 80GG.',
    status: 'available',
    icon: 'ri-file-text-line',
    color: 'bg-teal-50 text-teal-600',
    tab: 'summary',
  },
  {
    id: 'tax-4',
    title: 'Form 16B (TDS on Rent)',
    description: 'Download a TDS certificate if your landlord deducts tax on rent paid above ₹50,000/month.',
    status: 'coming_soon',
    icon: 'ri-government-line',
    color: 'bg-orange-50 text-orange-600',
  },
  {
    id: 'tax-5',
    title: 'Landlord PAN Verification',
    description: "Verify your landlord's PAN for accurate tax filing and TDS compliance.",
    status: 'coming_soon',
    icon: 'ri-shield-check-line',
    color: 'bg-blue-50 text-blue-600',
  },
];

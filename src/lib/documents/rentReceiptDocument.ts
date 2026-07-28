export interface RentReceiptData {
  receiptNumber: string;
  landlordName: string;
  landlordPan: string;
  landlordAddress: string;
  tenantName: string;
  tenantPan: string;
  propertyAddress: string;
  periodFrom: string;
  periodTo: string;
  rentAmount: number;
  paymentMode: string;
  transactionRef: string;
  paymentDate: string;
  includesMaintenance: boolean;
  maintenanceAmount: number;
  notes: string;
  createdAt: string;
}

// `iso` here is usually a date-only string ("2026-08-01") from a <input
// type=date> or a Postgres `date` column, with no timezone info of its
// own. `new Date('2026-08-01')` parses that as UTC midnight, so
// formatting it in any timezone behind UTC (including most of the
// Americas, where an NRI landlord using this app may well be) rolls it
// back to the previous calendar day. Parsing the y/m/d components into
// a local Date instead makes the displayed date match what was typed,
// regardless of the reader's timezone.
function parseDateOnly(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function formatDate(iso: string): string {
  if (!iso) return '_______________';
  const local = parseDateOnly(iso) ?? new Date(iso);
  return local.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatDateShort(iso: string): string {
  if (!iso) return '—';
  const local = parseDateOnly(iso) ?? new Date(iso);
  return local.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatINR(n: number): string {
  return `₹${(n || 0).toLocaleString('en-IN')}`;
}

const PAYMENT_MODE_LABELS: Record<string, string> = {
  cash: 'Cash',
  cheque: 'Cheque',
  upi: 'UPI',
  bank_transfer: 'Bank Transfer',
  card: 'Card',
};

const DOCUMENT_STYLES = `
  @page { size: A4; margin: 22mm 20mm; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Georgia', 'Times New Roman', serif;
    color: #1a1a1a;
    line-height: 1.7;
    font-size: 15px;
    max-width: 820px;
    margin: 0 auto;
    padding: 40px;
  }
  .receipt-card { border: 2px solid #1a1a1a; padding: 40px 48px; border-radius: 4px; }
  h1.doc-title { text-align: center; font-size: 23px; letter-spacing: 1.5px; text-transform: uppercase; margin: 0 0 2px; font-weight: 700; }
  p.doc-subtitle { text-align: center; font-size: 12px; color: #666; margin: 0 0 24px; }
  .meta-row { display: flex; justify-content: space-between; margin-bottom: 22px; font-size: 13px; color: #555; border-bottom: 1px solid #ddd; padding-bottom: 12px; }
  p.recital { text-align: justify; margin: 0 0 16px; }
  .amount-box { background: #f9f7f2; border: 1px solid #e0dcd0; border-radius: 4px; padding: 18px 20px; margin: 22px 0; text-align: center; }
  .amount-box .amount { font-size: 28px; font-weight: 700; }
  table.schedule { width: 100%; border-collapse: collapse; margin: 18px 0; }
  table.schedule td { padding: 7px 0; font-size: 15px; }
  table.schedule td.label { width: 42%; color: #444; }
  table.schedule td.value { font-weight: 600; }
  .notes { font-size: 12px; color: #666; font-style: italic; margin-top: 10px; }
  .stamp-note { font-size: 10px; color: #999; margin-top: 18px; border-top: 1px dashed #ccc; padding-top: 10px; }
  .signature { margin-top: 48px; text-align: right; }
  .sig-line { display: inline-block; border-top: 1px solid #1a1a1a; padding-top: 6px; font-size: 12px; min-width: 220px; text-align: center; }
  .footer-meta { margin-top: 24px; text-align: center; font-size: 10px; color: #999; }
  @media print { body { padding: 0; } }
`;

export function buildRentReceiptHtml(r: RentReceiptData): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Rent Receipt ${escapeHtml(r.receiptNumber)}</title>
<style>${DOCUMENT_STYLES}</style>
</head>
<body>
  <div class="receipt-card">
    <h1 class="doc-title">Rent Receipt</h1>
    <p class="doc-subtitle">Receipt No. ${escapeHtml(r.receiptNumber)}</p>

    <div class="meta-row">
      <span>Date: ${formatDate(r.createdAt)}</span>
      <span>Period: ${formatDateShort(r.periodFrom)} – ${formatDateShort(r.periodTo)}</span>
    </div>

    <p class="recital">
      Received with thanks from <strong>${escapeHtml(r.tenantName)}</strong>${r.tenantPan ? ` (PAN: ${escapeHtml(r.tenantPan)})` : ''},
      a sum of <strong>${formatINR(r.rentAmount + (r.includesMaintenance ? r.maintenanceAmount : 0))}</strong> towards rent
      for the premises located at <strong>${escapeHtml(r.propertyAddress) || '_______________'}</strong>,
      for the period ${formatDateShort(r.periodFrom)} to ${formatDateShort(r.periodTo)}.
    </p>

    <div class="amount-box">
      <div class="amount">${formatINR(r.rentAmount + (r.includesMaintenance ? r.maintenanceAmount : 0))}</div>
      <div style="font-size:11px;color:#888;margin-top:4px">Amount in words: ${numberToWords(r.rentAmount + (r.includesMaintenance ? r.maintenanceAmount : 0))} Rupees Only</div>
    </div>

    <table class="schedule">
      <tr><td class="label">Monthly Rent</td><td class="value">${formatINR(r.rentAmount)}</td></tr>
      ${r.includesMaintenance ? `<tr><td class="label">Maintenance Charges</td><td class="value">${formatINR(r.maintenanceAmount)}</td></tr>` : ''}
      <tr><td class="label">Payment Mode</td><td class="value">${PAYMENT_MODE_LABELS[r.paymentMode] ?? r.paymentMode}</td></tr>
      ${r.transactionRef ? `<tr><td class="label">Transaction Reference</td><td class="value">${escapeHtml(r.transactionRef)}</td></tr>` : ''}
      <tr><td class="label">Payment Date</td><td class="value">${formatDate(r.paymentDate)}</td></tr>
      <tr><td class="label">Landlord</td><td class="value">${escapeHtml(r.landlordName)}${r.landlordPan ? ` (PAN: ${escapeHtml(r.landlordPan)})` : ''}</td></tr>
    </table>

    ${r.notes ? `<p class="notes">Note: ${escapeHtml(r.notes)}</p>` : ''}

    ${r.paymentMode === 'cash' && r.rentAmount > 5000 ? `<p class="stamp-note">Revenue stamp affixed as required for cash payments exceeding ₹5,000, per the Indian Stamp Act.</p>` : ''}

    <div class="signature">
      <span class="sig-line">${escapeHtml(r.landlordName)}<br/>Landlord's Signature</span>
    </div>
  </div>

  <p class="footer-meta">Generated via Bhavan &middot; Receipt No. ${escapeHtml(r.receiptNumber)}</p>
</body>
</html>`;
}

function numberToWords(num: number): string {
  if (!num || num === 0) return 'Zero';
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function chunk(n: number): string {
    if (n === 0) return '';
    if (n < 20) return ones[n];
    if (n < 100) return `${tens[Math.floor(n / 10)]}${n % 10 ? ' ' + ones[n % 10] : ''}`;
    return `${ones[Math.floor(n / 100)]} Hundred${n % 100 ? ' ' + chunk(n % 100) : ''}`;
  }

  let n = Math.floor(num);
  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  const rest = n;

  const parts: string[] = [];
  if (crore) parts.push(`${chunk(crore)} Crore`);
  if (lakh) parts.push(`${chunk(lakh)} Lakh`);
  if (thousand) parts.push(`${chunk(thousand)} Thousand`);
  if (rest) parts.push(chunk(rest));
  return parts.join(' ') || 'Zero';
}

function escapeHtml(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

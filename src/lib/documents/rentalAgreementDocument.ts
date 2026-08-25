export interface RentalAgreementData {
  agreementNumber: string;
  tenantName: string;
  tenantAddress: string;
  tenantPhone: string;
  tenantEmail: string;
  tenantPan: string;
  tenantAadhaarMasked: string;
  landlordName: string;
  landlordAddress: string;
  landlordPhone: string;
  landlordEmail: string;
  landlordPan: string;
  propertyAddress: string;
  propertyDescription: string;
  flatNumber: string;
  carpetArea: number;
  leaseStartDate: string;
  leaseEndDate: string;
  monthlyRent: number;
  securityDeposit: number;
  rentDueDay: number;
  paymentMode: string;
  maintenanceAmount: number;
  noticePeriodDays: number;
  lockInMonths: number;
  renewalClause: string;
  witness1Name: string;
  witness1Address: string;
  witness2Name: string;
  witness2Address: string;
  clauses: string[];
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

// True when `iso` carries a time-of-day, i.e. it is a real TIMESTAMP
// ("2026-08-25T01:30:00Z") rather than a bare date ("2026-08-25").
function hasTimeComponent(iso: string): boolean {
  return /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(iso);
}

// For genuine TIMESTAMP columns (createdAt / landlord_signed_at), which
// carry a time and timezone. parseDateOnly would take the UTC date prefix
// verbatim, so an agreement executed 00:00-05:30 IST (the previous UTC day)
// prints yesterday. Converting the full instant to the reader's local date
// fixes that. A value with no time-of-day is still a genuine date-only
// string (e.g. passed by a test) and is read verbatim to avoid the opposite
// rollback for readers behind UTC.
function formatTimestamp(iso: string): string {
  if (!iso) return '_______________';
  if (hasTimeComponent(iso)) {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  return formatDate(iso);
}

function formatINR(n: number): string {
  return `₹${(n || 0).toLocaleString('en-IN')}`;
}

const DOCUMENT_STYLES = `
  @page { size: A4; margin: 22mm 20mm; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Georgia', 'Times New Roman', serif;
    color: #1a1a1a;
    line-height: 1.7;
    font-size: 15px;
    max-width: 900px;
    margin: 0 auto;
    padding: 48px 56px;
  }
  h1.doc-title {
    text-align: center;
    font-size: 24px;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    margin: 0 0 4px;
    font-weight: 700;
  }
  p.doc-subtitle {
    text-align: center;
    font-size: 12px;
    color: #666;
    margin: 0 0 28px;
    letter-spacing: 0.5px;
  }
  p.recital {
    text-align: justify;
    margin: 0 0 14px;
  }
  .parties {
    margin: 18px 0;
    padding: 14px 16px;
    background: #f9f7f2;
    border: 1px solid #e0dcd0;
    border-radius: 4px;
  }
  .parties p { margin: 0 0 4px; }
  h2.section-title {
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    border-bottom: 1.5px solid #1a1a1a;
    padding-bottom: 5px;
    margin: 30px 0 14px;
  }
  table.schedule { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  table.schedule td { padding: 6px 0; font-size: 15px; vertical-align: top; }
  table.schedule td.label { width: 42%; color: #444; }
  table.schedule td.value { font-weight: 600; }
  ol.clauses { padding-left: 20px; margin: 0; }
  ol.clauses li { margin-bottom: 10px; text-align: justify; }
  .signatures {
    display: flex;
    justify-content: space-between;
    margin-top: 56px;
    gap: 24px;
  }
  .sig-block { flex: 1; }
  .sig-line {
    border-top: 1px solid #1a1a1a;
    margin-top: 48px;
    padding-top: 6px;
    font-size: 11px;
  }
  .sig-block .role { font-weight: 700; font-size: 12px; margin-bottom: 2px; }
  .witnesses {
    display: flex;
    justify-content: space-between;
    margin-top: 40px;
    gap: 24px;
    border-top: 1px dashed #ccc;
    padding-top: 24px;
  }
  .witnesses .sig-block { flex: 1; }
  .footer-meta {
    margin-top: 32px;
    text-align: center;
    font-size: 10px;
    color: #999;
  }
  @media print {
    body { padding: 0; }
  }
`;

export function buildRentalAgreementHtml(a: RentalAgreementData): string {
  const clauseItems = (a.clauses.length > 0 ? a.clauses : []).map((c) => `<li>${escapeHtml(c)}</li>`).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Rental Agreement ${escapeHtml(a.agreementNumber)}</title>
<style>${DOCUMENT_STYLES}</style>
</head>
<body>
  <h1 class="doc-title">Rental Agreement</h1>
  <p class="doc-subtitle">Agreement No. ${escapeHtml(a.agreementNumber)} &nbsp;·&nbsp; Executed on ${formatTimestamp(a.createdAt)}</p>

  <p class="recital">
    This Rental Agreement (&ldquo;Agreement&rdquo;) is made and entered into on <strong>${formatTimestamp(a.createdAt)}</strong>,
    by and between the parties named below, for the residential premises described in this Agreement.
  </p>

  <div class="parties">
    <p><strong>LESSOR / OWNER:</strong> ${escapeHtml(a.landlordName)}, residing at ${escapeHtml(a.landlordAddress) || '_______________'}
      ${a.landlordPhone ? `, Phone: ${escapeHtml(a.landlordPhone)}` : ''}${a.landlordEmail ? `, Email: ${escapeHtml(a.landlordEmail)}` : ''}
      ${a.landlordPan ? `, PAN: ${escapeHtml(a.landlordPan)}` : ''} (hereinafter referred to as the &ldquo;OWNER&rdquo;, which expression shall include their heirs, successors and assigns).</p>
    <p style="margin-top:8px"><strong>LESSEE / TENANT:</strong> ${escapeHtml(a.tenantName)}, residing at ${escapeHtml(a.tenantAddress) || '_______________'}
      ${a.tenantPhone ? `, Phone: ${escapeHtml(a.tenantPhone)}` : ''}${a.tenantEmail ? `, Email: ${escapeHtml(a.tenantEmail)}` : ''}
      ${a.tenantPan ? `, PAN: ${escapeHtml(a.tenantPan)}` : ''}${a.tenantAadhaarMasked ? `, Aadhaar: ${escapeHtml(a.tenantAadhaarMasked)}` : ''}
      (hereinafter referred to as the &ldquo;TENANT&rdquo;, which expression shall include their heirs, successors and assigns).</p>
  </div>

  <p class="recital">
    <strong>WHEREAS</strong> the Owner is the lawful owner of the residential premises described in the Schedule below, and is desirous of
    letting out the same; and the Tenant has approached the Owner to take the said premises on rent, and the Owner has agreed to let
    out the premises to the Tenant on the terms and conditions set out herein.
  </p>

  <h2 class="section-title">Schedule of Property</h2>
  <table class="schedule">
    <tr><td class="label">Property Address</td><td class="value">${escapeHtml(a.propertyAddress) || '—'}</td></tr>
    ${a.flatNumber ? `<tr><td class="label">Unit / Flat No.</td><td class="value">${escapeHtml(a.flatNumber)}</td></tr>` : ''}
    ${a.carpetArea ? `<tr><td class="label">Carpet Area</td><td class="value">${a.carpetArea} sq. ft.</td></tr>` : ''}
    ${a.propertyDescription ? `<tr><td class="label">Description</td><td class="value">${escapeHtml(a.propertyDescription)}</td></tr>` : ''}
  </table>

  <h2 class="section-title">Financial Terms</h2>
  <table class="schedule">
    <tr><td class="label">Monthly Rent</td><td class="value">${formatINR(a.monthlyRent)} per month</td></tr>
    <tr><td class="label">Security Deposit</td><td class="value">${formatINR(a.securityDeposit)} (refundable)</td></tr>
    <tr><td class="label">Maintenance Charges</td><td class="value">${formatINR(a.maintenanceAmount)} per month</td></tr>
    <tr><td class="label">Rent Due Date</td><td class="value">${a.rentDueDay ? `${a.rentDueDay}${ordinalSuffix(a.rentDueDay)} of every month` : '—'}</td></tr>
    <tr><td class="label">Payment Mode</td><td class="value">${escapeHtml(a.paymentMode) || '—'}</td></tr>
  </table>

  <h2 class="section-title">Duration of Tenancy</h2>
  <table class="schedule">
    <tr><td class="label">Lease Start Date</td><td class="value">${formatDate(a.leaseStartDate)}</td></tr>
    <tr><td class="label">Lease End Date</td><td class="value">${formatDate(a.leaseEndDate)}</td></tr>
    <tr><td class="label">Lock-in Period</td><td class="value">${a.lockInMonths ? `${a.lockInMonths} months` : '—'}</td></tr>
    <tr><td class="label">Notice Period</td><td class="value">${a.noticePeriodDays ? `${a.noticePeriodDays} days` : '—'}</td></tr>
    ${a.renewalClause ? `<tr><td class="label">Renewal Terms</td><td class="value">${escapeHtml(a.renewalClause)}</td></tr>` : ''}
  </table>

  ${clauseItems ? `
  <h2 class="section-title">Terms &amp; Conditions</h2>
  <ol class="clauses">${clauseItems}</ol>
  ` : ''}

  <p class="recital" style="margin-top:24px">
    <strong>IN WITNESS WHEREOF</strong>, the parties hereto have set their hands on the day, month and year first above written.
  </p>

  <div class="signatures">
    <div class="sig-block">
      <div class="sig-line">
        <div class="role">OWNER</div>
        ${escapeHtml(a.landlordName)}
      </div>
    </div>
    <div class="sig-block">
      <div class="sig-line">
        <div class="role">TENANT</div>
        ${escapeHtml(a.tenantName)}
      </div>
    </div>
  </div>

  ${(a.witness1Name || a.witness2Name) ? `
  <div class="witnesses">
    <div class="sig-block">
      <div class="sig-line">
        <div class="role">WITNESS 1</div>
        ${escapeHtml(a.witness1Name) || '_______________'}
        ${a.witness1Address ? `<br/><span style="color:#888">${escapeHtml(a.witness1Address)}</span>` : ''}
      </div>
    </div>
    <div class="sig-block">
      <div class="sig-line">
        <div class="role">WITNESS 2</div>
        ${escapeHtml(a.witness2Name) || '_______________'}
        ${a.witness2Address ? `<br/><span style="color:#888">${escapeHtml(a.witness2Address)}</span>` : ''}
      </div>
    </div>
  </div>
  ` : ''}

  <p class="footer-meta">Generated via Bhavan &middot; Agreement No. ${escapeHtml(a.agreementNumber)}</p>
</body>
</html>`;
}

function ordinalSuffix(n: number): string {
  const j = n % 10;
  const k = n % 100;
  if (j === 1 && k !== 11) return 'st';
  if (j === 2 && k !== 12) return 'nd';
  if (j === 3 && k !== 13) return 'rd';
  return 'th';
}

function escapeHtml(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

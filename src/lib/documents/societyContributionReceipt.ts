export interface ContributionReceiptData {
  receiptNumber: string;
  societyName: string;
  societyAddress: string;
  collectionTitle: string;
  collectionPurpose: string;
  payerName: string;
  payerUnits: string[];
  amountRupees: number;
  reference: string;
  paidOn: string;
  confirmedOn: string;
  confirmedByName: string;
}

// Local copies of these helpers rather than a shared module, matching
// rentReceiptDocument.ts and rentalAgreementDocument.ts. Those two are
// legal documents with their own tests; pulling their formatting into a
// shared file to save a few lines would mean editing both to add a third
// document, which is the wrong trade.

function parseDateOnly(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function formatDate(iso: string): string {
  // An em dash, not the blank rule the rent receipt uses. That one is a
  // printed form somebody fills in by hand; this is a record of something
  // that already happened, and a blank line invites someone to write a
  // date into it.
  if (!iso) return '—';
  const local = parseDateOnly(iso) ?? new Date(iso);
  return local.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatINR(n: number): string {
  return `₹${n.toLocaleString('en-IN')}`;
}

function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const DOCUMENT_STYLES = `
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px; background: #f5f2ed; font-family: "Segoe UI", system-ui, sans-serif; color: #2B2420; }
  .receipt-card { max-width: 640px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
  .doc-title { font-size: 22px; margin: 0 0 4px; }
  .doc-subtitle { font-size: 13px; color: #6b625c; margin: 0 0 20px; }
  .meta-row { display: flex; justify-content: space-between; font-size: 13px; color: #6b625c; border-top: 1px solid #eee; border-bottom: 1px solid #eee; padding: 10px 0; margin-bottom: 20px; }
  .recital { font-size: 15px; line-height: 1.7; margin: 0 0 20px; }
  .rows { width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 20px; }
  .rows td { padding: 7px 0; vertical-align: top; }
  .rows td:first-child { color: #6b625c; width: 42%; }
  .amount { font-size: 26px; font-weight: 700; margin: 4px 0 20px; }
  .disclaimer { font-size: 12px; line-height: 1.6; color: #6b625c; background: #f5f2ed; border-radius: 8px; padding: 12px 14px; }
  .sign { margin-top: 28px; font-size: 13px; color: #6b625c; }
  @media print { body { background: #fff; padding: 0; } .receipt-card { box-shadow: none; } }
`;

/**
 * A receipt for one confirmed contribution to a society collection.
 *
 * The disclaimer at the bottom is the reason this document exists in the
 * shape it does. Bhavan is not in the payment path: the owner paid the
 * society's own UPI id directly, and an admin confirmed it against the
 * account. This is a record of that confirmation, not proof that money
 * moved through Bhavan, and it says so -- because a receipt that implies
 * otherwise would be relied on in exactly the dispute where it is wrong.
 *
 * Only ever generated for a CONFIRMED contribution. A claim is not money,
 * and a receipt for one would be a lie with a reference number on it.
 */
export function buildContributionReceiptHtml(r: ContributionReceiptData): string {
  const units = r.payerUnits.length > 0 ? r.payerUnits.join(', ') : '—';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Contribution Receipt ${escapeHtml(r.receiptNumber)}</title>
<style>${DOCUMENT_STYLES}</style>
</head>
<body>
  <div class="receipt-card">
    <h1 class="doc-title">Contribution Receipt</h1>
    <p class="doc-subtitle">Receipt No. ${escapeHtml(r.receiptNumber)}</p>

    <div class="meta-row">
      <span>${escapeHtml(r.societyName)}</span>
      <span>Confirmed: ${formatDate(r.confirmedOn)}</span>
    </div>

    <p class="recital">
      Received from <strong>${escapeHtml(r.payerName)}</strong> (${escapeHtml(units)})
      towards <strong>${escapeHtml(r.collectionTitle)}</strong>.
    </p>

    <div class="amount">${formatINR(r.amountRupees)}</div>

    <table class="rows">
      <tr><td>Society</td><td>${escapeHtml(r.societyName)}</td></tr>
      <tr><td>Address</td><td>${escapeHtml(r.societyAddress)}</td></tr>
      <tr><td>Collection</td><td>${escapeHtml(r.collectionTitle)}</td></tr>
      <tr><td>Purpose</td><td>${escapeHtml(r.collectionPurpose)}</td></tr>
      <tr><td>Flat / villa</td><td>${escapeHtml(units)}</td></tr>
      <tr><td>Payment reference</td><td>${escapeHtml(r.reference || '—')}</td></tr>
      <tr><td>Recorded on</td><td>${formatDate(r.paidOn)}</td></tr>
      <tr><td>Confirmed by</td><td>${escapeHtml(r.confirmedByName || 'Society admin')}</td></tr>
    </table>

    <p class="disclaimer">
      This payment was made directly to the society. Bhavan did not receive,
      hold or transfer these funds — this receipt records that an
      administrator of ${escapeHtml(r.societyName)} confirmed the payment
      against the society's own account. For a tax or audit record, refer
      to the society's books.
    </p>

    <p class="sign">Issued by ${escapeHtml(r.societyName)} via Bhavan.</p>
  </div>
</body>
</html>`;
}

import { useState } from 'react';
import { Link } from 'react-router';
import { useAdminPendingAgreements } from '@/hooks/useRentalAgreements';
import { buildRentalAgreementHtml } from '@/lib/documents/rentalAgreementDocument';
import { viewDocument } from '@/lib/viewDocument';
import { useToast } from '@/hooks/useToast';

// Admin stamp-duty queue: agreements both parties have signed, waiting for
// the Bhavan team to do stamp duty out of band and upload the stamped PDF.
// Uploading returns the agreement to the owner to share with the tenant.
export default function AdminAgreements() {
  const { agreements, loading, stamp } = useAdminPendingAgreements();
  const { addToast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  const handleUpload = async (agreementId: string, file: File | undefined) => {
    if (!file) return;
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)) {
      addToast('Upload a PDF, JPG or PNG of the stamped agreement.', 'error');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      addToast('That file is larger than 10MB.', 'error');
      return;
    }
    setBusyId(agreementId);
    const { error } = await stamp(agreementId, file);
    setBusyId(null);
    addToast(error ?? 'Stamped agreement returned to the owner.', error ? 'error' : 'success');
  };

  return (
    <div className="min-h-screen bg-offwhite pb-16">
      <div className="max-w-4xl mx-auto px-4 md:px-8 pt-8">
        <div className="mb-6">
          <Link to="/admin" className="text-sm text-charcoal/40 hover:text-brand transition-colors">
            <i className="ri-arrow-left-line mr-1" />Admin Dashboard
          </Link>
          <h1 className="text-2xl font-bold text-charcoal mt-2">Agreement Stamp Duty</h1>
          <p className="text-sm text-charcoal/60 mt-1">
            Both parties have signed these agreements. Do the stamp duty, then upload the stamped copy — it returns to
            the owner to share with the tenant.
          </p>
        </div>

        {loading ? (
          <div className="bg-white rounded-2xl border border-black/5 p-10 text-center text-sm text-charcoal/40">Loading…</div>
        ) : agreements.length === 0 ? (
          <div className="bg-white rounded-2xl border border-black/5 p-10 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mx-auto">
              <i className="ri-checkbox-circle-line text-emerald-500 text-2xl" />
            </div>
            <p className="mt-4 text-charcoal/60 text-sm">No agreements awaiting stamp duty.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {agreements.map((a) => (
              <div key={a.id} className="bg-white rounded-2xl border border-black/5 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-charcoal">{a.agreementNumber}</p>
                    <p className="text-xs text-charcoal/50 mt-0.5">
                      {a.landlordName} (landlord) ↔ {a.tenantName} (tenant) · {a.propertyAddress}
                    </p>
                    <p className="text-[11px] text-charcoal/40 mt-1">
                      Signed by landlord {a.landlordSignedAt ? new Date(a.landlordSignedAt).toLocaleDateString('en-IN') : '—'} as “{a.landlordSignatureName ?? '—'}”,
                      by tenant {a.tenantSignedAt ? new Date(a.tenantSignedAt).toLocaleDateString('en-IN') : '—'} as “{a.tenantSignatureName ?? '—'}”.
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    onClick={async () => { const e = await viewDocument(buildRentalAgreementHtml(a), `Rental agreement ${a.agreementNumber}`); if (e) addToast(e, 'error'); }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-black/10 text-xs font-medium text-charcoal hover:border-brand/40 hover:text-brand transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <i className="ri-eye-line text-xs" /> View unsigned copy
                  </button>
                  <label className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand text-white text-xs font-semibold hover:bg-brand-dark transition-colors cursor-pointer whitespace-nowrap disabled:opacity-40">
                    {busyId === a.id ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-upload-2-line" />}
                    {busyId === a.id ? 'Uploading…' : 'Upload stamped PDF'}
                    <input
                      type="file"
                      accept="application/pdf,image/jpeg,image/png"
                      className="hidden"
                      disabled={busyId === a.id}
                      onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; handleUpload(a.id, f); }}
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

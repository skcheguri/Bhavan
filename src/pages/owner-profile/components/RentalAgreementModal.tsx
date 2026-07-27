import type { RentalAgreementRow } from '@/hooks/useRentalAgreements';
import { buildRentalAgreementHtml } from '@/lib/documents/rentalAgreementDocument';

interface Props {
  agreement: RentalAgreementRow | null;
  onClose: () => void;
}

function printHtml(html: string) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 300);
}

export default function RentalAgreementModal({ agreement, onClose }: Props) {
  if (!agreement) return null;

  const html = buildRentalAgreementHtml(agreement);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[92vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-black/5 flex items-center justify-between flex-shrink-0">
          <h3 className="text-sm font-bold text-charcoal">{agreement.agreementNumber}</h3>
          <div className="flex items-center gap-2">
            <button onClick={() => printHtml(html)} className="text-xs text-amber-600 font-medium hover:text-amber-700 flex items-center gap-1 cursor-pointer">
              <i className="ri-printer-line" /> Print
            </button>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-lightgray transition-colors cursor-pointer">
              <i className="ri-close-line text-charcoal/60" />
            </button>
          </div>
        </div>
        <iframe title="Rental agreement" srcDoc={html} className="w-full flex-1 border-0" />
      </div>
    </div>
  );
}

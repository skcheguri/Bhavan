import { useEffect, useState, useRef } from 'react';
import QRCode from 'qrcode';

interface Listing {
  id: string;
  title: string;
  location: string | null;
  price: number;
  images: string[];
}

interface QRCodeModalProps {
  listing: Listing | null;
  onClose: () => void;
}

export default function QRCodeModal({ listing, onClose }: QRCodeModalProps) {
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!listing) return;
    const url = `https://bungalow.in/scan/${listing.id}`;
    QRCode.toDataURL(url, {
      width: 280,
      margin: 2,
      color: {
        dark: '#1a1a1a',
        light: '#ffffff',
      },
    }).then((dataUrl) => setQrDataUrl(dataUrl));
  }, [listing]);

  useEffect(() => {
    if (!listing || !qrDataUrl || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = 340;
    const height = 520;
    canvas.width = width * 2;
    canvas.height = height * 2;
    ctx.scale(2, 2);

    // Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Border
    ctx.strokeStyle = '#e5e5e5';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, width, height);

    // Header bar
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(0, 0, width, 48);

    // Logo text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Bhavan', width / 2, 30);

    // Property image (small circle)
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const imgSize = 48;
      const imgX = width / 2 - imgSize / 2;
      const imgY = 68;
      ctx.save();
      ctx.beginPath();
      ctx.arc(width / 2, imgY + imgSize / 2, imgSize / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, imgX, imgY, imgSize, imgSize);
      ctx.restore();

      // Ring around image
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(width / 2, imgY + imgSize / 2, imgSize / 2 + 2, 0, Math.PI * 2);
      ctx.stroke();
    };
    img.src = listing.images[0];

    // Title
    ctx.fillStyle = '#1a1a1a';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    const title = listing.title.length > 28 ? listing.title.slice(0, 28) + '...' : listing.title;
    ctx.fillText(title, width / 2, 140);

    // Location
    ctx.fillStyle = '#6b7280';
    ctx.font = '12px sans-serif';
    ctx.fillText(listing.location ?? '', width / 2, 158);

    // Price
    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(`₹${listing.price.toLocaleString('en-IN')}/mo`, width / 2, 182);

    // QR code area background
    ctx.fillStyle = '#f9f9f7';
    ctx.beginPath();
    ctx.roundRect(30, 200, width - 60, 220, 12);
    ctx.fill();

    // QR code
    const qrImg = new Image();
    qrImg.onload = () => {
      const qrSize = 180;
      ctx.drawImage(qrImg, width / 2 - qrSize / 2, 220, qrSize, qrSize);

      // Scan me text
      ctx.fillStyle = '#6b7280';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Scan to view & message', width / 2, 418);

      // Bottom instruction
      ctx.fillStyle = '#1a1a1a';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText('Available for Rent', width / 2, 450);

      ctx.fillStyle = '#6b7280';
      ctx.font = '11px sans-serif';
      ctx.fillText('All conversations via Bhavan app', width / 2, 468);

      // Footer
      ctx.fillStyle = '#f3f4f6';
      ctx.fillRect(0, height - 36, width, 36);
      ctx.fillStyle = '#9ca3af';
      ctx.font = '10px sans-serif';
      ctx.fillText('No phone calls · No broker fees · Verified listing', width / 2, height - 16);
    };
    qrImg.src = qrDataUrl;
  }, [listing, qrDataUrl]);

  const handleDownload = () => {
    if (!canvasRef.current || !listing) return;
    const link = document.createElement('a');
    link.download = `rentconnect-qr-${listing.id}.png`;
    link.href = canvasRef.current.toDataURL('image/png');
    link.click();
  };

  const handlePrint = () => {
    if (!canvasRef.current || !listing) return;
    const dataUrl = canvasRef.current.toDataURL('image/png');
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>Print QR Code - ${listing.title}</title>
          <style>
            @page { size: A4; margin: 20mm; }
            body {
              margin: 0;
              padding: 0;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              background: #f5f5f5;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            }
            .print-card {
              background: white;
              border-radius: 16px;
              padding: 24px;
              box-shadow: 0 4px 24px rgba(0,0,0,0.08);
              text-align: center;
              max-width: 400px;
            }
            .print-card img {
              width: 340px;
              height: 520px;
              border-radius: 12px;
              display: block;
              margin: 0 auto;
            }
            .print-instructions {
              margin-top: 20px;
              padding: 16px;
              background: #fef9f0;
              border-radius: 12px;
              text-align: left;
            }
            .print-instructions h4 {
              margin: 0 0 8px 0;
              font-size: 14px;
              color: #92400e;
            }
            .print-instructions p {
              margin: 0;
              font-size: 12px;
              color: #a16207;
              line-height: 1.6;
            }
            .print-footer {
              margin-top: 16px;
              font-size: 11px;
              color: #9ca3af;
            }
            @media print {
              body { background: white; }
              .print-card { box-shadow: none; padding: 0; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="print-card">
            <img src="${dataUrl}" alt="QR Code for ${listing.title}" />
            <div class="print-instructions no-print">
              <h4>Print Instructions</h4>
              <p>1. Use A4 paper or thicker card stock for durability.<br/>
                 2. Print at 100% scale (no fit-to-page).<br/>
                 3. Laminate or use a waterproof sleeve for outdoor use.<br/>
                 4. Tape or mount near the entrance of your property.</p>
            </div>
            <p class="print-footer">Bhavan · bhavan.in</p>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 300);
  };

  const handleCopyLink = () => {
    if (!listing) return;
    navigator.clipboard.writeText(`https://bungalow.in/scan/${listing.id}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!listing) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-black/5">
          <div>
            <h3 className="text-base font-bold text-charcoal">QR Code</h3>
            <p className="text-xs text-charcoal/40 mt-0.5">Print & place outside your property</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-lightgray transition-colors cursor-pointer"
          >
            <i className="ri-close-line text-charcoal/60" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Preview card */}
          <div className="flex justify-center">
            <canvas
              ref={canvasRef}
              className="rounded-xl border border-black/10"
              style={{ width: '340px', height: '520px' }}
            />
          </div>

          {/* How it works */}
          <div className="bg-offwhite rounded-xl p-4">
            <h4 className="text-sm font-bold text-charcoal mb-3">How it works</h4>
            <div className="space-y-2.5">
              {[
                { step: '1', text: 'Prospect scans the QR code with their phone' },
                { step: '2', text: 'They see your listing with photos, price & details' },
                { step: '3', text: 'They message you directly through the app' },
                { step: '4', text: 'No phone number shared — 100% privacy' },
              ].map((item) => (
                <div key={item.step} className="flex items-start gap-2.5">
                  <div className="w-5 h-5 flex items-center justify-center rounded-full bg-amber-500 text-white text-[10px] font-bold flex-shrink-0 mt-0.5">
                    {item.step}
                  </div>
                  <p className="text-xs text-charcoal/70 leading-relaxed">{item.text}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Listing link */}
          <div className="flex items-center gap-2 p-3 bg-lightgray rounded-xl">
            <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-black/10 flex-shrink-0">
              <i className="ri-link text-sm text-charcoal/60" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-charcoal/40">Listing URL</p>
              <p className="text-xs text-charcoal font-medium truncate">
                bungalow.in/scan/{listing.id}
              </p>
            </div>
            <button
              onClick={handleCopyLink}
              className="px-3 py-1.5 rounded-full bg-amber-50 text-amber-600 text-xs font-semibold hover:bg-amber-100 transition-colors cursor-pointer whitespace-nowrap"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleDownload}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className="ri-download-line text-sm" />
              Download PNG
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-full border border-black/10 text-sm font-medium text-charcoal hover:border-amber-400 hover:text-amber-600 transition-colors cursor-pointer whitespace-nowrap"
            >
              <i className="ri-printer-line text-sm" />
              Print
            </button>
          </div>

          <p className="text-xs text-charcoal/40 text-center">
            Tip: Print on A4 and laminate for outdoor use
          </p>
        </div>
      </div>
    </div>
  );
}
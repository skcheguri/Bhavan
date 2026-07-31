import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';

// Reachable only through RequireAdmin, which means this session has
// already reached aal2 -- re-enrolling here is legitimate self-service
// (e.g. "I got a new phone") because Supabase requires an aal2 session to
// unenroll a verified TOTP factor. That's also why this can't double as a
// lost-device recovery flow: without the old device there's no way to
// reach aal2 in the first place. A locked-out admin needs a second admin
// (or the Supabase dashboard) to remove their factor row manually -- see
// the incident-response runbook.
export default function AdminSecurity() {
  const { mfaListFactors, mfaUnenroll, mfaEnrollTotp, mfaChallengeAndVerify } = useAuth();

  const [loading, setLoading] = useState(true);
  const [verifiedFactorId, setVerifiedFactorId] = useState<string | null>(null);
  const [reenrolling, setReenrolling] = useState(false);
  const [pendingFactorId, setPendingFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const loadFactors = async () => {
    setLoading(true);
    const factors = await mfaListFactors();
    setVerifiedFactorId(factors.verifiedTotpFactorId ?? null);
    setLoading(false);
  };

  useEffect(() => {
    loadFactors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startReenroll = async () => {
    setError('');
    setSuccess(false);
    if (!verifiedFactorId) return;

    const { error: unenrollError } = await mfaUnenroll(verifiedFactorId);
    if (unenrollError) {
      setError(unenrollError);
      return;
    }

    const enrolled = await mfaEnrollTotp();
    if (enrolled.error) {
      setError(enrolled.error);
      return;
    }

    setPendingFactorId(enrolled.factorId ?? null);
    setQrCode(enrolled.qrCode ?? null);
    setSecret(enrolled.secret ?? null);
    setReenrolling(true);
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingFactorId) return;
    setError('');
    setSubmitting(true);
    const { error: verifyError } = await mfaChallengeAndVerify(pendingFactorId, code);
    setSubmitting(false);
    if (verifyError) {
      setError(verifyError);
      return;
    }
    setReenrolling(false);
    setCode('');
    setSuccess(true);
    await loadFactors();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-offwhite flex items-center justify-center pt-20">
        <i className="ri-loader-4-line animate-spin text-2xl text-charcoal/40" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-offwhite pt-20 pb-16">
      <div className="max-w-md mx-auto px-4 md:px-0">
        <h1 className="text-xl font-bold text-charcoal mb-1">Security</h1>
        <p className="text-sm text-charcoal/60 mb-6">Manage the authenticator app used for admin sign-in.</p>

        {!reenrolling && (
          <div className="bg-white rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 flex items-center justify-center bg-green-100 rounded-full shrink-0">
                <i className="ri-shield-check-line text-lg text-green-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-charcoal">Two-factor authentication is enabled</p>
                <p className="text-xs text-charcoal/50">Required for every sign-in to the admin panel.</p>
              </div>
            </div>

            {success && (
              <p className="text-sm text-green-600 bg-green-50 rounded-lg px-3 py-2">
                New authenticator registered successfully.
              </p>
            )}

            <button
              type="button"
              onClick={startReenroll}
              className="w-full bg-lightgray text-charcoal font-medium py-3 rounded-full hover:bg-charcoal/10 transition-colors cursor-pointer"
            >
              Register a new device
            </button>
            <p className="text-xs text-charcoal/40">
              Use this if you got a new phone or reinstalled your authenticator app. Your current device stays
              registered until you finish scanning the new code below.
            </p>

            {error && <p className="text-sm text-red-500">{error}</p>}
          </div>
        )}

        {reenrolling && (
          <div className="bg-white rounded-2xl p-6 space-y-5">
            {qrCode && (
              <div>
                <p className="text-sm font-medium text-charcoal mb-2">1. Scan with your authenticator app</p>
                <div className="bg-lightgray rounded-xl p-4 flex items-center justify-center">
                  <img src={qrCode} alt="TOTP enrollment QR code" className="w-44 h-44" />
                </div>
                {secret && (
                  <p className="text-xs text-charcoal/50 mt-2 break-all">
                    Can&apos;t scan? Enter this key manually: <span className="font-mono">{secret}</span>
                  </p>
                )}
              </div>
            )}

            <form onSubmit={handleVerify} className="space-y-3">
              <div>
                <label htmlFor="security-mfa-code" className="block text-sm font-medium text-charcoal mb-1.5">
                  2. Enter the 6-digit code from your app
                </label>
                <input
                  id="security-mfa-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  required
                  className="w-full px-4 py-3 bg-lightgray rounded-xl text-sm tracking-[0.3em] text-center focus:outline-none focus:ring-2 focus:ring-amber-400"
                  placeholder="000000"
                />
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}

              <button
                type="submit"
                disabled={submitting || code.length !== 6}
                className="w-full bg-charcoal text-white font-semibold py-3 rounded-full hover:bg-black transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting ? 'Verifying…' : 'Verify & Confirm'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

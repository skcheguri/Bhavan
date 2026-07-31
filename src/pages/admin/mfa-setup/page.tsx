import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router';
import { useAuth } from '@/hooks/useAuth';

// Forced enrollment step for any admin account that doesn't yet have a
// verified TOTP factor -- RequireAdmin redirects here rather than letting
// an admin opt out, since the admin panel is the highest-privilege surface
// in the app. Deliberately a standalone surface like /admin/login (no
// Navbar/Footer, see App.tsx).
export default function AdminMfaSetup() {
  const { user, loading, mfaListFactors, mfaEnrollTotp, mfaChallengeAndVerify, mfaUnenroll, signOut } = useAuth();
  const navigate = useNavigate();

  const [preparing, setPreparing] = useState(true);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [alreadyEnrolled, setAlreadyEnrolled] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user || user.role !== 'admin') {
      navigate('/admin/login', { replace: true });
      return;
    }

    let mounted = true;
    (async () => {
      const factors = await mfaListFactors();
      if (!mounted) return;

      if (factors.verifiedTotpFactorId) {
        // Already fully enrolled -- RequireAdmin wouldn't have sent an
        // admin here unless currentLevel isn't aal2 yet this session,
        // which means a challenge (not setup) is what's actually needed.
        setAlreadyEnrolled(true);
        setPreparing(false);
        return;
      }

      // A leftover unverified factor from an abandoned previous attempt
      // would collide with a fresh enroll() call -- clear it first so
      // the QR shown below always matches the secret this session holds.
      if (factors.unverifiedTotpFactorId) {
        await mfaUnenroll(factors.unverifiedTotpFactorId);
      }

      const enrolled = await mfaEnrollTotp();
      if (!mounted) return;
      if (enrolled.error) {
        setError(enrolled.error);
        setPreparing(false);
        return;
      }

      setFactorId(enrolled.factorId ?? null);
      setQrCode(enrolled.qrCode ?? null);
      setSecret(enrolled.secret ?? null);
      setPreparing(false);
    })();

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!factorId) return;
    setError('');
    setSubmitting(true);
    const { error: verifyError } = await mfaChallengeAndVerify(factorId, code);
    setSubmitting(false);
    if (verifyError) {
      setError(verifyError);
      return;
    }
    navigate('/admin', { replace: true });
  };

  if (loading || preparing) {
    return (
      <div className="min-h-screen bg-charcoal flex items-center justify-center">
        <i className="ri-loader-4-line animate-spin text-2xl text-white/50" />
      </div>
    );
  }

  if (alreadyEnrolled) {
    return (
      <div className="min-h-screen bg-charcoal flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-white rounded-2xl p-6 text-center space-y-4">
          <div className="w-12 h-12 flex items-center justify-center mx-auto bg-green-100 rounded-full">
            <i className="ri-shield-check-line text-2xl text-green-600" />
          </div>
          <h1 className="text-lg font-bold text-charcoal">MFA already enabled</h1>
          <p className="text-sm text-charcoal/60">
            This account already has an authenticator app registered -- you just need to verify a code for this session.
          </p>
          <Link
            to="/admin/mfa-challenge"
            className="block w-full bg-charcoal text-white font-semibold py-3 rounded-full hover:bg-black transition-colors"
          >
            Enter code
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-charcoal flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <img src="/favicon.svg" alt="Bhavan" className="h-10 w-10 object-contain mx-auto mb-3" />
          <h1 className="text-xl font-bold text-white">Set up two-factor sign-in</h1>
          <p className="text-sm text-white/50 mt-1">
            Required for every admin account before you can access the admin panel.
          </p>
        </div>

        <div className="bg-white rounded-2xl p-6 space-y-5">
          {qrCode && (
            <div>
              <p className="text-sm font-medium text-charcoal mb-2">
                1. Scan this with Google Authenticator, Authy, or any TOTP app
              </p>
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
              <label htmlFor="mfa-code" className="block text-sm font-medium text-charcoal mb-1.5">
                2. Enter the 6-digit code from your app
              </label>
              <input
                id="mfa-code"
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
              disabled={submitting || code.length !== 6 || !factorId}
              className="w-full bg-charcoal text-white font-semibold py-3 rounded-full hover:bg-black transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? 'Verifying…' : 'Verify & Enable'}
            </button>
          </form>

          <button
            type="button"
            onClick={() => signOut().then(() => navigate('/admin/login'))}
            className="w-full text-center text-xs text-charcoal/40 hover:text-charcoal/70 cursor-pointer"
          >
            Sign out instead
          </button>
        </div>
      </div>
    </div>
  );
}

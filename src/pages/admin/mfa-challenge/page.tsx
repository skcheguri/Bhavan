import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

// Per-session TOTP challenge for an admin who already has a verified
// factor but hasn't completed this session's step-up to aal2 yet --
// RequireAdmin redirects here (not /admin/mfa-setup) when a verified
// factor already exists. Deliberately standalone, matching /admin/login.
export default function AdminMfaChallenge() {
  const { user, loading, mfaListFactors, mfaChallengeAndVerify, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [preparing, setPreparing] = useState(true);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const redirectTo = (location.state as { from?: string } | null)?.from || '/admin';

  useEffect(() => {
    if (loading) return;
    if (!user || user.role !== 'admin') {
      navigate('/admin/login', { replace: true });
      return;
    }

    let mounted = true;
    mfaListFactors().then((factors) => {
      if (!mounted) return;
      if (!factors.verifiedTotpFactorId) {
        // No verified factor at all -- this account hasn't finished
        // enrollment, so a challenge screen doesn't apply here.
        navigate('/admin/mfa-setup', { replace: true });
        return;
      }
      setFactorId(factors.verifiedTotpFactorId);
      setPreparing(false);
    });

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
    navigate(redirectTo, { replace: true });
  };

  if (loading || preparing) {
    return (
      <div className="min-h-screen bg-charcoal flex items-center justify-center">
        <i className="ri-loader-4-line animate-spin text-2xl text-white/50" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-charcoal flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/favicon.svg" alt="Bhavan" className="h-10 w-10 object-contain mx-auto mb-3" />
          <h1 className="text-xl font-bold text-white">Verify it&apos;s you</h1>
          <p className="text-sm text-white/50 mt-1">Enter the code from your authenticator app.</p>
        </div>

        <form onSubmit={handleVerify} className="bg-white rounded-2xl p-6 space-y-4">
          <div>
            <label htmlFor="mfa-challenge-code" className="block text-sm font-medium text-charcoal mb-1.5">
              6-digit code
            </label>
            <input
              id="mfa-challenge-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              required
              autoFocus
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
            {submitting ? 'Verifying…' : 'Verify'}
          </button>

          <button
            type="button"
            onClick={() => signOut().then(() => navigate('/admin/login'))}
            className="w-full text-center text-xs text-charcoal/40 hover:text-charcoal/70 cursor-pointer"
          >
            Sign out instead
          </button>
        </form>
      </div>
    </div>
  );
}

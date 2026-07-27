import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

export default function ResetPassword() {
  const { user, loading, updatePassword } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return; }
    setError('');
    setSubmitting(true);
    const { error: updateError } = await updatePassword(newPassword);
    setSubmitting(false);
    if (updateError) {
      setError(updateError);
      return;
    }
    setDone(true);
  };

  return (
    <div className="min-h-screen bg-offwhite flex items-center justify-center pt-20 pb-10 px-4">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-3xl p-8 border border-black/5">
          {loading ? (
            <div className="text-center py-6">
              <i className="ri-loader-4-line animate-spin text-2xl text-charcoal/40" />
              <p className="mt-3 text-sm text-charcoal/60">Checking your reset link...</p>
            </div>
          ) : done ? (
            <div className="text-center py-4">
              <div className="w-16 h-16 flex items-center justify-center rounded-full bg-green-50 mx-auto mb-4">
                <i className="ri-checkbox-circle-fill text-4xl text-green-500" />
              </div>
              <h3 className="text-lg font-bold text-charcoal">Password Updated!</h3>
              <p className="mt-2 text-sm text-charcoal/60 mb-6">
                Your password has been reset successfully. You can now sign in with your new password.
              </p>
              <Link
                to="/login"
                className="block w-full bg-brand hover:bg-brand-dark text-white font-medium py-3 rounded-full transition-colors cursor-pointer whitespace-nowrap text-center"
              >
                Go to Sign In
              </Link>
            </div>
          ) : user ? (
            <>
              <div className="w-12 h-12 flex items-center justify-center rounded-2xl bg-amber-50 mb-4">
                <i className="ri-key-2-line text-2xl text-amber-600" />
              </div>
              <h3 className="text-lg font-bold text-charcoal">Set New Password</h3>
              <p className="mt-1 text-sm text-charcoal/60 mb-5">Choose a strong password with at least 8 characters.</p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-charcoal mb-1.5">New Password</label>
                  <div className="relative">
                    <input
                      type={showNewPwd ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => { setNewPassword(e.target.value); setError(''); }}
                      className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 pr-12"
                      placeholder="Min. 8 characters"
                      autoFocus
                    />
                    <button type="button" onClick={() => setShowNewPwd(!showNewPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-charcoal/40 hover:text-charcoal cursor-pointer">
                      <div className="w-5 h-5 flex items-center justify-center">
                        <i className={`ri-${showNewPwd ? 'eye-off' : 'eye'}-line`} />
                      </div>
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-charcoal mb-1.5">Confirm Password</label>
                  <div className="relative">
                    <input
                      type={showConfirmPwd ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => { setConfirmPassword(e.target.value); setError(''); }}
                      className="w-full px-4 py-3 bg-offwhite rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 pr-12"
                      placeholder="Re-enter password"
                    />
                    <button type="button" onClick={() => setShowConfirmPwd(!showConfirmPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-charcoal/40 hover:text-charcoal cursor-pointer">
                      <div className="w-5 h-5 flex items-center justify-center">
                        <i className={`ri-${showConfirmPwd ? 'eye-off' : 'eye'}-line`} />
                      </div>
                    </button>
                  </div>
                </div>
                {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
                <button
                  type="submit"
                  disabled={submitting || !newPassword || !confirmPassword}
                  className="w-full bg-brand hover:bg-brand-dark text-white font-medium py-3 rounded-full transition-colors cursor-pointer whitespace-nowrap disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {submitting ? <><i className="ri-loader-4-line animate-spin" /> Updating...</> : <><i className="ri-check-line" /> Update Password</>}
                </button>
              </form>
            </>
          ) : (
            <div className="text-center py-4">
              <div className="w-16 h-16 flex items-center justify-center rounded-full bg-red-50 mx-auto mb-4">
                <i className="ri-error-warning-line text-3xl text-red-500" />
              </div>
              <h3 className="text-lg font-bold text-charcoal">Link Invalid or Expired</h3>
              <p className="mt-2 text-sm text-charcoal/60 mb-6">
                This password reset link is no longer valid. Request a new one from the sign-in page.
              </p>
              <Link
                to="/login"
                className="block w-full bg-brand hover:bg-brand-dark text-white font-medium py-3 rounded-full transition-colors cursor-pointer whitespace-nowrap text-center"
              >
                Back to Sign In
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

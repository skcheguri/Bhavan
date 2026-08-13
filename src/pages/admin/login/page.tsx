import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/hooks/useAuth';

// Deliberately not linked from the public nav or the consumer /login page --
// admin sign-in is a separate, unadvertised surface, matching how real
// marketplace platforms keep ops access out of the public-facing login
// screen entirely (no "Admin" card next to Tenant/Owner).
export default function AdminLogin() {
  const { signIn, signOut, user, loading } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (loading || !user) return;
    if (user.role === 'admin') {
      navigate('/admin');
    } else {
      // Someone with a real but non-admin account landed here -- sign
      // them back out rather than leaving them half-authenticated on
      // an admin-only entry point.
      setError('This sign-in is for admin accounts only.');
      signOut();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    const { error: signInError } = await signIn(email, password);
    setSubmitting(false);
    if (signInError) setError(signInError);
  };

  return (
    <div className="min-h-screen bg-charcoal flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/favicon.svg" alt="Bhavan" className="h-10 w-10 object-contain mx-auto mb-3" />
          <h1 className="text-xl font-bold text-white">Admin Sign In</h1>
          <p className="text-sm text-white/50 mt-1">Restricted access -- Bhavan operations team only.</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 space-y-4">
          <div>
            <label htmlFor="admin-email" className="block text-sm font-medium text-charcoal mb-1.5">Email</label>
            <input
              id="admin-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
              className="w-full px-4 py-3 bg-lightgray rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              placeholder="admin@bhavan.com"
            />
          </div>
          <div>
            <label htmlFor="admin-password" className="block text-sm font-medium text-charcoal mb-1.5">Password</label>
            <div className="relative">
              <input
                id="admin-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full px-4 py-3 pr-11 bg-lightgray rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-charcoal/40 hover:text-charcoal cursor-pointer"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                <i className={showPassword ? 'ri-eye-off-line' : 'ri-eye-line'} />
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-charcoal text-white font-semibold py-3 rounded-full hover:bg-black transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

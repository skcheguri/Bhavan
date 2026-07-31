import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth, GOOGLE_PENDING_ROLE_KEY, type UserRole } from '@/hooks/useAuth';
import { getSupabase } from '@/lib/supabase';

const FRESH_ACCOUNT_WINDOW_MS = 2 * 60 * 1000;

function profilePathForRole(role: UserRole): string {
  if (role === 'admin') return '/admin';
  return '/listings';
}

export default function AuthCallback() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [oauthError, setOauthError] = useState('');
  const settled = useRef(false);

  // Google/Supabase report a cancelled or failed consent screen via query
  // (or hash, since Supabase sometimes appends errors after the #) params.
  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const description = search.get('error_description') || hash.get('error_description') || search.get('error') || hash.get('error');
    if (description) setOauthError(description.replace(/\+/g, ' '));
  }, []);

  useEffect(() => {
    if (loading || settled.current) return;

    if (!user) {
      if (!oauthError) setOauthError('Google sign-in did not complete. Please try again or use email + password.');
      return;
    }

    settled.current = true;

    (async () => {
      const supabase = getSupabase();
      let pendingRole: string | null = null;
      try {
        pendingRole = window.localStorage.getItem(GOOGLE_PENDING_ROLE_KEY);
        window.localStorage.removeItem(GOOGLE_PENDING_ROLE_KEY);
      } catch {
        // ignore
      }

      let finalRole: UserRole = user.role;

      if (supabase && (pendingRole === 'tenant' || pendingRole === 'owner') && pendingRole !== user.role) {
        const { data } = await supabase.auth.getUser();
        const createdAtMs = data.user?.created_at ? new Date(data.user.created_at).getTime() : 0;
        const isFreshAccount = createdAtMs > 0 && Date.now() - createdAtMs < FRESH_ACCOUNT_WINDOW_MS;
        if (isFreshAccount) {
          const { error } = await supabase.from('users').update({ role: pendingRole }).eq('id', user.id);
          if (!error) finalRole = pendingRole;
        }
      }

      navigate(profilePathForRole(finalRole), { replace: true });
    })();
  }, [user, loading, oauthError, navigate]);

  if (oauthError) {
    return (
      <div className="min-h-screen bg-offwhite flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl p-8 border border-black/5 max-w-sm w-full text-center">
          <div className="w-14 h-14 flex items-center justify-center rounded-full bg-red-50 mx-auto mb-4">
            <i className="ri-error-warning-line text-2xl text-red-500" />
          </div>
          <h1 className="text-lg font-bold text-charcoal">Google sign-in failed</h1>
          <p className="mt-2 text-sm text-charcoal/60">{oauthError}</p>
          <Link
            to="/login"
            className="mt-6 inline-flex items-center justify-center w-full bg-brand hover:bg-brand-dark text-white font-medium py-3 rounded-full transition-colors whitespace-nowrap"
          >
            Back to Sign In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-offwhite flex items-center justify-center">
      <div className="text-center">
        <i className="ri-loader-4-line animate-spin text-3xl text-brand" />
        <p className="mt-3 text-sm text-charcoal/60">Finishing Google sign-in&hellip;</p>
      </div>
    </div>
  );
}

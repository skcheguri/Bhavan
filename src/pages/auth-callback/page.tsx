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
  const { user, loading, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [oauthError, setOauthError] = useState('');
  // Dev-only: /auth/callback?previewRole=1 renders the finish-signup role
  // picker without a real OAuth session, so it can be seen/clicked locally.
  // import.meta.env.DEV is false in production, so this whole path is
  // dead-code-eliminated from the shipped build.
  const isRolePreview = import.meta.env.DEV && new URLSearchParams(window.location.search).has('previewRole');
  // A brand-new account that reached here via "Continue with Google" on the
  // sign-in page never picked tenant/owner. Rather than default it into the
  // tenant app, finish signup by asking -- the one signup step Google skipped.
  const [needsRole, setNeedsRole] = useState(isRolePreview);
  const [choosing, setChoosing] = useState<'tenant' | 'owner' | null>(null);
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
    if (isRolePreview) return; // dev preview: skip the real OAuth handoff
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

      // Was this account just created by this OAuth round-trip?
      let isFreshAccount = false;
      if (supabase) {
        const { data } = await supabase.auth.getUser();
        const createdAtMs = data.user?.created_at ? new Date(data.user.created_at).getTime() : 0;
        isFreshAccount = createdAtMs > 0 && Date.now() - createdAtMs < FRESH_ACCOUNT_WINDOW_MS;
      }

      // Signup-with-Google: a role was chosen up front -> apply it and go.
      if (isFreshAccount && (pendingRole === 'tenant' || pendingRole === 'owner')) {
        let role: UserRole = user.role;
        if (supabase && pendingRole !== user.role) {
          const { error } = await supabase.from('users').update({ role: pendingRole }).eq('id', user.id);
          if (!error) role = pendingRole;
        } else {
          role = pendingRole;
        }
        navigate(profilePathForRole(role), { replace: true });
        return;
      }

      // New account, no role chosen (came from the sign-in page's Google
      // button) -> ask before entering the app.
      if (isFreshAccount) {
        setNeedsRole(true);
        return;
      }

      // Returning user -> straight to their app in their real role.
      navigate(profilePathForRole(user.role), { replace: true });
    })();
  }, [user, loading, oauthError, navigate, isRolePreview]);

  const chooseRole = async (role: 'tenant' | 'owner') => {
    if (choosing) return;
    setChoosing(role);
    const supabase = getSupabase();
    // In the real flow `user` is always present here; the null case is only
    // the dev preview, which just routes without touching the DB.
    if (user && supabase) {
      const { error } = await supabase.from('users').update({ role }).eq('id', user.id);
      if (error) {
        setChoosing(null);
        setOauthError('Could not finish setting up your account. Please try again.');
        setNeedsRole(false);
        return;
      }
      // Sync the in-memory role so guards/routes see the choice immediately.
      await refreshProfile();
    }
    navigate(profilePathForRole(role), { replace: true });
  };

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

  if (needsRole) {
    return (
      <div className="min-h-screen bg-offwhite flex items-center justify-center px-4 py-8">
        <div className="bg-white rounded-3xl p-6 border border-black/5 max-w-md w-full">
          <div className="text-center mb-6">
            <img src="/favicon.svg" alt="Bhavan" className="h-11 w-11 object-contain mx-auto" />
            <h1 className="mt-3 text-2xl font-bold text-charcoal">Welcome to Bhavan</h1>
            <p className="mt-1 text-sm text-charcoal/60">One last step — how will you use Bhavan?</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => chooseRole('tenant')}
              disabled={!!choosing}
              className="group flex flex-col items-center gap-3 p-4 rounded-3xl border-2 border-black/5 hover:border-brand hover:bg-brand/5 transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <div className="w-14 h-14 flex items-center justify-center rounded-2xl bg-brand/10 group-hover:bg-brand/20 transition-colors">
                <i className="ri-home-heart-line text-2xl text-brand" />
              </div>
              <div className="text-center">
                <p className="text-sm font-bold text-charcoal">I'm a Tenant</p>
                <p className="text-xs text-charcoal/40 mt-0.5 leading-relaxed">Looking for a place to rent</p>
              </div>
              <div className="w-full flex items-center justify-center gap-1 py-2 rounded-xl bg-brand text-white text-xs font-semibold group-hover:bg-brand-dark transition-colors whitespace-nowrap">
                {choosing === 'tenant' ? <i className="ri-loader-4-line animate-spin" /> : <>Continue as Tenant <i className="ri-arrow-right-line text-sm" /></>}
              </div>
            </button>

            <button
              onClick={() => chooseRole('owner')}
              disabled={!!choosing}
              className="group flex flex-col items-center gap-3 p-4 rounded-3xl border-2 border-black/5 hover:border-amber-400 hover:bg-amber-50/50 transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <div className="w-14 h-14 flex items-center justify-center rounded-2xl bg-amber-50 group-hover:bg-amber-100 transition-colors">
                <i className="ri-building-4-line text-2xl text-amber-600" />
              </div>
              <div className="text-center">
                <p className="text-sm font-bold text-charcoal">I'm an Owner</p>
                <p className="text-xs text-charcoal/40 mt-0.5 leading-relaxed">Listing my property</p>
              </div>
              <div className="w-full flex items-center justify-center gap-1 py-2 rounded-xl bg-amber-500 text-white text-xs font-semibold group-hover:bg-amber-600 transition-colors whitespace-nowrap">
                {choosing === 'owner' ? <i className="ri-loader-4-line animate-spin" /> : <>Continue as Owner <i className="ri-arrow-right-line text-sm" /></>}
              </div>
            </button>
          </div>

          <p className="mt-5 text-center text-xs text-red-500 font-medium flex items-center justify-center gap-1">
            <i className="ri-forbid-line" /> Brokers &amp; real estate agents are strictly not allowed.
          </p>
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

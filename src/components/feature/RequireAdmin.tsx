import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import { useAuth } from '@/hooks/useAuth';

interface RequireAdminProps {
  children: React.ReactNode;
}

function AccessDenied({ message, to, label }: { message: string; to: string; label: string }) {
  return (
    <div className="min-h-screen bg-offwhite flex items-center justify-center pt-20">
      <div className="text-center">
        <div className="w-16 h-16 flex items-center justify-center mx-auto mb-4 bg-red-100 rounded-full">
          <i className="ri-shield-cross-line text-2xl text-red-500" />
        </div>
        <h2 className="text-xl font-bold text-charcoal mb-2">Access Denied</h2>
        <p className="text-charcoal/60 text-sm mb-6">{message}</p>
        <Link to={to} className="bg-brand text-white px-6 py-3 rounded-full text-sm font-medium hover:bg-brand-dark transition-colors whitespace-nowrap">
          {label}
        </Link>
      </div>
    </div>
  );
}

// Wraps every /admin/* page. RLS is the real enforcement layer for data
// access (every admin write already requires is_admin() at the database
// level) -- this guard controls whether the admin UI renders at all, so a
// non-admin never even sees the screen, and additionally requires every
// admin session to reach aal2 (TOTP MFA) before rendering, since the admin
// panel is the highest-privilege surface in the app and a password alone
// is not an acceptable bar for it.
export default function RequireAdmin({ children }: RequireAdminProps) {
  const { user, loading, mfaGetAssuranceLevel } = useAuth();
  const location = useLocation();
  const [aal, setAal] = useState<{ currentLevel: string | null; nextLevel: string | null } | 'loading'>('loading');

  useEffect(() => {
    if (loading || !user || user.role !== 'admin') return;
    let mounted = true;
    mfaGetAssuranceLevel()
      .then((result) => {
        if (mounted) setAal(result);
      })
      .catch(() => {
        // A network-layer rejection previously left setAal unresolved and
        // the admin staring at a spinner forever. Fail closed to the
        // enrollment/challenge routing instead of hanging.
        if (mounted) setAal({ currentLevel: null, nextLevel: null });
      });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-offwhite flex items-center justify-center pt-20">
        <i className="ri-loader-4-line animate-spin text-2xl text-charcoal/40" />
      </div>
    );
  }

  if (!user) {
    return (
      <AccessDenied
        message="Please sign in with an admin account to view this page."
        to="/admin/login"
        label="Go to Admin Sign In"
      />
    );
  }

  if (user.role !== 'admin') {
    return <AccessDenied message="This area is restricted to admin users only." to="/" label="Go Home" />;
  }

  if (aal === 'loading') {
    return (
      <div className="min-h-screen bg-offwhite flex items-center justify-center pt-20">
        <i className="ri-loader-4-line animate-spin text-2xl text-charcoal/40" />
      </div>
    );
  }

  if (aal.currentLevel !== 'aal2') {
    // nextLevel === 'aal2' means a verified factor already exists and this
    // session just hasn't completed the per-session challenge yet.
    // nextLevel === 'aal1' means no verified factor exists at all --
    // enrollment is mandatory for every admin account, no opt-out.
    const target = aal.nextLevel === 'aal2' ? '/admin/mfa-challenge' : '/admin/mfa-setup';
    return <Navigate to={target} state={{ from: location.pathname }} replace />;
  }

  return <>{children}</>;
}

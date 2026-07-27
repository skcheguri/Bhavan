import { Link } from 'react-router-dom';
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

// Wraps every /admin/* page. RLS is the real enforcement layer (every admin
// write already requires is_admin() at the database level) -- this guard
// only controls whether the admin UI renders at all, so a non-admin never
// even sees the screen, let alone has a reason to poke at its buttons.
export default function RequireAdmin({ children }: RequireAdminProps) {
  const { user, loading } = useAuth();

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

  return <>{children}</>;
}

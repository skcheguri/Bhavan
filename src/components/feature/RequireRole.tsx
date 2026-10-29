import { Navigate } from 'react-router';
import { useAuth } from '@/hooks/useAuth';

type ConsumerRole = 'tenant' | 'owner';

interface RequireRoleProps {
  role: ConsumerRole;
  children: React.ReactNode;
}

// Where a signed-in user of each role belongs. Admins have their own panel
// rather than a consumer dashboard, so a mis-routed admin lands there.
function homePathForRole(role: string): string {
  if (role === 'owner') return '/owner-profile';
  if (role === 'admin') return '/admin';
  return '/tenant-profile';
}

// Keeps a signed-in user on the dashboard that matches their role.
// Universal sign-in means one email = exactly one role, so an owner landing
// on /tenant-profile (or vice-versa) is always a mis-navigation, not a valid
// dual-role case -- redirect them to their own home rather than render the
// wrong dashboard. This is UX, not security: both pages are already
// own-user-id scoped and RLS-backed, so there was never a cross-user leak,
// just a confusing screen (HANDOVER 4.7).
//
// The not-signed-in case is deliberately passed through: each profile page
// renders its own tailored sign-in prompt, which is friendlier than a
// generic redirect, so this guard only acts once a user and role are known.
export default function RequireRole({ role, children }: RequireRoleProps) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-offwhite flex items-center justify-center pt-20">
        <i className="ri-loader-4-line animate-spin text-2xl text-charcoal/40" />
      </div>
    );
  }

  if (user && user.role !== role) {
    return <Navigate to={homePathForRole(user.role)} replace />;
  }

  return <>{children}</>;
}

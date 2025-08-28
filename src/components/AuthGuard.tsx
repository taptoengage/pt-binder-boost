import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

/**
 * Single source of truth for route access.
 * - Logs every render so we can see decisions.
 * - Redirects are idempotent (only when pathname !== target).
 * - Trainer area includes all trainer pages (clients/schedule/finance/...).
 */
export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { authStatus, loading } = useAuth();
  const location = useLocation();

  // Always log so we can see the transition from loading->trainer/client/admin
  console.debug('[guard]', {
    path: location.pathname,
    authStatus,
    loading,
  });

  // 1) While auth is resolving, show a single spinner (no children)
  if (loading) {
    return <div className="flex items-center justify-center h-screen">Loading…</div>;
  }

  // 2) Block ALL protected routes when unauthenticated
  if (authStatus === 'unauthenticated') {
    if (location.pathname !== '/') {
      return <Navigate to="/" replace />;
    }
    return <>{children}</>;
  }

  // Helpers (regex so we don't miss siblings)
  const inAdminArea   = /^\/admin(\/|$)/.test(location.pathname);
  const inClientArea  = /^\/client(\/|$)/.test(location.pathname);
  const inTrainerArea =
    /^\/(trainer|clients|schedule|payments|finance|settings|profile)(\/|$)/.test(
      location.pathname
    );

  // 3) Admin
  if (authStatus === 'admin') {
    const target = '/admin/dashboard';
    if (!inAdminArea && location.pathname !== target) {
      return <Navigate to={target} replace />;
    }
    return <>{children}</>;
  }

  // 4) Trainer
  if (authStatus === 'trainer') {
    const target = '/trainer/dashboard';
    // Always route trainers away from /, /dashboard, and non-trainer areas
    if (!inTrainerArea && location.pathname !== target) {
      return <Navigate to={target} replace />;
    }
    return <>{children}</>;
  }

  // 5) Client
  if (authStatus === 'client') {
    const target = '/client/dashboard';
    if (!inClientArea && location.pathname !== target) {
      return <Navigate to={target} replace />;
    }
    return <>{children}</>;
  }

  // 6) New/Unassigned user
  if (authStatus === 'unassigned_role') {
    if (location.pathname !== '/onboarding') {
      return <Navigate to="/onboarding" replace />;
    }
    return <>{children}</>;
  }

  // Fallback: render children
  return <>{children}</>;
}
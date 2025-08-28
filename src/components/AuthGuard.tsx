// src/components/AuthGuard.tsx
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

export default function AuthGuard() {
  const { authStatus, loading } = useAuth();
  const { pathname } = useLocation();

  // Areas (prefix match)
  const isTrainerArea = /^\/(trainer|clients|schedule|payments|finance|settings|profile)(\/|$)/.test(pathname);
  const isClientArea  = /^\/client(\/|$)/.test(pathname);
  const isAdminArea   = /^\/admin(\/|$)/.test(pathname);

  // Debug line every render
  console.debug('[guard]', { path: pathname, authStatus, loading });

  // 1) Loading → show a single lightweight placeholder
  if (loading) {
    return <div className="flex items-center justify-center h-screen">Loading…</div>;
  }

  // 2) Not logged in → block all protected children
  if (authStatus === 'unauthenticated') {
    return <Navigate to="/" replace />;
  }

  // 3) Role fences
  if (authStatus === 'trainer' && !isTrainerArea) {
    return <Navigate to="/trainer/dashboard" replace />;
  }

  if (authStatus === 'client' && !isClientArea) {
    return <Navigate to="/client/dashboard" replace />;
  }

  if (authStatus === 'admin' && !isAdminArea) {
    return <Navigate to="/admin/dashboard" replace />;
  }

  // 4) Unassigned users land on onboarding (and must stay there)
  if (authStatus === 'unassigned_role' && pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  // 5) Allowed → render the routed child page
  return <Outlet />;
}
import { useAuth } from "@/hooks/useAuth";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import Spinner from "@/components/ui/spinner";

const AuthGuard = () => {
  const { authStatus, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Spinner />
      </div>
    );
  }

  const currentPath = location.pathname;

  const trainerHome = '/trainer/dashboard';
  const clientHome = '/client/dashboard';
  const adminHome = '/admin/dashboard';
  const onboardingPath = '/onboarding';
  const publicEntry = '/';

  const isTrainerArea = currentPath.startsWith('/trainer');
  const isClientArea = currentPath.startsWith('/client');
  const isAdminArea = currentPath.startsWith('/admin');

  if (authStatus === 'admin' && !isAdminArea) {
    return <Navigate to={adminHome} replace />;
  }

  if (authStatus === 'trainer' && !isTrainerArea && (currentPath === publicEntry || currentPath === '/dashboard')) {
    return <Navigate to={trainerHome} replace />;
  }

  if (authStatus === 'client' && !isClientArea && (currentPath === publicEntry || currentPath === '/dashboard')) {
    return <Navigate to={clientHome} replace />;
  }

  if (authStatus === 'unassigned_role' && currentPath !== onboardingPath) {
    return <Navigate to={onboardingPath} replace />;
  }

  if (authStatus === 'unauthenticated' && (isTrainerArea || isClientArea || isAdminArea || currentPath === onboardingPath)) {
    return <Navigate to={publicEntry} replace />;
  }

  return <Outlet />;
};

export default AuthGuard;
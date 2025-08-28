// src/components/AuthGuard.tsx
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

  // 🚨 Unauthenticated users must never access protected routes
  if (authStatus === "unauthenticated") {
    return <Navigate to="/" replace />;
  }

  const currentPath = location.pathname;

  const trainerHome = "/trainer/dashboard";
  const clientHome = "/client/dashboard";
  const adminHome  = "/admin/dashboard";
  const onboardingPath = "/onboarding";

  // Trainer-owned areas (match your App.tsx trainer routes)
  const isTrainerArea =
    currentPath.startsWith("/trainer") ||
    currentPath.startsWith("/clients") ||
    currentPath.startsWith("/schedule") ||
    currentPath.startsWith("/payments") ||
    currentPath.startsWith("/finance") ||
    currentPath.startsWith("/settings") ||
    currentPath.startsWith("/profile") ||
    currentPath === "/dashboard"; // shared entry that you redirect from

  const isClientArea = currentPath.startsWith("/client");
  const isAdminArea  = currentPath.startsWith("/admin");

  // Admins must stay under /admin/*
  if (authStatus === "admin" && !isAdminArea) {
    return <Navigate to={adminHome} replace />;
  }

  // Trainers must stay in trainer-owned areas
  if (authStatus === "trainer" && !isTrainerArea) {
    return <Navigate to={trainerHome} replace />;
  }

  // Clients must stay in /client/*
  if (authStatus === "client" && !isClientArea) {
    return <Navigate to={clientHome} replace />;
  }

  // Unassigned role → onboarding
  if (authStatus === "unassigned_role" && currentPath !== onboardingPath) {
    return <Navigate to={onboardingPath} replace />;
  }

  return <Outlet />;
};

export default AuthGuard;
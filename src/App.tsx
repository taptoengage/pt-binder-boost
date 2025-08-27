
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";

import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";
import AuthRedirect from "./pages/AuthRedirect";
import Index from "./pages/Index";
import { AdminRoute } from "./components/AdminRoute";
import Dashboard from "./pages/Dashboard";
import TrainerDashboard from "./pages/TrainerDashboard";
import Onboarding from "./pages/Onboarding";
import Clients from "./pages/Clients";
import AddClient from "./pages/AddClient";
import ClientDetail from "./pages/ClientDetail";
import EditClient from "./pages/EditClient";
import EditPayment from "./pages/EditPayment";
import EditSession from "./pages/EditSession";
import ScheduleSession from "./pages/ScheduleSession";
import RecordPayment from "./pages/RecordPayment";
import ServiceTypes from "./pages/ServiceTypes";
import FinanceDashboard from "./pages/FinanceDashboard";
import ViewSchedule from "./pages/ViewSchedule";
import ClientDashboard from "./pages/ClientDashboard";
import ClientBookSessionPage from "./pages/ClientBookSessionPage";
import NotFound from "./pages/NotFound";
import ClientHistory from "./pages/ClientHistory";
import MyProfile from "./pages/MyProfile";
import ClientProfile from "./pages/ClientProfile";
import ManageAvailability from "./pages/ManageAvailability";
import AdminDashboard from "./pages/AdminDashboard";
import UnderConstruction from "./components/UnderConstruction";
import Spinner from "./components/ui/spinner";

const queryClient = new QueryClient();

function AppRoutes() {
  const { authStatus, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Track if user is attempting to access a restricted route
  const currentPath = window.location.pathname;
  const isProtectedRoute = currentPath !== '/' && 
                          currentPath !== '/auth' &&
                          !currentPath.startsWith('/auth/') && 
                          currentPath !== '/under-construction';
  const shouldShowUnderConstruction = !loading && authStatus === 'unauthenticated' && isProtectedRoute;

  useEffect(() => {
    // Wait for auth to complete
    if (loading) {
      return;
    }

    // Clean switch statement based on authStatus
    switch (authStatus) {
      case 'admin':
        if (currentPath !== '/admin/dashboard') {
          navigate('/admin/dashboard');
        }
        break;
      
      case 'trainer':
        if (currentPath === '/' || currentPath === '/dashboard') {
          navigate('/trainer/dashboard');
        }
        break;
      
      case 'client':
        if (currentPath === '/' || currentPath === '/dashboard') {
          navigate('/client/dashboard');
        }
        break;
      
      case 'unassigned_role':
        if (currentPath !== '/onboarding') {
          navigate('/onboarding');
        }
        break;
      
      case 'unauthenticated':
        // Allow unauthenticated users to stay on '/' (landing page)
        // For other protected routes, we'll show UnderConstruction
        break;
      
      default:
        // Fallback for any unexpected status
        break;
    }
  }, [authStatus, loading, navigate, currentPath]);

  // Show loading spinner while auth check is in progress
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Spinner />
      </div>
    );
  }

  // Show UnderConstruction for unauthenticated users trying to access protected routes
  if (shouldShowUnderConstruction) {
    return <UnderConstruction />;
  }

  return (
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/auth" element={<AuthRedirect />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/trainer/dashboard" element={<TrainerDashboard />} />
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/clients" element={<Clients />} />
      <Route path="/clients/new" element={<AddClient />} />
      <Route path="/clients/:clientId" element={<ClientDetail />} />
      <Route path="/clients/:clientId/history" element={<ClientHistory />} />
      <Route path="/clients/:clientId/edit" element={<EditClient />} />
      <Route path="/clients/:clientId/payments/:paymentId/edit" element={<EditPayment />} />
      <Route path="/clients/:clientId/sessions/:sessionId/edit" element={<EditSession />} />
      <Route path="/schedule" element={<ViewSchedule />} />
      <Route path="/schedule/new" element={<ScheduleSession />} />
      <Route path="/payments/new" element={<RecordPayment />} />
      <Route path="/finance" element={<FinanceDashboard />} />
      <Route path="/finance/transactions" element={<FinanceDashboard />} />
      <Route path="/settings/service-types" element={<ServiceTypes />} />
      <Route path="/schedule/availability" element={<ManageAvailability />} />
      <Route path="/profile" element={<MyProfile />} />
      <Route path="/client/dashboard" element={<ClientDashboard />} />
      <Route path="/client/book-session" element={<ClientBookSessionPage />} />
      <Route path="/client/profile" element={<ClientProfile />} />
      <Route path="/admin/dashboard" element={
        <AdminRoute>
          <AdminDashboard />
        </AdminRoute>
      } />
      {/* TEMPORARY: Test route for UnderConstruction component */}
      <Route path="/under-construction" element={<UnderConstruction />} />
      {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

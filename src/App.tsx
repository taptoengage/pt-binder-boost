import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import AuthGuard from "./components/AuthGuard"; // Import the new AuthGuard

// Page and Component Imports
import Index from "./pages/Index";
import Onboarding from "./pages/Onboarding";
import TrainerDashboard from "./pages/TrainerDashboard";
import Clients from "./pages/Clients";
import AddClient from "./pages/AddClient";
import ClientDetail from "./pages/ClientDetail";
import EditClient from "./pages/EditClient";
import ScheduleSession from "./pages/ScheduleSession";
import ClientDashboard from "./pages/ClientDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import NotFound from "./pages/NotFound";
import { AdminRoute } from "./components/AdminRoute";
import AuthRedirect from "./pages/AuthRedirect";
import Dashboard from "./pages/Dashboard";
import EditPayment from "./pages/EditPayment";
import EditSession from "./pages/EditSession";
import RecordPayment from "./pages/RecordPayment";
import ServiceTypes from "./pages/ServiceTypes";
import FinanceDashboard from "./pages/FinanceDashboard";
import ViewSchedule from "./pages/ViewSchedule";
import ClientBookSessionPage from "./pages/ClientBookSessionPage";
import ClientHistory from "./pages/ClientHistory";
import MyProfile from "./pages/MyProfile";
import ClientProfile from "./pages/ClientProfile";
import ManageAvailability from "./pages/ManageAvailability";
import UnderConstruction from "./components/UnderConstruction";
import AuthCallback from "./pages/AuthCallback";

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              {/* Public routes that are always accessible */}
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<AuthRedirect />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="/under-construction" element={<UnderConstruction />} />

              {/* All protected routes are now children of the AuthGuard */}
              <Route element={<AuthGuard />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/onboarding" element={<Onboarding />} />
                
                {/* Admin Routes */}
                <Route path="/admin/dashboard" element={<AdminRoute><AdminDashboard /></AdminRoute>} />

                {/* Trainer Routes */}
                <Route path="/trainer/dashboard" element={<TrainerDashboard />} />
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

                {/* Client Routes */}
                <Route path="/client/dashboard" element={<ClientDashboard />} />
                <Route path="/client/book-session" element={<ClientBookSessionPage />} />
                <Route path="/client/profile" element={<ClientProfile />} />
              </Route>

              {/* Catch-all Not Found route */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
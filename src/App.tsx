
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import Onboarding from "./pages/Onboarding";
import Clients from "./pages/Clients";
import AddClient from "./pages/AddClient";
import ClientDetail from "./pages/ClientDetail";
import ScheduleSession from "./pages/ScheduleSession";
import RecordPayment from "./pages/RecordPayment";
import ServiceTypes from "./pages/ServiceTypes";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/clients" element={<Clients />} />
            <Route path="/clients/new" element={<AddClient />} />
            <Route path="/clients/:clientId" element={<ClientDetail />} />
            <Route path="/schedule/new" element={<ScheduleSession />} />
            <Route path="/payments/new" element={<RecordPayment />} />
            <Route path="/settings/service-types" element={<ServiceTypes />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

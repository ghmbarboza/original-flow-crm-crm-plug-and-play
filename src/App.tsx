import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { supabase } from "@/integrations/supabase/client";
import AuthPage from "./pages/AuthPage";
import PendingApprovalPage from "./pages/PendingApprovalPage";
import DashboardPage from "./pages/DashboardPage";
import SettingsPage from "./pages/SettingsPage";
import OnboardingPage from "./pages/OnboardingPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
});

function TriggerHealthCheck() {
  useEffect(() => {
    const checked = sessionStorage.getItem("auth_trigger_checked");
    if (checked) return;
    supabase.functions
      .invoke("ensure-auth-trigger")
      .then(({ data, error }) => {
        sessionStorage.setItem("auth_trigger_checked", "1");
        if (error || !(data as { ok?: boolean })?.ok) {
          console.warn(
            "[Auth Setup] Trigger check failed:",
            error || (data as { message?: string })?.message,
          );
        }
      })
      .catch((err) => console.warn("[Auth Setup]", err));
  }, []);
  return null;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <TriggerHealthCheck />
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/pending-approval" element={
              <ProtectedRoute allowUnapproved><PendingApprovalPage /></ProtectedRoute>
            } />
            <Route path="/onboarding" element={
              <ProtectedRoute><OnboardingPage /></ProtectedRoute>
            } />
            <Route path="/dashboard" element={
              <ProtectedRoute><DashboardPage /></ProtectedRoute>
            } />
            <Route path="/settings/*" element={
              <ProtectedRoute allowedRoles={["admin"]}><SettingsPage /></ProtectedRoute>
            } />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

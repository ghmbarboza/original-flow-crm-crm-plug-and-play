import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PageSkeleton } from "@/components/PageSkeleton";
import { supabase } from "@/integrations/supabase/client";
import AuthPage from "./pages/AuthPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import PendingApprovalPage from "./pages/PendingApprovalPage";
import NotFound from "./pages/NotFound";

const SetupPage = lazy(() => import("./pages/SetupPage"));
const PublicFormPage = lazy(() => import("./pages/PublicFormPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const ContactsPage = lazy(() => import("./pages/ContactsPage"));
const CompaniesPage = lazy(() => import("./pages/CompaniesPage"));
const DealsPage = lazy(() => import("./pages/DealsPage"));
const DealDetailPage = lazy(() => import("./pages/DealDetailPage"));
const ActivitiesPage = lazy(() => import("./pages/ActivitiesPage"));
const TasksPage = lazy(() => import("./pages/TasksPage"));
const ProductsPage = lazy(() => import("./pages/ProductsPage"));
const WhatsAppPage = lazy(() => import("./pages/WhatsAppPage"));
const CampaignsPage = lazy(() => import("./pages/CampaignsPage"));
const LibraryPage = lazy(() => import("./pages/LibraryPage"));
const InboxPage = lazy(() => import("./pages/InboxPage"));
const EmailTemplatesPage = lazy(() => import("./pages/EmailTemplatesPage"));
const EmailSequencesPage = lazy(() => import("./pages/EmailSequencesPage"));
const AutomationsPage = lazy(() => import("./pages/AutomationsPage"));
const ReportsPage = lazy(() => import("./pages/ReportsPage"));
const SalesGoalsPage = lazy(() => import("./pages/SalesGoalsPage"));
const LeadScoringPage = lazy(() => import("./pages/LeadScoringPage"));
const TeamPage = lazy(() => import("./pages/TeamPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const HelpPage = lazy(() => import("./pages/HelpPage"));

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

/** Toda página lazy entra por aqui: erro de render vira tela explicada, carregamento vira skeleton. */
function Page({ name, children }: { name: string; children: ReactNode }) {
  return (
    <ErrorBoundary moduleName={name}>
      <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
    </ErrorBoundary>
  );
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
            {/* Redefinição de senha via link de email: público, fora do AppLayout. */}
            <Route path="/auth/reset-password" element={<ResetPasswordPage />} />

            {/* Público: sem autenticação e sem sidebar. */}
            <Route path="/f/:slug" element={
              <Page name="Formulário de captura"><PublicFormPage /></Page>
            } />

            <Route path="/pending-approval" element={
              <ProtectedRoute allowUnapproved><PendingApprovalPage /></ProtectedRoute>
            } />

            {/* Fullscreen, fora do AppLayout. */}
            {/* O onboarding antigo coletava 4 campos de perfil e virou a etapa
                "Empresa" do wizard. Mantido como redirect para não quebrar link
                salvo nem o botão "Refazer onboarding" das Configurações. */}
            <Route path="/onboarding" element={<Navigate to="/setup" replace />} />
            {/* skipSetupGuard: é a própria rota de destino do guard. Sem isso o
                redirect apontaria para si mesmo e entraria em laço. */}
            <Route path="/setup" element={
              <ProtectedRoute allowedRoles={["admin"]} skipSetupGuard>
                <Page name="Configuração inicial"><SetupPage /></Page>
              </ProtectedRoute>
            } />

            {/* CRM */}
            <Route path="/dashboard" element={
              <ProtectedRoute><Page name="Dashboard"><DashboardPage /></Page></ProtectedRoute>
            } />
            <Route path="/contacts" element={
              <ProtectedRoute><Page name="Contatos"><ContactsPage /></Page></ProtectedRoute>
            } />
            <Route path="/companies" element={
              <ProtectedRoute><Page name="Empresas"><CompaniesPage /></Page></ProtectedRoute>
            } />
            <Route path="/deals" element={
              <ProtectedRoute><Page name="Negócios"><DealsPage /></Page></ProtectedRoute>
            } />
            <Route path="/deals/:id" element={
              <ProtectedRoute><Page name="Negócio"><DealDetailPage /></Page></ProtectedRoute>
            } />
            <Route path="/activities" element={
              <ProtectedRoute><Page name="Atividades"><ActivitiesPage /></Page></ProtectedRoute>
            } />
            <Route path="/tasks" element={
              <ProtectedRoute><Page name="Tarefas"><TasksPage /></Page></ProtectedRoute>
            } />
            <Route path="/products" element={
              <ProtectedRoute><Page name="Produtos"><ProductsPage /></Page></ProtectedRoute>
            } />

            {/* Atendimento */}
            <Route path="/whatsapp" element={
              <ProtectedRoute><Page name="WhatsApp"><WhatsAppPage /></Page></ProtectedRoute>
            } />
            {/* Campanhas saiu de baixo de /whatsapp e virou item próprio em Marketing.
                A rota antiga vira redirect para não quebrar link salvo. */}
            <Route path="/whatsapp/campaigns" element={<Navigate to="/campaigns" replace />} />
            <Route path="/inbox" element={
              <ProtectedRoute><Page name="Email"><InboxPage /></Page></ProtectedRoute>
            } />
            <Route path="/email-templates" element={
              <ProtectedRoute><Page name="Templates de email"><EmailTemplatesPage /></Page></ProtectedRoute>
            } />

            {/* Marketing */}
            <Route path="/campaigns" element={
              <ProtectedRoute><Page name="Campanhas"><CampaignsPage /></Page></ProtectedRoute>
            } />
            <Route path="/library" element={
              <ProtectedRoute><Page name="Biblioteca de Modelos"><LibraryPage /></Page></ProtectedRoute>
            } />
            <Route path="/automations" element={
              <ProtectedRoute><Page name="Automações"><AutomationsPage /></Page></ProtectedRoute>
            } />
            <Route path="/email-sequences" element={
              <ProtectedRoute><Page name="Sequências de email"><EmailSequencesPage /></Page></ProtectedRoute>
            } />

            {/* Analytics */}
            <Route path="/reports" element={
              <ProtectedRoute><Page name="Relatórios"><ReportsPage /></Page></ProtectedRoute>
            } />
            <Route path="/sales-goals" element={
              <ProtectedRoute><Page name="Metas"><SalesGoalsPage /></Page></ProtectedRoute>
            } />
            <Route path="/lead-scoring" element={
              <ProtectedRoute><Page name="Lead Scoring"><LeadScoringPage /></Page></ProtectedRoute>
            } />

            {/* Sem allowedRoles: aquele filtro é por app_role (admin|member) e
                barraria gerente/diretor, que precisam supervisionar. A própria
                página checa crm_role e mostra o aviso de acesso restrito. */}
            <Route path="/team" element={
              <ProtectedRoute><Page name="Equipe"><TeamPage /></Page></ProtectedRoute>
            } />
            <Route path="/settings/*" element={
              <ProtectedRoute allowedRoles={["admin"]}><Page name="Configurações"><SettingsPage /></Page></ProtectedRoute>
            } />
            <Route path="/help" element={
              <ProtectedRoute><Page name="Ajuda"><HelpPage /></Page></ProtectedRoute>
            } />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { SetupWizardProvider, useSetupWizard } from "@/contexts/SetupWizardContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PageSkeleton } from "@/components/PageSkeleton";
import { supabase } from "@/integrations/supabase/client";
import AuthPage from "./pages/AuthPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import PendingApprovalPage from "./pages/PendingApprovalPage";
import NotFound from "./pages/NotFound";

const PublicFormPage = lazy(() => import("./pages/PublicFormPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const ContactsPage = lazy(() => import("./pages/ContactsPage"));
const ContactDetailPage = lazy(() => import("./pages/ContactDetailPage"));
const CompaniesPage = lazy(() => import("./pages/CompaniesPage"));
const DealsPage = lazy(() => import("./pages/DealsPage"));
const DealDetailPage = lazy(() => import("./pages/DealDetailPage"));
const TasksPage = lazy(() => import("./pages/TasksPage"));
const AgendaPage = lazy(() => import("./pages/AgendaPage"));
const VozPage = lazy(() => import("./pages/VozPage"));
const ProductsPage = lazy(() => import("./pages/ProductsPage"));
const WhatsAppPage = lazy(() => import("./pages/WhatsAppPage"));
const InboxPage = lazy(() => import("./pages/InboxPage"));
const EmailTemplatesPage = lazy(() => import("./pages/EmailTemplatesPage"));
const ReportsPage = lazy(() => import("./pages/ReportsPage"));
const SalesGoalsPage = lazy(() => import("./pages/SalesGoalsPage"));
const LeadScoringPage = lazy(() => import("./pages/LeadScoringPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const HelpPage = lazy(() => import("./pages/HelpPage"));
const SetupWizardDialog = lazy(() =>
  import("@/components/setup/SetupWizardDialog").then((m) => ({ default: m.SetupWizardDialog })),
);

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

/** Redirect que mantém a query string (ex.: /library?categoria=followup). */
function RedirecionarPreservandoBusca({ para }: { para: string }) {
  const { search } = useLocation();
  return <Navigate to={{ pathname: para, search }} replace />;
}

/** Toda página lazy entra por aqui: erro de render vira tela explicada, carregamento vira skeleton. */
function Page({ name, children }: { name: string; children: ReactNode }) {
  return (
    <ErrorBoundary moduleName={name}>
      <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
    </ErrorBoundary>
  );
}

/**
 * Monta o assistente só quando aberto: o chunk das etapas fica fora do bundle
 * principal e qualquer erro de render das etapas fica contido no boundary —
 * nunca tela branca no app inteiro (o modal reabre sozinho para admin com
 * setup incompleto, então um crash aqui sem boundary seria irrecuperável).
 */
function SetupWizardHost() {
  const { aberto } = useSetupWizard();
  if (!aberto) return null;
  return (
    <ErrorBoundary moduleName="Configuração inicial">
      <Suspense fallback={null}>
        <SetupWizardDialog />
      </Suspense>
    </ErrorBoundary>
  );
}

/** Rota /setup: abre o assistente em modal e devolve o usuário ao app real. */
function AbrirSetup() {
  const { abrir } = useSetupWizard();
  useEffect(() => { abrir(); }, [abrir]);
  return <Navigate to="/dashboard" replace />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <TriggerHealthCheck />
          <SetupWizardProvider>
          <SetupWizardHost />
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

            {/* O onboarding virou modal sobre o app. /onboarding e /setup seguem
                existindo como atalhos que abrem o assistente por cima do
                dashboard — links salvos e o botão "Refazer onboarding" das
                Configurações continuam funcionando. */}
            <Route path="/onboarding" element={<Navigate to="/setup" replace />} />
            <Route path="/setup" element={
              <ProtectedRoute><AbrirSetup /></ProtectedRoute>
            } />

            {/* CRM */}
            <Route path="/dashboard" element={
              <ProtectedRoute><Page name="Dashboard"><DashboardPage /></Page></ProtectedRoute>
            } />
            <Route path="/contacts" element={
              <ProtectedRoute><Page name="Contatos"><ContactsPage /></Page></ProtectedRoute>
            } />
            <Route path="/contacts/:id" element={
              <ProtectedRoute><Page name="Contato"><ContactDetailPage /></Page></ProtectedRoute>
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
            {/* Unificação de 2026-08-18: Atividades e Tarefas eram duas entradas
                para a mesma tabela. Sobrou /tasks, com filtro de tipo. */}
            <Route path="/activities" element={<Navigate to="/tasks" replace />} />
            <Route path="/tasks" element={
              <ProtectedRoute><Page name="Tarefas"><TasksPage /></Page></ProtectedRoute>
            } />
            <Route path="/agenda" element={
              <ProtectedRoute><Page name="Agenda"><AgendaPage /></Page></ProtectedRoute>
            } />
            <Route path="/voz" element={
              <ProtectedRoute><Page name="Voz"><VozPage /></Page></ProtectedRoute>
            } />
            <Route path="/products" element={
              <ProtectedRoute><Page name="Produtos/Serviços"><ProductsPage /></Page></ProtectedRoute>
            } />

            {/* Atendimento */}
            <Route path="/whatsapp" element={
              <ProtectedRoute><Page name="WhatsApp"><WhatsAppPage /></Page></ProtectedRoute>
            } />
            {/* Campanhas: /whatsapp/campaigns (até 07/2026), /campaigns (até 17/09/2026)
                e agora aba de Configurações. Os redirects preservam links salvos. */}
            <Route path="/whatsapp/campaigns" element={<Navigate to="/settings/campaigns" replace />} />
            <Route path="/inbox" element={
              <ProtectedRoute><Page name="Email"><InboxPage /></Page></ProtectedRoute>
            } />
            <Route path="/email-templates" element={
              <ProtectedRoute><Page name="Templates de email"><EmailTemplatesPage /></Page></ProtectedRoute>
            } />

            {/* Campanhas e Biblioteca viraram abas de Configurações (17/09/2026).
                A Biblioteca preserva o ?categoria= dos atalhos dos empty states. */}
            <Route path="/campaigns" element={<Navigate to="/settings/campaigns" replace />} />
            <Route path="/library" element={<RedirecionarPreservandoBusca para="/settings/library" />} />
            {/* Reorganização final do sidebar (2026-07-31): automações, sequências
                e equipe viraram abas de Configurações. Redirects preservam links. */}
            <Route path="/automations" element={<Navigate to="/settings/automations" replace />} />
            {/* Reorganização de 2026-07-31: o follow-up mora inteiro em
                Configurações > Automações > Cadências (régua + execuções). O redirect
                preserva links salvos da rota antiga. */}
            <Route path="/followup" element={<Navigate to="/settings/automations?secao=cadencias" replace />} />
            <Route path="/email-sequences" element={<Navigate to="/settings/automations?secao=cadencias" replace />} />

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
            <Route path="/team" element={<Navigate to="/settings/team" replace />} />
            <Route path="/settings/*" element={
              <ProtectedRoute allowedRoles={["admin"]}><Page name="Configurações"><SettingsPage /></Page></ProtectedRoute>
            } />
            <Route path="/help" element={
              <ProtectedRoute><Page name="Ajuda"><HelpPage /></Page></ProtectedRoute>
            } />

            <Route path="*" element={<NotFound />} />
          </Routes>
          </SetupWizardProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import type { AppRole } from "@/types/auth";
import { useEffect, useState } from "react";

/**
 * Teto de espera pelo perfil. Se a carga demorar mais que isso (rede ruim,
 * backend fora), o app renderiza otimista como antes em vez de segurar a tela.
 */
const PERFIL_TIMEOUT_MS = 4000;

export function ProtectedRoute({
  children, allowedRoles, allowUnapproved = false,
}: {
  children: React.ReactNode;
  allowedRoles?: AppRole[];
  allowUnapproved?: boolean;
  /** Aceito por compatibilidade: o setup agora é modal e não desvia de rota. */
  skipSetupGuard?: boolean;
}) {
  const { user, isLoading, isApproved, isActive, role, profile, profileSettled, signOut } = useAuth();

  useEffect(() => {
    if (!isLoading && user && profile && !isActive) signOut();
  }, [isLoading, user, profile, isActive, signOut]);

  // Espera o perfil resolver antes de liberar as telas: sem org_id, qualquer
  // submit cai no "Organização não carregada" (a causa raiz dos e2e flaky e do
  // clique rápido em conexão lenta). Só acontece no primeiro load da aba, com o
  // mesmo placeholder neutro do check de sessão: navegação entre rotas não
  // passa por aqui de novo porque o perfil fica no contexto.
  const aguardandoPerfil = !isLoading && !!user && !profileSettled;
  const [esperaExpirou, setEsperaExpirou] = useState(false);
  useEffect(() => {
    if (!aguardandoPerfil) return;
    const timer = setTimeout(() => setEsperaExpirou(true), PERFIL_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [aguardandoPerfil]);

  if (isLoading) {
    // Neutral, flash-free placeholder while the first session check resolves.
    // No text/spinner so route changes never flicker.
    return <div className="min-h-screen" style={{ background: "var(--via-bg)" }} aria-hidden />;
  }

  if (!user) return <Navigate to="/auth" replace />;

  if (aguardandoPerfil && !esperaExpirou) {
    return <div className="min-h-screen" style={{ background: "var(--via-bg)" }} aria-hidden />;
  }

  // Daqui em diante o perfil resolveu (ou o teto de espera venceu e rendemos
  // otimista). Approval/active checks below only run once profile is available.
  if (profile && !isActive) return <Navigate to="/auth" replace />;
  if (profile && !isApproved && !allowUnapproved) return <Navigate to="/pending-approval" replace />;
  if (allowedRoles && (!role || !allowedRoles.includes(role))) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="text-center max-w-md space-y-2">
          <h1 className="text-2xl font-semibold">Acesso Negado</h1>
          <p className="text-muted-foreground">
            Você não tem permissão para acessar esta página.
          </p>
        </div>
      </div>
    );
  }

  // Setup pendente NÃO desvia mais de rota: o assistente abre como modal sobre
  // o app (SetupWizardProvider), então o admin vê a plataforma real ao fundo e
  // pode fechar e voltar quando quiser. `skipSetupGuard` fica na assinatura por
  // compatibilidade com as rotas que já o passam.
  return <>{children}</>;
}

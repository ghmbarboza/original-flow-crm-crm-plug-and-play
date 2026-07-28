import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useSetup";
import type { AppRole } from "@/types/auth";
import { useEffect } from "react";

export function ProtectedRoute({
  children, allowedRoles, allowUnapproved = false,
  /** Rotas que nunca redirecionam para o setup (a própria /setup, por exemplo). */
  skipSetupGuard = false,
}: {
  children: React.ReactNode;
  allowedRoles?: AppRole[];
  allowUnapproved?: boolean;
  skipSetupGuard?: boolean;
}) {
  const { user, isLoading, isApproved, isActive, role, profile, signOut, isAdmin } = useAuth();
  const { data: org, isLoading: loadingOrg } = useOrganization();
  const location = useLocation();

  useEffect(() => {
    if (!isLoading && user && profile && !isActive) signOut();
  }, [isLoading, user, profile, isActive, signOut]);

  if (isLoading) {
    // Neutral, flash-free placeholder while the first session check resolves.
    // No text/spinner so route changes never flicker.
    return <div className="min-h-screen" style={{ background: "var(--via-bg)" }} aria-hidden />;
  }

  if (!user) return <Navigate to="/auth" replace />;
  // While the profile is still loading for an authenticated user, render optimistically
  // to avoid a flash of the spinner on navigation/refresh. Approval/active checks below
  // only run once profile is available.
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

  // Setup pendente: admin é levado ao wizard antes de qualquer outra tela.
  //
  // Só admin — membro comum não tem permissão para configurar a organização e
  // ficaria preso num wizard que não consegue concluir.
  //
  // Espera a org carregar antes de decidir: redirecionar com `org` ainda
  // undefined mandaria todo mundo para /setup a cada refresh.
  if (
    !skipSetupGuard &&
    isAdmin &&
    !loadingOrg &&
    org &&
    org.setup_completed !== true &&
    location.pathname !== "/setup"
  ) {
    return <Navigate to="/setup" replace />;
  }

  return <>{children}</>;
}

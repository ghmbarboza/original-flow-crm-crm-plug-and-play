import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useOrganization } from "@/hooks/useSetup";

interface SetupWizardValue {
  aberto: boolean;
  abrir: () => void;
  fechar: () => void;
}

const SetupWizardContext = createContext<SetupWizardValue | null>(null);

/**
 * Estado de abertura do assistente de configuração.
 *
 * O onboarding virou modal SOBRE a plataforma: o guard não desvia mais o admin
 * para uma tela cheia, o app carrega atrás e o assistente abre por cima. Fechar
 * ("Concluir depois") deixa o usuário no app; o progresso continua em
 * `setup_progress` e reabre por Configurações > Onboarding.
 */
export function SetupWizardProvider({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth();
  const { data: org, isLoading } = useOrganization();
  const [aberto, setAberto] = useState(false);
  // Fechou nesta sessão? Não reabrir sozinho a cada navegação.
  const [dispensado, setDispensado] = useState(false);

  useEffect(() => {
    if (dispensado || aberto) return;
    if (isLoading || !org || !isAdmin) return;
    if (org.setup_completed !== true) setAberto(true);
  }, [dispensado, aberto, isLoading, org, isAdmin]);

  const abrir = useCallback(() => {
    setDispensado(false);
    setAberto(true);
  }, []);
  const fechar = useCallback(() => {
    setDispensado(true);
    setAberto(false);
  }, []);

  const value = useMemo(() => ({ aberto, abrir, fechar }), [aberto, abrir, fechar]);
  return <SetupWizardContext.Provider value={value}>{children}</SetupWizardContext.Provider>;
}

export function useSetupWizard(): SetupWizardValue {
  const ctx = useContext(SetupWizardContext);
  if (!ctx) throw new Error("useSetupWizard precisa estar dentro de SetupWizardProvider.");
  return ctx;
}

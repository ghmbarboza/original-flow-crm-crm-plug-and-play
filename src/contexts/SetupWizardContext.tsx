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
const CHAVE_DISPENSADO = "via:setup-dispensado";

export function SetupWizardProvider({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth();
  const { data: org, isLoading } = useOrganization();
  const [aberto, setAberto] = useState(false);
  // Fechou? Não reabrir sozinho — nem em navegação, nem em refresh (sessionStorage).
  const [dispensado, setDispensado] = useState(
    () => typeof window !== "undefined" && window.sessionStorage.getItem(CHAVE_DISPENSADO) === "1",
  );

  useEffect(() => {
    if (dispensado || aberto) return;
    if (isLoading || !org || !isAdmin) return;
    if (org.setup_completed !== true) setAberto(true);
  }, [dispensado, aberto, isLoading, org, isAdmin]);

  const abrir = useCallback(() => {
    // Só admin configura a org: membro que abrir /setup por link salvo cai no
    // app normal, sem ver um assistente que ele não pode concluir (RLS barraria).
    if (!isAdmin) return;
    window.sessionStorage.removeItem(CHAVE_DISPENSADO);
    setDispensado(false);
    setAberto(true);
  }, [isAdmin]);
  const fechar = useCallback(() => {
    window.sessionStorage.setItem(CHAVE_DISPENSADO, "1");
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

import { useEffect, useRef } from "react";
import { Crosshair } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";
import { useConversations } from "@/hooks/useConversations";
import { ehPendente } from "@/hooks/useModoFoco";

/**
 * Toggle do modo foco no header do atendimento.
 *
 * O badge conta as conversas PENDENTES do agente (assumidas + não lidas) e
 * aparece nos dois modos — é justamente o convite para focar. O sidebar
 * recolhe junto com o modo e volta ao desligar; o efeito reage à mudança do
 * estado (inclusive o restaurado do localStorage no mount).
 */
export function ModoFocoToggle({
  ativo,
  onChange,
}: {
  ativo: boolean;
  onChange: (ativo: boolean) => void;
}) {
  const { user } = useAuth();
  const { data: conversations } = useConversations();
  const { setOpen } = useSidebar();

  const pendentes = (conversations ?? []).filter(
    (c) => c.assigned_to === user?.id && ehPendente(c),
  ).length;

  // Recolhe ao ENTRAR no foco (inclusive quando o mount restaura do
  // localStorage) e reabre só ao SAIR dele. Chegar à página em modo normal não
  // toca no sidebar — se o usuário o recolheu por conta própria, fica assim.
  const anterior = useRef(false);
  useEffect(() => {
    if (ativo) setOpen(false);
    else if (anterior.current) setOpen(true);
    anterior.current = ativo;
  }, [ativo, setOpen]);

  return (
    <Button
      variant={ativo ? "default" : "outline"}
      size="sm"
      className="gap-1.5"
      aria-pressed={ativo}
      onClick={() => onChange(!ativo)}
      data-testid="modo-foco-toggle"
    >
      <Crosshair className="h-4 w-4" strokeWidth={1.5} />
      {ativo ? "Modo foco" : "Modo normal"}
      {pendentes > 0 && (
        <span
          className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-semibold text-white"
          style={{ background: ativo ? "var(--via-coral-deep, #A14848)" : "var(--via-navy)" }}
          data-testid="modo-foco-badge"
        >
          {pendentes > 9 ? "9+" : pendentes}
        </span>
      )}
    </Button>
  );
}

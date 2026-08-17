import type { ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useSkipSetupStep, type SetupStepKey } from "@/hooks/useSetup";

/**
 * Pular informado.
 *
 * O princípio do produto é que TODA etapa possa ser pulada — o que não pode é
 * pular sem entender o impacto e onde retomar. Por isso o botão nunca aparece
 * sozinho: `impacto` fica visível junto dele, não escondido num tooltip.
 *
 * `children` é o botão de avançar da etapa. Os dois moram no mesmo bloco, com o
 * "Pular" ACIMA do "Avançar": lado a lado eles competiam pelo mesmo espaço e a
 * frase de impacto caía no meio do rodapé, longe do botão que ela explica.
 *
 * `antesDePular` existe para as etapas que precisam deixar um mínimo funcionando
 * (Pipeline cria um funil default) — se falhar, a etapa NÃO é marcada como
 * pulada e o usuário continua onde estava.
 */
export function PularEtapa({
  step,
  impacto,
  onPulado,
  disabled,
  antesDePular,
  children,
}: {
  step: SetupStepKey;
  impacto: string;
  onPulado: () => void;
  disabled?: boolean;
  antesDePular?: () => Promise<void>;
  children?: ReactNode;
}) {
  const pular = useSkipSetupStep();

  const executar = async () => {
    try {
      if (antesDePular) await antesDePular();
      await pular.mutateAsync({ step });
      onPulado();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível pular a etapa.");
    }
  };

  return (
    <div className="flex flex-col items-stretch gap-1.5 sm:items-end">
      <Button
        variant="ghost"
        size="sm"
        onClick={executar}
        disabled={disabled || pular.isPending}
        data-testid={`setup-skip-${step}`}
      >
        {pular.isPending ? "Pulando…" : "Pular esta etapa"}
      </Button>
      {children}
      <p className="max-w-xs text-xs sm:text-right" style={{ color: "var(--via-text-muted)" }}>
        {impacto}
      </p>
    </div>
  );
}

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookOpen } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useResetSetup } from "@/hooks/useSetup";

/**
 * Configurações > Onboarding.
 *
 * Refazer zera SÓ o progresso do assistente (`setup_progress`) e reabre /setup na
 * primeira etapa. O hook legado `useOnboarding` (tabela `onboarding_progress`)
 * saiu daqui: ele resetava uma tabela morta e mandava o usuário para a última
 * etapa, dando a impressão de que o refazer não funcionava.
 */
export default function OnboardingSettings() {
  const reiniciar = useResetSetup();
  const navigate = useNavigate();

  const handleReset = async () => {
    try {
      await reiniciar.mutateAsync();
      toast.success("Assistente reaberto na primeira etapa.");
      navigate("/setup");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível reiniciar o assistente.");
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-10 flex flex-col items-center text-center gap-3">
          <div className="rounded-full bg-muted p-4">
            <BookOpen className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground max-w-md">
            Refazer o onboarding reabre o assistente de configuração na primeira etapa, já
            preenchido com os dados atuais da sua empresa. <strong>Nada é apagado</strong>: o
            assistente grava no mesmo registro que estas Configurações, então salvar ali apenas
            sobrescreve o que você mudar.
          </p>
          <p className="text-sm text-muted-foreground max-w-md">
            Todas as etapas podem ser puladas — cada uma explica o impacto de pular e onde
            configurar depois.
          </p>
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={reiniciar.isPending}
            className="mt-2"
          >
            {reiniciar.isPending ? "Reabrindo…" : "Refazer onboarding"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

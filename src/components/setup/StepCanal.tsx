import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ProviderWizard } from "@/components/whatsapp/ProviderWizard";
import { useSaveSetupStep } from "@/hooks/useSetup";

/**
 * Etapa de canal: reusa o ProviderWizard do Sprint 7 inteiro.
 *
 * Não duplica nem adapta a lógica de conexão — Evolution, Meta e Zernio já têm
 * fluxos próprios funcionando ali, e reescrevê-los para o setup criaria duas
 * implementações para divergir.
 */
export function StepCanal({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const salvarEtapa = useSaveSetupStep();

  const concluir = async (pulou: boolean) => {
    try {
      await salvarEtapa.mutateAsync({ step: "canal" });
      if (pulou) toast.info("Você pode conectar um canal depois em Configurações > Canais.");
      onNext();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-2xl font-medium" style={{ color: "var(--via-text-primary)" }}>
          Como seus clientes vão falar com você?
        </h2>
        <p className="mt-1 text-sm" style={{ color: "var(--via-text-body)" }}>
          Conecte um canal agora ou deixe para depois — isso não bloqueia o resto da plataforma.
        </p>
      </div>

      <ProviderWizard onDone={() => concluir(false)} />

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack} disabled={salvarEtapa.isPending}>Voltar</Button>
        <Button
          variant="ghost"
          onClick={() => concluir(true)}
          disabled={salvarEtapa.isPending}
          data-testid="setup-skip-channel"
        >
          Configurar depois
        </Button>
      </div>
    </div>
  );
}

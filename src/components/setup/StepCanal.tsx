import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProviderWizard } from "@/components/whatsapp/ProviderWizard";
import { useSaveSetupStep, useSkipSetupStep } from "@/hooks/useSetup";

/**
 * Etapa de canal: reusa o ProviderWizard do Sprint 7 inteiro.
 *
 * Não duplica nem adapta a lógica de conexão — Evolution, Meta e Zernio já têm
 * fluxos próprios funcionando ali, e reescrevê-los para o setup criaria duas
 * implementações para divergir.
 */
export function StepCanal({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const salvarEtapa = useSaveSetupStep();
  const pularEtapa = useSkipSetupStep();

  const concluir = async (pulou: boolean) => {
    try {
      // Pular grava `pulado:canal` em vez de `canal`: o checklist final precisa
      // continuar mostrando esta etapa como pendente.
      if (pulou) await pularEtapa.mutateAsync({ step: "canal" });
      else await salvarEtapa.mutateAsync({ step: "canal" });
      if (pulou) toast.info("Você pode conectar um canal depois em Configurações > Integrações > Canais.");
      onNext();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    }
  };

  const ocupado = salvarEtapa.isPending || pularEtapa.isPending;

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-2xl font-medium" style={{ color: "var(--via-text-primary)" }}>
            Como seus clientes vão falar com você?
          </h2>
          <Badge variant="secondary">Essencial para atender</Badge>
        </div>
        <p className="mt-1 text-sm" style={{ color: "var(--via-text-body)" }}>
          Sem canal conectado a IA não atende ninguém. Conecte agora ou deixe para depois em
          Configurações &gt; Canais — isso não bloqueia o resto da plataforma.
        </p>
      </div>

      <ProviderWizard onDone={() => concluir(false)} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <Button variant="outline" onClick={onBack} disabled={ocupado}>Voltar</Button>
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <Button
            variant="ghost"
            onClick={() => concluir(true)}
            disabled={ocupado}
            data-testid="setup-skip-channel"
          >
            Configurar depois
          </Button>
          <p className="max-w-xs text-xs sm:text-right" style={{ color: "var(--via-text-muted)" }}>
            Até conectar um canal, a IA não recebe nem responde mensagens. Você conecta depois em
            Configurações &gt; Canais.
          </p>
        </div>
      </div>
    </div>
  );
}

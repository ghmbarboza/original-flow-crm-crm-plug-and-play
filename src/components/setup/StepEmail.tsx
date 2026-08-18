import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { GmailSetup } from "@/components/settings/GmailSetup";
import { PularEtapa } from "@/components/setup/PularEtapa";
import { useSaveSetupStep } from "@/hooks/useSetup";
import { useEmailConnection } from "@/hooks/useEmailConnection";

/**
 * Etapa de e-mail: reusa o GmailSetup de Configurações > Integrações inteiro.
 *
 * Mesma decisão do canal, que reusa o ProviderWizard: duas implementações do
 * mesmo cadastro divergiriam na primeira correção feita só de um lado.
 */
export function StepEmail({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const salvarEtapa = useSaveSetupStep();
  const { data: conexao } = useEmailConnection();

  const avancar = async () => {
    try {
      await salvarEtapa.mutateAsync({ step: "email" });
      onNext();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-2xl font-medium" style={{ color: "var(--via-text-primary)" }}>
          Seus e-mails no mesmo lugar
        </h2>
        <p className="mt-1 text-sm" style={{ color: "var(--via-text-body)" }}>
          Conectando o Gmail, as conversas por e-mail entram no histórico do contato e você
          responde de dentro do CRM — sem alternar entre abas.
        </p>
      </div>

      <GmailSetup conectado={!!conexao} />

      <div className="flex flex-wrap items-end justify-between gap-3 pt-2">
        <Button variant="outline" onClick={onBack} disabled={salvarEtapa.isPending}>Voltar</Button>
        <PularEtapa
          step="email"
          impacto="Sem e-mail conectado, o CRM segue completo no WhatsApp. Você conecta depois em Configurações > Integrações."
          onPulado={onNext}
          disabled={salvarEtapa.isPending}
        >
          <Button onClick={avancar} disabled={salvarEtapa.isPending} data-testid="setup-email-next">
            {salvarEtapa.isPending ? "Salvando…" : "Continuar"}
          </Button>
        </PularEtapa>
      </div>
    </div>
  );
}

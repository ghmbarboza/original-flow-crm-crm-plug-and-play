import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { GmailSetup } from "@/components/settings/GmailSetup";
import { CredenciaisServico } from "@/components/settings/CredenciaisServico";
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
          Dois caminhos, e dá para usar os dois: o Gmail traz suas conversas para o histórico do
          contato e responde de dentro do CRM; o Resend manda notificações, automações e sequências
          em nome da empresa, de um domínio seu.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>Gmail: sua conta</p>
        <GmailSetup conectado={!!conexao} />
      </div>

      <div className="space-y-2 border-t pt-4" style={{ borderColor: "var(--via-border)" }} data-testid="setup-email-resend">
        <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>Resend: e-mail em nome da empresa (opcional)</p>
        <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
          Crie a chave em resend.com. Remetente e verificação do domínio ficam em Configurações &gt; E-mail.
        </p>
        <CredenciaisServico campos={[{ service: "resend", label: "Chave de API do Resend", secreto: true, placeholder: "re_..." }]} testIdPrefix="setup-resend" mensagemSalvo="Chave do Resend salva." />
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3 pt-2">
        <Button variant="outline" onClick={onBack} disabled={salvarEtapa.isPending}>Voltar</Button>
        <PularEtapa
          step="email"
          impacto="Sem e-mail conectado, o CRM segue completo no WhatsApp. Gmail e Resend ficam em Configurações > Integrações quando quiser."
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

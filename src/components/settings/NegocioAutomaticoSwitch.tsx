import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { useOrganization, useUpdateOrganization } from "@/hooks/useSetup";

/**
 * Liga/desliga a abertura automática de negócio a cada conversa nova.
 *
 * Vem ligado: sem isso o lead entra pelo WhatsApp, conversa com a IA e o funil
 * continua vazio, porque negócio só nascia de alguém criar à mão.
 *
 * O custo de deixar ligado é real e por isso está escrito na tela: todo "oi"
 * abre um negócio, inclusive engano e suporte, e a taxa de conversão cai porque
 * o denominador cresce. Quem quiser o funil só com oportunidades qualificadas
 * desliga aqui — a criação por intenção de compra continua valendo.
 */
export function NegocioAutomaticoSwitch() {
  const { data: org } = useOrganization();
  const salvar = useUpdateOrganization();
  const ativo = org?.auto_create_deal_on_conversation ?? true;

  const alternar = async (valor: boolean) => {
    try {
      await salvar.mutateAsync({ auto_create_deal_on_conversation: valor });
      toast.success(
        valor
          ? "Conversas novas passam a abrir negócio na primeira etapa."
          : "Conversas novas não abrem mais negócio automaticamente.",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    }
  };

  return (
    <div className="via-card flex items-start justify-between gap-3 p-4">
      <div>
        <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
          Abrir negócio a cada conversa nova
        </p>
        <p className="mt-0.5 max-w-xl text-xs" style={{ color: "var(--via-text-muted)" }}>
          Cada contato que chamar pela primeira vez entra no funil, na primeira etapa. Um
          contato nunca tem dois negócios abertos ao mesmo tempo. Desligado, o negócio é criado
          à mão ou quando a IA detecta intenção de compra.
        </p>
      </div>
      <Switch
        aria-label="Abrir negócio a cada conversa nova"
        checked={ativo}
        disabled={salvar.isPending}
        onCheckedChange={alternar}
        data-testid="toggle-negocio-automatico"
      />
    </div>
  );
}

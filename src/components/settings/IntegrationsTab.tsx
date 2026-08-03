import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowRight, AudioLines, CalendarCheck2, Mail, MessageSquare, Plug,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAIConfig } from "@/hooks/useAIConfig";
import { useOrgApiKey } from "@/hooks/useOrgApiKey";
import { useCalcomConfig } from "@/hooks/useCalcom";
import { useChannelStatus } from "@/hooks/useChannelStatus";
import { useEmailConnection } from "@/hooks/useEmailConnection";
import { useErpConfig, useSaveErpConfig } from "@/hooks/useErpIntegration";
import { IntegrationCard, type StatusIntegracao } from "@/components/settings/IntegrationCard";
import { ApiKeysList } from "@/components/settings/ApiKeysList";
import { NewApiKeyButton } from "@/components/settings/NewApiKeyButton";
import ChannelsSettings from "@/components/settings/ChannelsSettings";
import CalcomSettings from "@/components/settings/CalcomSettings";
import ErpSettings from "@/components/settings/ErpSettings";

/**
 * Configurações > Integrações.
 *
 * Tudo colapsado por padrão e ordenado por importância para quem está começando
 * (Canais → Voz → E-mail → Agendamento → ERP). Status vem sempre de hooks que
 * leem o estado real; nenhum card diz "conectado" por ter sido visitado.
 * `?integration=<id>` abre um card específico (navegação direcionada).
 *
 * Chaves de API não são uma seção: só um botão discreto no topo e, quando
 * existem chaves, a lista compacta no fim da página.
 */
export default function IntegrationsTab() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const alvo = params.get("integration");

  const canal = useChannelStatus();
  const { data: email } = useEmailConnection();
  const { data: aiConfig } = useAIConfig();
  const { data: temChaveVoz } = useOrgApiKey("elevenlabs");
  const { data: calcom } = useCalcomConfig();
  const { data: erp } = useErpConfig();
  const salvarErp = useSaveErpConfig();

  // Voz: a chave sozinha não faz a agente falar — o estado intermediário precisa
  // aparecer, senão o usuário acha que terminou.
  const voz: { status: StatusIntegracao; label: string } = temChaveVoz
    ? aiConfig?.voice_enabled
      ? { status: "ok", label: "Configurada" }
      : { status: "pendente", label: "Chave salva, voz desativada" }
    : { status: "ausente", label: "Não configurada" };

  const temLinkCalcom = !!calcom?.config.scheduling_link?.trim();

  const alternarErp = async (ativo: boolean) => {
    try {
      await salvarErp.mutateAsync({ is_active: ativo });
      toast.success(ativo ? "Integração ERP ativada." : "Integração ERP desativada.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <NewApiKeyButton />
      </div>

      <IntegrationCard
        icon={MessageSquare}
        title="Canais de atendimento (WhatsApp, Instagram…)"
        purpose="É por aqui que a IA atende: sem canal conectado, nenhuma mensagem entra nem sai."
        recomendacao="essencial"
        status={canal.estado === "conectado" ? "ok" : canal.estado === "aguardando_pareamento" ? "pendente" : "ausente"}
        statusLabel={canal.label}
        abrirPorPadrao={alvo === "channels"}
        testId="integration-channels"
      >
        <div className="space-y-3">
          {canal.detalhe && (
            <p className="text-sm" style={{ color: "var(--via-text-body)" }}>
              {canal.detalhe}
            </p>
          )}
          <ChannelsSettings />
        </div>
      </IntegrationCard>

      <IntegrationCard
        icon={AudioLines}
        title="Voz da agente — ElevenLabs"
        purpose="Sua agente ouve áudios e responde com voz natural no WhatsApp."
        recomendacao="recomendado"
        status={voz.status}
        statusLabel={voz.label}
        abrirPorPadrao={alvo === "elevenlabs"}
        testId="integration-elevenlabs"
      >
        <div className="space-y-3">
          <p className="text-sm" style={{ color: "var(--via-text-body)" }}>
            Áudios recebidos são transcritos sempre que houver chave. Para a agente também
            responder falando, salve a chave do ElevenLabs, escolha a voz e ative a resposta em
            áudio.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => navigate("/settings/ia#voz-da-agente")}
            data-testid="integrations-goto-voice"
          >
            Abrir Voz da agente
            <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
          </Button>
        </div>
      </IntegrationCard>

      <IntegrationCard
        icon={Mail}
        title="E-mail (Gmail)"
        purpose="Sincroniza suas conversas de e-mail no Inbox e permite responder de dentro do CRM."
        recomendacao="recomendado"
        status={email ? "ok" : "ausente"}
        statusLabel={email ? "Conectado" : "Não conectado"}
        abrirPorPadrao={alvo === "gmail"}
        testId="integration-gmail"
      >
        <div className="space-y-3">
          <p className="text-sm" style={{ color: "var(--via-text-body)" }}>
            A conexão do Gmail é feita no Inbox, junto das conversas.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => navigate("/inbox")}
            data-testid="integrations-goto-inbox"
          >
            {email ? "Abrir Inbox" : "Conectar no Inbox"}
            <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
          </Button>
        </div>
      </IntegrationCard>

      <IntegrationCard
        icon={CalendarCheck2}
        title="Agendamento — Cal.com"
        purpose="A IA oferece seu link de reunião e cada agendamento confirmado vira atividade no CRM."
        recomendacao="recomendado"
        status={temLinkCalcom ? "ok" : "ausente"}
        statusLabel={temLinkCalcom ? "Configurado" : "Não configurado"}
        abrirPorPadrao={alvo === "calcom"}
        testId="integration-calcom"
      >
        <CalcomSettings />
      </IntegrationCard>

      <IntegrationCard
        icon={Plug}
        title="Conectividade ERP"
        purpose="Mantém contatos, negócios e pedidos em sincronia com seu sistema de gestão, nos dois sentidos."
        recomendacao="opcional"
        status={erp?.is_active ? "ok" : "ausente"}
        statusLabel={erp?.is_active ? "Ativo" : "Desativado"}
        abrirPorPadrao={alvo === "erp"}
        testId="integration-erp"
        headerAction={
          <Switch
            aria-label="Ativar a integração ERP"
            checked={!!erp?.is_active}
            onCheckedChange={alternarErp}
            data-testid="erp-ativo-header"
          />
        }
      >
        <ErpSettings />
      </IntegrationCard>

      <ApiKeysList />
    </div>
  );
}

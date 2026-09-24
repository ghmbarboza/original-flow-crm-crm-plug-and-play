import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowRight, AudioLines, CalendarCheck2, CalendarDays, Database, History, Mail, MessageSquare, PhoneCall, Plug, Webhook,
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
import { useConversationImports } from "@/hooks/useConversationImport";
import { IntegrationCard, type StatusIntegracao } from "@/components/settings/IntegrationCard";
import { ApiKeysList } from "@/components/settings/ApiKeysList";
import { NewApiKeyButton } from "@/components/settings/NewApiKeyButton";
import ChannelsSettings from "@/components/settings/ChannelsSettings";
import { ApiKeyTutorialDialog } from "@/components/settings/ApiKeyTutorialDialog";
import { DesconectarIntegracao } from "@/components/settings/DesconectarIntegracao";
import { useDisconnectChannel } from "@/hooks/useWhatsAppConfig";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { erroDeFunction } from "@/integrations/supabase/functionError";
import CalcomSettings from "@/components/settings/CalcomSettings";
import ErpSettings from "@/components/settings/ErpSettings";
import WebhooksSettings from "@/components/settings/WebhooksSettings";
import { useWebhookEndpoints, useWebhookInboundKeys } from "@/hooks/useWebhooks";
import ImportHistorySettings from "@/components/settings/ImportHistorySettings";
import { CredenciaisServico, useCredenciaisProntas } from "@/components/settings/CredenciaisServico";

const CALLBACK_NYLAS = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/calendar-oauth-callback`;
const CALLBACK_SALESFORCE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/crm-oauth-callback`;

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
 *
 * Regra da casa: TODA credencial de serviço externo (ElevenLabs, Twilio, Nylas,
 * Salesforce…) é cadastrada aqui. As telas de uso (Voz, Agenda, Importação)
 * mostram só o estado e apontam para o card correspondente.
 */
export default function IntegrationsTab() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const alvo = params.get("integration");

  const canal = useChannelStatus();
  const { data: email } = useEmailConnection();
  const { data: aiConfig } = useAIConfig();
  const { data: temChaveVoz } = useOrgApiKey("elevenlabs");
  const twilioPronto = useCredenciaisProntas(["twilio_account_sid", "twilio_auth_token"]);
  const nylasPronto = useCredenciaisProntas(["nylas_client_id", "nylas_api_key"]);
  const salesforcePronto = useCredenciaisProntas(["salesforce_client_id", "salesforce_client_secret"]);
  const { data: calcom } = useCalcomConfig();
  const { data: erp } = useErpConfig();
  const salvarErp = useSaveErpConfig();
  const { data: importacoes } = useConversationImports();
  const { data: destinosWebhook } = useWebhookEndpoints();
  const { data: chavesWebhook } = useWebhookInboundKeys();
  const totalWebhooks =
    (destinosWebhook ?? []).filter((d) => d.is_active).length + (chavesWebhook ?? []).filter((k) => k.is_active).length;

  const totalImportacoes = (importacoes ?? []).filter((i) => i.status === "completed").length;

  const desconectar = useDisconnectChannel();
  const queryClient = useQueryClient();

  const desconectarCanal = async () => {
    try {
      await desconectar.mutateAsync();
      toast.success("Canal desconectado. Nenhuma mensagem entra ou sai até reconectar.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível desconectar.");
    }
  };

  /** Mesma remoção da lista de chaves — a do Vault, por organização. */
  const removerChaveVoz = async () => {
    const { error } = await supabase.functions.invoke("delete-api-key", {
      body: { service_name: "elevenlabs" },
    });
    if (error) {
      toast.error((await erroDeFunction(error, "Falha ao remover a chave.")).message);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["org-api-key"] });
    toast.success("Chave removida. A agente volta a atender só por texto.");
  };

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

          {canal.estado !== "nao_conectado" && (
            <DesconectarIntegracao
              titulo="Desconectar o canal de atendimento?"
              consequencia="O CRM para de receber e de responder mensagens neste canal — a IA fica muda e nada entra no inbox. A configuração e o histórico ficam salvos, e a instância continua pareada no seu servidor: para voltar, basta escolher o provedor de novo."
              onConfirmar={desconectarCanal}
              disabled={desconectar.isPending}
              testId="desconectar-canal"
            />
          )}
        </div>
      </IntegrationCard>

      <IntegrationCard
        icon={AudioLines}
        title="ElevenLabs: voz da agente e ligações"
        purpose="Sua agente ouve áudios, responde com voz natural no WhatsApp e, com um número Twilio, atende e faz ligações."
        recomendacao="recomendado"
        status={voz.status}
        statusLabel={voz.label}
        abrirPorPadrao={alvo === "elevenlabs"}
        testId="integration-elevenlabs"
      >
        <div className="space-y-3">
          <p className="text-sm" style={{ color: "var(--via-text-body)" }}>
            Áudios recebidos são transcritos sempre que houver chave. Para a agente também
            responder falando, salve a chave, escolha a voz em Configurações &gt; IA e ative a
            resposta em áudio. Para ligações por telefone, a mesma chave precisa do Conversational AI liberado.
          </p>
          <CredenciaisServico campos={[{ service: "elevenlabs", label: "Chave de API do ElevenLabs", secreto: true, placeholder: "sk_..." }]} testIdPrefix="integration-elevenlabs" mensagemSalvo="Chave do ElevenLabs guardada no Vault." />
          <div className="flex flex-wrap items-center gap-3">
            {/* O passo a passo existia só dentro de Configurações > IA. Quem
                chegava por Integrações via o card sem nenhuma instrução. */}
            <ApiKeyTutorialDialog service="elevenlabs" />
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
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate("/voz")} data-testid="integrations-goto-calls">
              Abrir Ligações
              <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
            </Button>
            {voz.status === "ok" && (
              <DesconectarIntegracao
                titulo="Remover a chave do ElevenLabs?"
                consequencia="A agente deixa de transcrever os áudios recebidos e de responder falando. As conversas e as vozes já escolhidas continuam salvas; é só cadastrar a chave de novo para voltar."
                rotulo="Remover chave"
                onConfirmar={removerChaveVoz}
                testId="desconectar-elevenlabs"
              />
            )}
          </div>
        </div>
      </IntegrationCard>

      <IntegrationCard
        icon={PhoneCall}
        title="Ligações por telefone: Twilio"
        purpose="Números de telefone da empresa. A IA atende e liga por eles, com transcrição e resumo na ficha do contato."
        recomendacao="opcional"
        status={twilioPronto ? "ok" : "ausente"}
        statusLabel={twilioPronto ? "Credenciais cadastradas" : "Não configurado"}
        abrirPorPadrao={alvo === "twilio"}
        testId="integration-twilio"
      >
        <div className="space-y-3">
          <p className="text-sm" style={{ color: "var(--via-text-body)" }}>
            No console do Twilio, copie o Account SID e o Auth Token. Depois, em Voz &gt; Números, importe um número
            que você já tem ou compre um novo. Número brasileiro exige bundle regulatório no Twilio; conta de teste só
            liga para números verificados.
          </p>
          <CredenciaisServico
            campos={[
              { service: "twilio_account_sid", label: "Account SID", placeholder: "AC..." },
              { service: "twilio_auth_token", label: "Auth Token", secreto: true },
            ]}
            testIdPrefix="integration-twilio"
            mensagemSalvo="Credenciais do Twilio salvas."
          />
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate("/voz?secao=numeros")} data-testid="integrations-goto-numbers">
            Abrir Voz &gt; Números
            <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
          </Button>
        </div>
      </IntegrationCard>

      <IntegrationCard
        icon={Mail}
        title="E-mail (Resend e Gmail)"
        purpose="Por onde os e-mails da empresa saem: notificações, automações, sequências e respostas do inbox."
        recomendacao="recomendado"
        status={email ? "ok" : "ausente"}
        statusLabel={email ? "Gmail conectado" : "Não configurado"}
        abrirPorPadrao={alvo === "gmail"}
        testId="integration-gmail"
      >
        <p className="text-sm" style={{ color: "var(--via-text-body)" }}>
          A configuração de e-mail tem aba própria.
        </p>
        <Button variant="outline" className="mt-2" onClick={() => navigate("/settings/email")} data-testid="integration-gmail-open">
          Abrir Configurações de E-mail
        </Button>
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
        icon={CalendarDays}
        title="Calendário: Nylas (Google Calendar e Outlook)"
        purpose="Cada pessoa conecta o próprio calendário; as reuniões da IA entram nele e horários ocupados ficam indisponíveis."
        recomendacao="recomendado"
        status={nylasPronto ? "ok" : "ausente"}
        statusLabel={nylasPronto ? "Credenciais cadastradas" : "Não configurado"}
        abrirPorPadrao={alvo === "nylas"}
        testId="integration-nylas"
      >
        <div className="space-y-3">
          <p className="text-sm" style={{ color: "var(--via-text-body)" }}>
            No painel do Nylas, crie um aplicativo, cadastre este endereço como Callback URI e copie o Client ID e a API Key:
            {" "}<code className="break-all text-xs">{CALLBACK_NYLAS}</code>
          </p>
          <CredenciaisServico
            campos={[
              { service: "nylas_client_id", label: "Client ID" },
              { service: "nylas_api_key", label: "API Key", secreto: true },
            ]}
            testIdPrefix="integration-nylas"
            mensagemSalvo="Credenciais do Nylas salvas."
          />
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate("/settings/agenda")} data-testid="integrations-goto-agenda">
            Conectar meu calendário em Agenda
            <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
          </Button>
        </div>
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

      <IntegrationCard
        icon={Database}
        title="Salesforce: app conectado"
        purpose="Credenciais do Connected App para trazer contas, contatos e oportunidades do Salesforce na migração."
        recomendacao="opcional"
        status={salesforcePronto ? "ok" : "ausente"}
        statusLabel={salesforcePronto ? "Credenciais cadastradas" : "Não configurado"}
        abrirPorPadrao={alvo === "salesforce"}
        testId="integration-salesforce"
      >
        <div className="space-y-3">
          <p className="text-sm" style={{ color: "var(--via-text-body)" }}>
            No Connected App, use este endereço como Callback URL:
            {" "}<code className="break-all text-xs">{CALLBACK_SALESFORCE}</code>. HubSpot, Pipedrive, RD Station, Agendor e
            Kommo usam token direto na tela de importação.
          </p>
          <CredenciaisServico
            campos={[
              { service: "salesforce_client_id", label: "Consumer Key" },
              { service: "salesforce_client_secret", label: "Consumer Secret", secreto: true },
            ]}
            testIdPrefix="integration-salesforce"
            mensagemSalvo="Credenciais do Salesforce salvas. Agora autorize a conta na importação."
          />
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate("/settings/importacao?secao=crm")} data-testid="integrations-goto-crm">
            Autorizar em Importação &gt; Conectar CRM
            <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
          </Button>
        </div>
      </IntegrationCard>

      <IntegrationCard
        icon={Webhook}
        title="Webhooks: outras soluções, n8n e Make"
        purpose="Conecta o CRM a qualquer sistema: envia os eventos do CRM e recebe leads, contratos, pagamentos e agendamentos."
        recomendacao="opcional"
        status={totalWebhooks > 0 ? "ok" : "ausente"}
        statusLabel={totalWebhooks > 0 ? `${totalWebhooks} conexão(ões) ativa(s)` : "Nenhuma conexão"}
        abrirPorPadrao={alvo === "webhooks"}
        testId="integration-webhooks"
      >
        <WebhooksSettings />
      </IntegrationCard>

      <IntegrationCard
        icon={History}
        title="Importar histórico — outras ferramentas"
        purpose="Traga conversas de outras plataformas de atendimento via CSV."
        recomendacao="opcional"
        status={totalImportacoes > 0 ? "ok" : "ausente"}
        statusLabel={
          totalImportacoes > 0 ? `${totalImportacoes} importação(ões)` : "Nenhuma importação"
        }
        abrirPorPadrao={alvo === "import-history"}
        testId="integration-import-history"
      >
        <ImportHistorySettings />
      </IntegrationCard>

      <ApiKeysList />
    </div>
  );
}

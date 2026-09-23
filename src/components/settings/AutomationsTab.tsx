import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AutomationsSettings from "@/components/settings/AutomationsSettings";
import PipelineSettings from "@/components/settings/PipelineSettings";
import SequencesSettings from "@/components/settings/SequencesSettings";
import FollowupSettings from "@/components/settings/FollowupSettings";
import { HistoricoSettings } from "@/components/settings/HistoricoSettings";
import { NegocioAutomaticoSwitch } from "@/components/settings/NegocioAutomaticoSwitch";

const SECOES = ["regras", "funil", "cadencias"] as const;
type Secao = (typeof SECOES)[number];

/**
 * Configurações > Automações — lugar único para tudo que roda sozinho.
 * Antes eram quatro abas irmãs (Automações, Pipeline, Sequências, Follow-up);
 * o usuário não tinha onde ver o conjunto. Nada de motor mudou: só a navegação.
 * Deep-link: ?secao=regras|funil|cadencias (as rotas antigas redirecionam aqui).
 */
export default function AutomationsTab() {
  const [params, setParams] = useSearchParams();
  const alvo = params.get("secao");
  const secao: Secao = (SECOES as readonly string[]).includes(alvo ?? "") ? (alvo as Secao) : "regras";

  const trocar = (valor: string) => {
    const proximos = new URLSearchParams(params);
    proximos.set("secao", valor);
    setParams(proximos, { replace: true });
  };

  return (
    <Tabs value={secao} onValueChange={trocar} className="space-y-4">
      <TabsList>
        <TabsTrigger data-testid="automations-section" value="regras">Regras</TabsTrigger>
        <TabsTrigger data-testid="automations-section" value="funil">Funil</TabsTrigger>
        <TabsTrigger data-testid="automations-section" value="cadencias">Cadências</TabsTrigger>
      </TabsList>

      <TabsContent value="regras" className="space-y-2">
        <SecaoTitulo
          titulo="Regras de gatilho e ação"
          descricao="Quando algo acontece no CRM, a plataforma executa a ação que você definir."
        />
        <AutomationsSettings />
      </TabsContent>

      <TabsContent value="funil" className="space-y-6">
        <div className="space-y-2">
          <SecaoTitulo
            titulo="Entrada no funil"
            descricao="O que acontece quando uma conversa nova chega pelo atendimento."
          />
          <NegocioAutomaticoSwitch />
        </div>
        <div className="space-y-2">
          <SecaoTitulo
            titulo="Histórico automático"
            descricao="O que entra sozinho na linha do tempo do negócio e do contato, e por quem."
          />
          <HistoricoSettings />
        </div>
        <SecaoTitulo
          titulo="Por etapa do funil"
          descricao="O que acontece automaticamente quando um negócio entra em cada etapa."
        />
        <PipelineSettings />
      </TabsContent>

      <TabsContent value="cadencias" className="space-y-8">
        <div className="space-y-2">
          <SecaoTitulo
            titulo="Sequências de e-mail"
            descricao="Série de e-mails em etapas, com inscrição de contatos e intervalo próprio."
          />
          <SequencesSettings />
        </div>
        <div className="space-y-2">
          <SecaoTitulo
            titulo="Follow-up de WhatsApp"
            descricao="Régua de mensagens automáticas para reengajar conversas sem resposta."
          />
          <FollowupSettings />
        </div>
      </TabsContent>
    </Tabs>
  );
}

function SecaoTitulo({ titulo, descricao }: { titulo: string; descricao: string }) {
  return (
    <div>
      <h3 className="text-base font-semibold" style={{ color: "var(--via-text-primary)" }}>{titulo}</h3>
      <p className="text-sm text-muted-foreground">{descricao}</p>
    </div>
  );
}

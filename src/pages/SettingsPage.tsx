import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import GeneralSettings from "@/components/settings/GeneralSettings";
import SecuritySettings from "@/components/settings/SecuritySettings";
import IntegrationsTab from "@/components/settings/IntegrationsTab";
import AutomationsTab from "@/components/settings/AutomationsTab";
import EquipeSettings from "@/components/settings/EquipeSettings";
import DemonstrationSettings from "@/components/settings/DemonstrationSettings";
import OnboardingSettings from "@/components/settings/OnboardingSettings";
import AISettings from "@/components/settings/AISettings";
import NotificationsTab from "@/components/settings/NotificationsTab";
import CaptureFormsSettings from "@/components/settings/CaptureFormsSettings";
import EmailSettings from "@/components/settings/EmailSettings";
import ApiSettings from "@/components/settings/ApiSettings";
import ImportSettings from "@/components/settings/ImportSettings";
import AtendimentoSettings from "@/components/settings/AtendimentoSettings";
import CampaignsPage from "@/pages/CampaignsPage";
import LibraryPage from "@/pages/LibraryPage";
import { useAuth } from "@/hooks/useAuth";

const VALID_TABS = ["general", "notifications", "security", "atendimento", "integrations", "email", "api", "importacao", "capture", "ia", "automations", "campaigns", "library", "team", "demonstration", "onboarding"] as const;
type Tab = (typeof VALID_TABS)[number];

const TAB_META: Record<Tab, { title: string; description: string }> = {
  general: {
    title: "Geral",
    description: "Gerencie suas informações pessoais utilizadas na plataforma.",
  },
  notifications: {
    title: "Notificações",
    description: "O que cada pessoa recebe, por onde (app, e-mail, WhatsApp) e o texto de cada aviso.",
  },
  security: {
    title: "Segurança",
    description: "Controle como novos usuários acessam a plataforma e quais domínios são permitidos.",
  },
  email: {
    title: "E-mail",
    description: "Por onde os e-mails da empresa saem: Resend em nome da empresa ou a conta do Gmail conectada.",
  },
  integrations: {
    title: "Integrações",
    description: "Conecte serviços externos cadastrando chaves de API utilizadas pela plataforma.",
  },
  api: {
    title: "API",
    description: "Acesso de outras ferramentas e soluções ao CRM: chaves com escopos, chamadas recentes e documentação.",
  },
  importacao: {
    title: "Importação",
    description: "Traga contatos, empresas, negócios e atividades de outro CRM ou planilha, com de/para de colunas e etapas.",
  },
  capture: {
    title: "Formulários",
    description: "Formulários de captura: página própria ou embed no site, com origem por UTM, campos condicionais e destino no funil.",
  },
  atendimento: {
    title: "Atendimento",
    description: "Respostas rápidas do inbox — as mensagens que o time usa todo dia, a um / de distância.",
  },
  ia: {
    title: "IA",
    description: "Configure a personalidade, a base de conhecimento e o comportamento do atendimento por IA no WhatsApp.",
  },
  automations: {
    title: "Automações",
    description: "Tudo que roda sozinho no CRM: regras de gatilho, automações por etapa do funil e cadências de mensagens.",
  },
  campaigns: {
    title: "Campanhas",
    description: "Disparos em massa pelo WhatsApp oficial e os templates aprovados pela Meta.",
  },
  library: {
    title: "Biblioteca de Modelos",
    description: "Modelos validados em mercado, prontos para ativar e personalizar.",
  },
  team: {
    title: "Equipe",
    description: "Aprove, gerencie permissões e acompanhe os membros da sua equipe.",
  },
  demonstration: {
    title: "Demonstração",
    description: "Popule a plataforma com dados fictícios para visualizar como ela funciona antes de usar com dados reais.",
  },
  onboarding: {
    title: "Onboarding",
    description: "Configure ou refaça o onboarding da plataforma.",
  },
};

function getTabFromPath(pathname: string): Tab {
  const segment = pathname.replace(/^\/settings\/?/, "").split("/")[0];
  return (VALID_TABS as readonly string[]).includes(segment) ? (segment as Tab) : "general";
}

export default function SettingsPage() {
  const { isAdmin } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  // Canais foi fundida em Integrações: o link antigo continua valendo e abre o
  // card de Canais já expandido.
  const segmento = pathname.replace(/^\/settings\/?/, "").split("/")[0];
  if (segmento === "channels") {
    return <Navigate to="/settings/integrations?integration=channels" replace />;
  }
  // Pipeline, Sequências e Follow-up foram fundidas na aba Automações: as rotas
  // antigas continuam valendo e abrem a seção correspondente.
  const SECAO_LEGADA: Record<string, string> = {
    pipeline: "funil",
    sequences: "cadencias",
    "follow-up": "cadencias",
  };
  if (SECAO_LEGADA[segmento]) {
    return <Navigate to={`/settings/automations?secao=${SECAO_LEGADA[segmento]}`} replace />;
  }

  const activeTab = getTabFromPath(pathname);
  const meta = TAB_META[activeTab];

  const handleChange = (value: string) => {
    navigate(value === "general" ? "/settings" : `/settings/${value}`);
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <h1 className="text-3xl font-medium tracking-tight">Configurações</h1>
        <Tabs value={activeTab} onValueChange={handleChange}>
          {/* Ordem definida na validação de UX de 2026-07-30: conta e acesso
              primeiro (Geral, Segurança, Equipe, Notificações), integração no
              meio, operação (IA, Follow-up) depois, e utilitários no fim. */}
          <TabsList>
            <TabsTrigger data-testid="settings-tab" value="general">Geral</TabsTrigger>
            {isAdmin && <TabsTrigger data-testid="settings-tab" value="security">Segurança</TabsTrigger>}
            {/* Equipe visível a todos: o conteúdo se auto-restringe por papel
                (supervisão para gerente/diretor, gestão só para admin) — é o
                gating que /team tinha antes de virar aba. */}
            <TabsTrigger data-testid="settings-tab" value="team">Equipe</TabsTrigger>
            <TabsTrigger data-testid="settings-tab" value="notifications">Notificações</TabsTrigger>
            {isAdmin && <TabsTrigger data-testid="settings-tab" value="integrations">Integrações</TabsTrigger>}
            {isAdmin && <TabsTrigger data-testid="settings-tab" value="email">E-mail</TabsTrigger>}
            {isAdmin && <TabsTrigger data-testid="settings-tab" value="api">API</TabsTrigger>}
            {isAdmin && <TabsTrigger data-testid="settings-tab" value="importacao">Importação</TabsTrigger>}
            {isAdmin && <TabsTrigger data-testid="settings-tab" value="capture">Formulários</TabsTrigger>}
            <TabsTrigger data-testid="settings-tab" value="atendimento">Atendimento</TabsTrigger>
            {isAdmin && <TabsTrigger data-testid="settings-tab" value="ia">IA</TabsTrigger>}
            <TabsTrigger data-testid="settings-tab" value="automations">Automações</TabsTrigger>
            {/* Campanhas e Biblioteca saíram do menu lateral em 17/09/2026. */}
            <TabsTrigger data-testid="settings-tab" value="campaigns">Campanhas</TabsTrigger>
            <TabsTrigger data-testid="settings-tab" value="library">Biblioteca</TabsTrigger>
            {isAdmin && <TabsTrigger data-testid="settings-tab" value="onboarding">Onboarding</TabsTrigger>}
            {isAdmin && <TabsTrigger data-testid="settings-tab" value="demonstration">Demonstração</TabsTrigger>}
          </TabsList>
          <div className="mt-6 mb-4">
            <h2 className="text-xl font-semibold">{meta.title}</h2>
            <p className="text-sm text-muted-foreground">{meta.description}</p>
          </div>
          <TabsContent value="general"><GeneralSettings /></TabsContent>
          <TabsContent value="notifications"><NotificationsTab /></TabsContent>
          {isAdmin && <TabsContent value="security"><SecuritySettings /></TabsContent>}
          {isAdmin && (
            <TabsContent value="integrations">
              <IntegrationsTab />
            </TabsContent>
          )}
          {isAdmin && <TabsContent value="email"><EmailSettings /></TabsContent>}
          {isAdmin && <TabsContent value="api"><ApiSettings /></TabsContent>}
          {isAdmin && <TabsContent value="importacao"><ImportSettings /></TabsContent>}
          {isAdmin && <TabsContent value="capture"><CaptureFormsSettings /></TabsContent>}
          <TabsContent value="atendimento"><AtendimentoSettings /></TabsContent>
          {isAdmin && <TabsContent value="ia"><AISettings /></TabsContent>}
          <TabsContent value="automations"><AutomationsTab /></TabsContent>
          <TabsContent value="campaigns"><CampaignsPage /></TabsContent>
          <TabsContent value="library"><LibraryPage /></TabsContent>
          <TabsContent value="team"><EquipeSettings /></TabsContent>
          {isAdmin && <TabsContent value="demonstration"><DemonstrationSettings /></TabsContent>}
          {isAdmin && <TabsContent value="onboarding"><OnboardingSettings /></TabsContent>}
        </Tabs>
      </div>
    </AppShell>
  );
}

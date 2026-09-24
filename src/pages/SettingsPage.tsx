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
import AgendaSettings from "@/components/settings/AgendaSettings";
import AtendimentoSettings from "@/components/settings/AtendimentoSettings";
import CampaignsPage from "@/pages/CampaignsPage";
import LibraryPage from "@/pages/LibraryPage";
import { useAuth } from "@/hooks/useAuth";

/**
 * Configurações, organizadas como a história de uma empresa usando a plataforma
 * (reorganização aprovada pela Sabrina em 24/09/2026):
 *
 *   Conta        → quem somos e quem entra (Geral, Usuários, Notificações)
 *   Conexões     → por onde a empresa fala com o mundo (Integrações, E-mail, API)
 *   Captação     → por onde os leads chegam (Formulários, Importação)
 *   Inteligência → como a IA e a agenda trabalham (IA, Agenda, Respostas rápidas)
 *   Automação    → o que roda sozinho (Automações, Campanhas, Biblioteca)
 *   Começar      → recomeçar ou testar (Primeiros passos = onboarding + demonstração)
 *
 * Menu vertical à esquerda, um capítulo por grupo. Segurança vive no fim de
 * Usuários; Onboarding e Demonstração viraram uma aba só. As rotas antigas
 * (`/settings/security`, `/settings/onboarding`, `/settings/demonstration`)
 * redirecionam.
 */
const VALID_TABS = ["general", "team", "notifications", "integrations", "email", "api", "capture", "importacao", "ia", "agenda", "atendimento", "automations", "campaigns", "library", "inicio"] as const;
type Tab = (typeof VALID_TABS)[number];

const TAB_META: Record<Tab, { title: string; description: string; admin?: boolean }> = {
  general: {
    title: "Geral",
    description: "Suas informações pessoais e os dados da empresa usados na plataforma.",
  },
  team: {
    title: "Usuários",
    description: "Quem usa a plataforma: aprovação, papéis, carga de atendimento e as regras de acesso da empresa.",
  },
  notifications: {
    title: "Notificações",
    description: "O que cada pessoa recebe, por onde (app, e-mail, WhatsApp) e o texto de cada aviso.",
  },
  integrations: {
    title: "Integrações",
    description: "Canais, voz, calendário, ERP e webhooks. Toda credencial de serviço externo é cadastrada aqui.",
    admin: true,
  },
  email: {
    title: "E-mail",
    description: "Por onde os e-mails da empresa saem: Resend em nome da empresa ou a conta do Gmail conectada.",
    admin: true,
  },
  api: {
    title: "API",
    description: "Acesso de outras ferramentas e soluções ao CRM: chaves com escopos, chamadas recentes e documentação.",
    admin: true,
  },
  capture: {
    title: "Formulários",
    description: "Formulários de captura: página própria ou embed no site, com origem por UTM, campos condicionais e destino no funil.",
    admin: true,
  },
  importacao: {
    title: "Importação",
    description: "Traga contatos, empresas, negócios e atividades de outro CRM ou planilha, com de/para de colunas e etapas.",
    admin: true,
  },
  ia: {
    title: "IA",
    description: "Personalidade, base de conhecimento, análises e comportamento do atendimento por IA.",
    admin: true,
  },
  agenda: {
    title: "Agenda",
    description: "Seu calendário conectado, a política que a IA segue para marcar reuniões e os textos de lembrete e no-show.",
  },
  atendimento: {
    title: "Respostas rápidas",
    description: "As mensagens que o time usa todo dia no inbox, a um / de distância.",
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
  inicio: {
    title: "Primeiros passos",
    description: "Refaça o onboarding da plataforma ou carregue dados de demonstração para ver como ela funciona.",
    admin: true,
  },
};

const CAPITULOS: { titulo: string; abas: Tab[] }[] = [
  { titulo: "Conta", abas: ["general", "team", "notifications"] },
  { titulo: "Conexões", abas: ["integrations", "email", "api"] },
  { titulo: "Captação", abas: ["capture", "importacao"] },
  { titulo: "Inteligência", abas: ["ia", "agenda", "atendimento"] },
  { titulo: "Automação", abas: ["automations", "campaigns", "library"] },
  { titulo: "Começar", abas: ["inicio"] },
];

/** Rotas que existiam antes da reorganização. */
const ROTA_LEGADA: Record<string, string> = {
  channels: "/settings/integrations?integration=channels",
  pipeline: "/settings/automations?secao=funil",
  sequences: "/settings/automations?secao=cadencias",
  "follow-up": "/settings/automations?secao=cadencias",
  security: "/settings/team#seguranca",
  onboarding: "/settings/inicio",
  demonstration: "/settings/inicio#demonstracao",
};

function getTabFromPath(pathname: string): Tab {
  const segment = pathname.replace(/^\/settings\/?/, "").split("/")[0];
  return (VALID_TABS as readonly string[]).includes(segment) ? (segment as Tab) : "general";
}

function Secao({ id, titulo, descricao, children }: { id: string; titulo: string; descricao: string; children: React.ReactNode }) {
  return (
    <section id={id} className="space-y-4 border-t pt-6" style={{ borderColor: "var(--via-border)" }} data-testid={`settings-secao-${id}`}>
      <div>
        <h3 className="text-base font-semibold">{titulo}</h3>
        <p className="text-sm text-muted-foreground">{descricao}</p>
      </div>
      {children}
    </section>
  );
}

export default function SettingsPage() {
  const { isAdmin } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const segmento = pathname.replace(/^\/settings\/?/, "").split("/")[0];
  if (ROTA_LEGADA[segmento]) {
    return <Navigate to={ROTA_LEGADA[segmento]} replace />;
  }

  const activeTab = getTabFromPath(pathname);
  const meta = TAB_META[activeTab];

  const handleChange = (value: string) => {
    navigate(value === "general" ? "/settings" : `/settings/${value}`);
  };
  const visivel = (aba: Tab) => isAdmin || !TAB_META[aba].admin;

  return (
    <AppShell>
      <div className="space-y-6">
        <h1 className="text-3xl font-medium tracking-tight">Configurações</h1>
        <Tabs value={activeTab} onValueChange={handleChange} orientation="vertical" className="grid items-start gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
          {/* Menu por capítulos. No celular vira uma fila rolável, sem os títulos dos capítulos. */}
          <TabsList
            className="flex h-auto flex-row items-stretch gap-1 overflow-x-auto rounded-md border p-1 md:sticky md:top-4 md:flex-col md:gap-3 md:overflow-visible md:border-0 md:bg-transparent md:p-0"
            aria-label="Seções das configurações"
          >
            {CAPITULOS.map((cap) => {
              const abas = cap.abas.filter(visivel);
              if (!abas.length) return null;
              return (
                <div key={cap.titulo} className="flex shrink-0 flex-row gap-1 md:flex-col md:gap-0.5" data-testid={`settings-capitulo-${cap.titulo}`}>
                  <p className="hidden px-3 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground md:block">{cap.titulo}</p>
                  {abas.map((aba) => (
                    <TabsTrigger key={aba} data-testid="settings-tab" value={aba} className="justify-start md:w-full md:px-3 md:py-2">
                      {TAB_META[aba].title}
                    </TabsTrigger>
                  ))}
                </div>
              );
            })}
          </TabsList>

          <div className="min-w-0">
            <div className="mb-4">
              <h2 className="text-xl font-semibold">{meta.title}</h2>
              <p className="text-sm text-muted-foreground">{meta.description}</p>
            </div>
            <TabsContent value="general"><GeneralSettings /></TabsContent>
            {/* Usuários: a equipe e, no fim, as regras de acesso (antiga aba Segurança). */}
            <TabsContent value="team" className="space-y-8">
              <EquipeSettings />
              {isAdmin && (
                <Secao id="seguranca" titulo="Segurança e acesso" descricao="Como novos usuários entram na plataforma e quais domínios de e-mail são permitidos.">
                  <SecuritySettings />
                </Secao>
              )}
            </TabsContent>
            <TabsContent value="notifications"><NotificationsTab /></TabsContent>
            {isAdmin && <TabsContent value="integrations"><IntegrationsTab /></TabsContent>}
            {isAdmin && <TabsContent value="email"><EmailSettings /></TabsContent>}
            {isAdmin && <TabsContent value="api"><ApiSettings /></TabsContent>}
            {isAdmin && <TabsContent value="capture"><CaptureFormsSettings /></TabsContent>}
            {isAdmin && <TabsContent value="importacao"><ImportSettings /></TabsContent>}
            {isAdmin && <TabsContent value="ia"><AISettings /></TabsContent>}
            <TabsContent value="agenda"><AgendaSettings /></TabsContent>
            <TabsContent value="atendimento"><AtendimentoSettings /></TabsContent>
            <TabsContent value="automations"><AutomationsTab /></TabsContent>
            <TabsContent value="campaigns"><CampaignsPage /></TabsContent>
            <TabsContent value="library"><LibraryPage /></TabsContent>
            {/* Primeiros passos: refazer o onboarding e, abaixo, os dados de demonstração. */}
            {isAdmin && (
              <TabsContent value="inicio" className="space-y-8">
                <section className="space-y-4" data-testid="settings-secao-onboarding">
                  <div>
                    <h3 className="text-base font-semibold">Refazer o onboarding</h3>
                    <p className="text-sm text-muted-foreground">Reabre o assistente de configuração, já preenchido com os dados atuais da empresa.</p>
                  </div>
                  <OnboardingSettings />
                </section>
                <Secao id="demonstracao" titulo="Dados de demonstração" descricao="Dados fictícios para ver a plataforma funcionando antes de usar com dados reais. Podem ser removidos a qualquer momento.">
                  <DemonstrationSettings />
                </Secao>
              </TabsContent>
            )}
          </div>
        </Tabs>
      </div>
    </AppShell>
  );
}

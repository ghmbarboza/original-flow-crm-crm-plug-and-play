import { useLocation, useNavigate } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import GeneralSettings from "@/components/settings/GeneralSettings";
import SecuritySettings from "@/components/settings/SecuritySettings";
import ApiKeysSettings from "@/components/settings/ApiKeysSettings";
import ChannelsSettings from "@/components/settings/ChannelsSettings";
import TeamSettings from "@/components/settings/TeamSettings";
import DemonstrationSettings from "@/components/settings/DemonstrationSettings";
import OnboardingSettings from "@/components/settings/OnboardingSettings";
import AISettings from "@/components/settings/AISettings";
import FollowupSettings from "@/components/settings/FollowupSettings";
import NotificationPreferences from "@/components/settings/NotificationPreferences";
import CaptureFormsSettings from "@/components/settings/CaptureFormsSettings";
import { useAuth } from "@/hooks/useAuth";

const VALID_TABS = ["general", "notifications", "security", "channels", "integrations", "capture", "ia", "follow-up", "team", "demonstration", "onboarding"] as const;
type Tab = (typeof VALID_TABS)[number];

const TAB_META: Record<Tab, { title: string; description: string }> = {
  general: {
    title: "Geral",
    description: "Gerencie suas informações pessoais utilizadas na plataforma.",
  },
  notifications: {
    title: "Notificações",
    description: "Escolha em quais canais você quer ser avisado para cada tipo de evento.",
  },
  security: {
    title: "Segurança",
    description: "Controle como novos usuários acessam a plataforma e quais domínios são permitidos.",
  },
  channels: {
    title: "Canais",
    description: "Gerencie o provedor de mensagens, os canais conectados e a distribuição de conversas.",
  },
  integrations: {
    title: "Integrações",
    description: "Conecte serviços externos cadastrando chaves de API utilizadas pela plataforma.",
  },
  capture: {
    title: "Captura de Leads",
    description: "Crie formulários públicos que capturam leads e os direcionam para um funil e uma automação.",
  },
  ia: {
    title: "IA",
    description: "Configure a personalidade, a base de conhecimento e o comportamento do atendimento por IA no WhatsApp.",
  },
  "follow-up": {
    title: "Follow-up",
    description: "Régua de mensagens automáticas para reengajar conversas de WhatsApp sem resposta.",
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
            {isAdmin && <TabsTrigger data-testid="settings-tab" value="team">Equipe</TabsTrigger>}
            <TabsTrigger data-testid="settings-tab" value="notifications">Notificações</TabsTrigger>
            {isAdmin && <TabsTrigger data-testid="settings-tab" value="integrations">Integrações</TabsTrigger>}
            {isAdmin && <TabsTrigger data-testid="settings-tab" value="channels">Canais</TabsTrigger>}
            {isAdmin && <TabsTrigger data-testid="settings-tab" value="capture">Captura de Leads</TabsTrigger>}
            {isAdmin && <TabsTrigger data-testid="settings-tab" value="ia">IA</TabsTrigger>}
            {isAdmin && <TabsTrigger data-testid="settings-tab" value="follow-up">Follow-up</TabsTrigger>}
            {isAdmin && <TabsTrigger data-testid="settings-tab" value="onboarding">Onboarding</TabsTrigger>}
            {isAdmin && <TabsTrigger data-testid="settings-tab" value="demonstration">Demonstração</TabsTrigger>}
          </TabsList>
          <div className="mt-6 mb-4">
            <h2 className="text-xl font-semibold">{meta.title}</h2>
            <p className="text-sm text-muted-foreground">{meta.description}</p>
          </div>
          <TabsContent value="general"><GeneralSettings /></TabsContent>
          <TabsContent value="notifications"><NotificationPreferences /></TabsContent>
          {isAdmin && <TabsContent value="security"><SecuritySettings /></TabsContent>}
          {isAdmin && <TabsContent value="channels"><ChannelsSettings /></TabsContent>}
          {isAdmin && <TabsContent value="integrations"><ApiKeysSettings /></TabsContent>}
          {isAdmin && <TabsContent value="capture"><CaptureFormsSettings /></TabsContent>}
          {isAdmin && <TabsContent value="ia"><AISettings /></TabsContent>}
          {isAdmin && <TabsContent value="follow-up"><FollowupSettings /></TabsContent>}
          {isAdmin && <TabsContent value="team"><TeamSettings /></TabsContent>}
          {isAdmin && <TabsContent value="demonstration"><DemonstrationSettings /></TabsContent>}
          {isAdmin && <TabsContent value="onboarding"><OnboardingSettings /></TabsContent>}
        </Tabs>
      </div>
    </AppShell>
  );
}

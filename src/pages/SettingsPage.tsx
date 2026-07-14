import { useLocation, useNavigate } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import GeneralSettings from "@/components/settings/GeneralSettings";
import SecuritySettings from "@/components/settings/SecuritySettings";
import ApiKeysSettings from "@/components/settings/ApiKeysSettings";
import TeamSettings from "@/components/settings/TeamSettings";
import DemonstrationSettings from "@/components/settings/DemonstrationSettings";
import OnboardingSettings from "@/components/settings/OnboardingSettings";
import { useAuth } from "@/hooks/useAuth";

const VALID_TABS = ["general", "security", "integrations", "team", "demonstration", "onboarding"] as const;
type Tab = (typeof VALID_TABS)[number];

const TAB_META: Record<Tab, { title: string; description: string }> = {
  general: {
    title: "Geral",
    description: "Gerencie suas informações pessoais utilizadas na plataforma.",
  },
  security: {
    title: "Segurança",
    description: "Controle como novos usuários acessam a plataforma e quais domínios são permitidos.",
  },
  integrations: {
    title: "Integrações",
    description: "Conecte serviços externos cadastrando chaves de API utilizadas pela plataforma.",
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
          <TabsList>
            <TabsTrigger value="general">Geral</TabsTrigger>
            {isAdmin && <TabsTrigger value="security">Segurança</TabsTrigger>}
            {isAdmin && <TabsTrigger value="integrations">Integrações</TabsTrigger>}
            {isAdmin && <TabsTrigger value="team">Equipe</TabsTrigger>}
            {isAdmin && <TabsTrigger value="demonstration">Demonstração</TabsTrigger>}
            {isAdmin && <TabsTrigger value="onboarding">Onboarding</TabsTrigger>}
          </TabsList>
          <div className="mt-6 mb-4">
            <h2 className="text-xl font-semibold">{meta.title}</h2>
            <p className="text-sm text-muted-foreground">{meta.description}</p>
          </div>
          <TabsContent value="general"><GeneralSettings /></TabsContent>
          {isAdmin && <TabsContent value="security"><SecuritySettings /></TabsContent>}
          {isAdmin && <TabsContent value="integrations"><ApiKeysSettings /></TabsContent>}
          {isAdmin && <TabsContent value="team"><TeamSettings /></TabsContent>}
          {isAdmin && <TabsContent value="demonstration"><DemonstrationSettings /></TabsContent>}
          {isAdmin && <TabsContent value="onboarding"><OnboardingSettings /></TabsContent>}
        </Tabs>
      </div>
    </AppShell>
  );
}

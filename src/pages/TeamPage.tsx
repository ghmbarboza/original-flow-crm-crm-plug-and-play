import { Lock, Users2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AgentLoadPanel } from "@/components/team/AgentLoadPanel";
import { useAuth } from "@/hooks/useAuth";

export default function TeamPage() {
  const { isAdmin, profile } = useAuth();
  // Supervisão é para quem coordena: admin da conta ou gerente/diretor no CRM.
  const canSupervise = isAdmin || profile?.crm_role === "gerente" || profile?.crm_role === "diretor";

  const header = (
    <div className="flex items-center gap-3">
      <Users2 className="h-7 w-7" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
      <h1
        className="font-display text-3xl font-medium tracking-tight"
        style={{ color: "var(--via-text-primary)", letterSpacing: "var(--via-ls-tighter)" }}
      >
        Equipe
      </h1>
    </div>
  );

  if (!canSupervise) {
    return (
      <AppShell>
        <div className="space-y-6">
          {header}
          <div className="via-card mx-auto max-w-lg p-8 text-center">
            <Lock className="mx-auto mb-3 h-8 w-8" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
            <p className="text-base font-medium" style={{ color: "var(--via-text-primary)" }}>
              Acesso restrito
            </p>
            <p className="mt-1 text-sm" style={{ color: "var(--via-text-body)" }}>
              O painel de atendimento em tempo real é visível para administradores, diretores
              e gerentes.
            </p>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        {header}

        <Tabs defaultValue="live" className="space-y-4">
          <TabsList>
            <TabsTrigger value="live">Atendimento em tempo real</TabsTrigger>
          </TabsList>
          <TabsContent value="live"><AgentLoadPanel /></TabsContent>
        </Tabs>

        <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
          Para aprovar membros, mudar papéis ou definir os canais de cada agente, use
          Configurações &gt; Equipe.
        </p>
      </div>
    </AppShell>
  );
}

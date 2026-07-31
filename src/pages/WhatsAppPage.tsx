import { MessageCircle } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PageSkeleton } from "@/components/PageSkeleton";
import { ProviderWizard } from "@/components/whatsapp/ProviderWizard";
import { Inbox } from "@/components/whatsapp/Inbox";
import { ModoFocoToggle } from "@/components/whatsapp/ModoFocoToggle";
import { useModoFoco } from "@/hooks/useModoFoco";
import { useWhatsAppSetup } from "@/hooks/useWhatsAppConfig";

export default function WhatsAppPage() {
  const { data: setup, isLoading, error, refetch } = useWhatsAppSetup();
  const [modoFoco, setModoFoco] = useModoFoco();

  if (isLoading) {
    return (
      <AppShell>
        <PageSkeleton />
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell>
        <div className="via-card p-6">
          <p className="text-sm font-medium text-via-coral">Não foi possível carregar a configuração do WhatsApp</p>
          <p className="text-sm" style={{ color: "var(--via-text-body)" }}>
            {error instanceof Error ? error.message : "Erro desconhecido."} Recarregue a página.
          </p>
        </div>
      </AppShell>
    );
  }

  // Sem provedor configurado → wizard. Configurado → inbox.
  if (!setup?.configured || !setup.provider) {
    return (
      <AppShell>
        <div className="py-6">
          <ProviderWizard onDone={() => refetch()} />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <MessageCircle className="h-7 w-7" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
            <h1
              className="font-display text-3xl font-medium tracking-tight"
              style={{ color: "var(--via-text-primary)", letterSpacing: "var(--via-ls-tighter)" }}
            >
              Atendimento
            </h1>
          </div>
          <ModoFocoToggle ativo={modoFoco} onChange={setModoFoco} />
        </div>
        <Inbox provider={setup.provider} modoFoco={modoFoco} />
      </div>
    </AppShell>
  );
}

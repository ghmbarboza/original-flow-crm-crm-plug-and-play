import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight, Ban, Plus, Send, XCircle } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/EmptyState";
import { PageSkeleton } from "@/components/PageSkeleton";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CampaignFormDialog } from "@/components/campaigns/CampaignFormDialog";
import { TemplatesTab } from "@/components/campaigns/TemplatesTab";
import { ChannelBadge } from "@/components/whatsapp/ChannelBadge";
import { PROVIDER_LABEL, type CampaignProvider } from "@/lib/campaign-channels";
import { useWhatsAppSetup } from "@/hooks/useWhatsAppConfig";
import {
  CAMPAIGN_STATUS_LABEL, useCampaigns, useCancelCampaign, useSendCampaign,
} from "@/hooks/useCampaigns";
import { VIA_CAMPAIGN_STATUS } from "@/lib/via-colors";
import { formatDate } from "@/lib/format";

function StatusBadge({ status }: { status: string }) {
  const meta = VIA_CAMPAIGN_STATUS[status as keyof typeof VIA_CAMPAIGN_STATUS];
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
      style={meta ? { background: meta.bg, color: meta.text } : { background: "var(--via-surface)", color: "var(--via-text-body)" }}
    >
      {CAMPAIGN_STATUS_LABEL[status] ?? status}
    </span>
  );
}

export default function CampaignsPage() {
  const { data: setup, isLoading: loadingSetup } = useWhatsAppSetup();
  const { data: campaigns, isLoading } = useCampaigns();
  const sendCampaign = useSendCampaign();
  const cancelCampaign = useCancelCampaign();
  const [formOpen, setFormOpen] = useState(false);

  // Campanhas dependem de ter um provedor oficial CONFIGURADO — não do provedor
  // "principal" da org. Uma org em Evolution para atendimento pode ter Zernio
  // conectado só para campanhas, e nesse caso a tela deve abrir.
  const activeProviders = {
    meta: !!setup?.meta,
    zernio: !!setup?.zernio,
  };
  const canRunCampaigns = activeProviders.meta || activeProviders.zernio;

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <Send className="h-7 w-7" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
        <h1
          className="font-display text-3xl font-medium tracking-tight"
          style={{ color: "var(--via-text-primary)", letterSpacing: "var(--via-ls-tighter)" }}
        >
          Campanhas
        </h1>
      </div>
      {canRunCampaigns && (
        <Button onClick={() => setFormOpen(true)} className="gap-1.5">
          <Plus className="h-4 w-4" strokeWidth={1.5} />
          Nova campanha
        </Button>
      )}
    </div>
  );

  if (loadingSetup) {
    return <AppShell><PageSkeleton /></AppShell>;
  }

  // Evolution (ou sem provedor): campanhas em massa bloqueadas.
  if (!canRunCampaigns) {
    return (
      <AppShell>
        <div className="space-y-6">
          {header}
          {/* EmptyState em vez de card estreito (max-w-xl mx-auto): mesma
              largura dos estados vazios do resto da plataforma. A saída do
              bloqueio agora é um link, não uma instrução para navegar à mão. */}
          <div data-testid="campaigns-blocked">
          <EmptyState
            icon={Ban}
            title="Campanhas exigem um provedor oficial"
            description={
              <>
                O envio de mensagens em massa só é permitido pela WhatsApp Business Platform oficial.
                A Evolution API conecta um número comum, sujeito a bloqueios por spam — por isso
                campanhas ficam indisponíveis nesse modo.
              </>
            }
            action={
              <Button asChild variant="outline" className="gap-1.5">
                <Link to="/settings/channels" data-testid="campaigns-blocked-link">
                  Configurar canais
                  <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
                </Link>
              </Button>
            }
          />
          </div>
        </div>
      </AppShell>
    );
  }

  const handleSend = async (id: string) => {
    try {
      await sendCampaign.mutateAsync(id);
      toast.success("Disparo iniciado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível disparar a campanha.");
    }
  };

  const handleCancel = async (id: string) => {
    try {
      await cancelCampaign.mutateAsync(id);
      toast.success("Campanha cancelada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível cancelar.");
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {header}

        <Tabs defaultValue="campaigns" className="space-y-4">
          <TabsList>
            <TabsTrigger value="campaigns">Campanhas</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
          </TabsList>

          <TabsContent value="templates"><TemplatesTab /></TabsContent>

          <TabsContent value="campaigns">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : (campaigns ?? []).length === 0 ? (
          <div className="via-card p-10 text-center">
            <Send className="mx-auto mb-3 h-7 w-7" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
            <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>Nenhuma campanha ainda</p>
            <p className="mb-4 text-sm" style={{ color: "var(--via-text-muted)" }}>
              Crie uma campanha para enviar uma mensagem em massa aos seus contatos.
            </p>
            <Button onClick={() => setFormOpen(true)}>Criar primeira campanha</Button>
          </div>
        ) : (
          <div className="via-card overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Destinatários</TableHead>
                  <TableHead className="text-right">Enviadas</TableHead>
                  <TableHead>Agendamento</TableHead>
                  <TableHead className="w-32" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(campaigns ?? []).map((campaign) => (
                  <TableRow key={campaign.id}>
                    <TableCell className="font-medium">{campaign.name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <ChannelBadge channel={campaign.channel} showLabel />
                        <span className="text-xs" style={{ color: "var(--via-text-muted)" }}>
                          {PROVIDER_LABEL[campaign.provider as CampaignProvider] ?? campaign.provider}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell><StatusBadge status={campaign.status} /></TableCell>
                    <TableCell className="text-right tabular-nums">{campaign.total_recipients}</TableCell>
                    <TableCell className="text-right tabular-nums">{campaign.sent_count}</TableCell>
                    <TableCell style={{ color: "var(--via-text-muted)" }}>{formatDate(campaign.scheduled_at)}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {(campaign.status === "draft" || campaign.status === "scheduled") && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5"
                              onClick={() => handleSend(campaign.id)}
                              disabled={sendCampaign.isPending}
                            >
                              <Send className="h-3.5 w-3.5" strokeWidth={1.5} />
                              Disparar
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => handleCancel(campaign.id)} aria-label="Cancelar">
                              <XCircle className="h-4 w-4" strokeWidth={1.5} />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
          </TabsContent>
        </Tabs>
      </div>

      <CampaignFormDialog open={formOpen} onOpenChange={setFormOpen} activeProviders={activeProviders} />
    </AppShell>
  );
}

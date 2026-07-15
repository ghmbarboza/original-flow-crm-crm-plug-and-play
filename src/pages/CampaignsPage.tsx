import { useState } from "react";
import { toast } from "sonner";
import { Ban, Plus, Send, XCircle } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PageSkeleton } from "@/components/PageSkeleton";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { CampaignFormDialog } from "@/components/campaigns/CampaignFormDialog";
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
      {setup?.provider === "meta_official" && (
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
  if (setup?.provider !== "meta_official") {
    return (
      <AppShell>
        <div className="space-y-6">
          {header}
          <div className="via-card mx-auto max-w-xl p-8 text-center">
            <Ban className="mx-auto mb-3 h-8 w-8" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
            <p className="text-base font-medium" style={{ color: "var(--via-text-primary)" }}>
              Campanhas exigem a API Oficial (Meta)
            </p>
            <p className="mt-1 text-sm" style={{ color: "var(--via-text-body)" }}>
              O envio de mensagens em massa só é permitido pela WhatsApp Business Platform oficial. A
              Evolution API conecta um número comum, sujeito a bloqueios por spam — por isso campanhas
              ficam indisponíveis nesse modo.
            </p>
            <p className="mt-3 text-sm" style={{ color: "var(--via-text-muted)" }}>
              Para liberar campanhas, configure o provedor Meta em WhatsApp.
            </p>
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
      </div>

      <CampaignFormDialog open={formOpen} onOpenChange={setFormOpen} />
    </AppShell>
  );
}

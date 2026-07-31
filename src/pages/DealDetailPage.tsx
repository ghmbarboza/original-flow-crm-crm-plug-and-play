import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft, Building2, Calendar, CheckCircle2, Pencil, Percent, User, XCircle,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { DealStatusBadge } from "@/components/deals/DealStatusBadge";
import { DealFormDialog } from "@/components/deals/DealFormDialog";
import { DealProductsSection } from "@/components/deals/DealProductsSection";
import { DealQualification } from "@/components/deals/DealQualification";
import { DealActivitiesSection } from "@/components/deals/DealActivitiesSection";
import { DealTimeline } from "@/components/deals/DealTimeline";
import { RequiredFieldsDialog } from "@/components/deals/RequiredFieldsDialog";
import {
  contactName, useDeal, useLossReasons, useMoveDealStage, useStages, useUpdateDeal,
} from "@/hooks/useDeals";
import { useOrgMemberNames } from "@/hooks/useOrgMembers";
import { formatCurrency, formatDate } from "@/lib/format";
import { missingRequiredFields, parseRequiredFields } from "@/lib/required-fields";

function InfoField({ icon: Icon, label, value }: { icon: typeof User; label: string; value: string | null }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
      <div className="min-w-0">
        <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>{label}</p>
        <p className="truncate text-sm" style={{ color: value ? "var(--via-text-primary)" : "var(--via-text-muted)" }}>
          {value || "—"}
        </p>
      </div>
    </div>
  );
}

const NO_REASON = "__none__";

export default function DealDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: deal, isLoading, error } = useDeal(id ?? null);
  const { data: stages } = useStages();
  const { data: lossReasons } = useLossReasons();
  const ownerNames = useOrgMemberNames();
  const moveStage = useMoveDealStage();
  const updateDeal = useUpdateDeal();

  const [editOpen, setEditOpen] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);
  const [lossReasonId, setLossReasonId] = useState<string>(NO_REASON);
  const [blocked, setBlocked] = useState<{ stageName: string; missing: string[] } | null>(null);

  const handleStageChange = async (stageId: string) => {
    if (!deal) return;
    const stage = stages?.find((s) => s.id === stageId);

    // Mesma regra do Kanban: a etapa de destino pode exigir campos preenchidos.
    if (stage) {
      const missing = missingRequiredFields(parseRequiredFields(stage.required_fields), deal);
      if (missing.length > 0) {
        setBlocked({ stageName: stage.name, missing });
        return;
      }
    }

    try {
      await moveStage.mutateAsync({ id: deal.id, stageId, probability: stage?.win_probability });
    } catch (err) {
      toast.error(
        err instanceof Error ? `Não foi possível mover: ${err.message}` : "Não foi possível mover o negócio.",
      );
    }
  };

  const markWon = async () => {
    if (!deal) return;
    try {
      await updateDeal.mutateAsync({ id: deal.id, status: "won", probability: 100 });
      toast.success("Negócio marcado como ganho. 🎉");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível atualizar o negócio.");
    }
  };

  const markLost = async () => {
    if (!deal) return;
    try {
      await updateDeal.mutateAsync({
        id: deal.id,
        status: "lost",
        probability: 0,
        loss_reason_id: lossReasonId === NO_REASON ? null : lossReasonId,
      });
      setLostOpen(false);
      setLossReasonId(NO_REASON);
      toast.success("Negócio marcado como perdido.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível atualizar o negócio.");
    }
  };

  const reopen = async () => {
    if (!deal) return;
    try {
      await updateDeal.mutateAsync({ id: deal.id, status: "open", loss_reason_id: null });
      toast.success("Negócio reaberto.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível reabrir o negócio.");
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <Link
          to="/deals"
          className="inline-flex items-center gap-1.5 text-sm"
          style={{ color: "var(--via-text-muted)" }}
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
          Voltar para negócios
        </Link>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : error || !deal ? (
          <div className="via-card p-10 text-center">
            <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
              Negócio não encontrado
            </p>
            <p className="mb-4 text-sm" style={{ color: "var(--via-text-muted)" }}>
              {error instanceof Error ? error.message : "Ele pode ter sido excluído ou você não tem acesso."}
            </p>
            <Button onClick={() => navigate("/deals")}>Voltar para negócios</Button>
          </div>
        ) : (
          <>
            {/* Cabeçalho */}
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-3">
                  <h1
                    className="font-display text-3xl font-medium tracking-tight"
                    style={{ color: "var(--via-text-primary)", letterSpacing: "var(--via-ls-tighter)" }}
                  >
                    {deal.title}
                  </h1>
                  <DealStatusBadge status={deal.status} />
                </div>
                <p className="text-2xl font-semibold tabular-nums" data-testid="deal-value" style={{ color: "var(--via-text-primary)" }}>
                  {formatCurrency(deal.value, deal.currency)}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {deal.status === "open" ? (
                  <>
                    <Button variant="outline" className="gap-1.5" onClick={markWon} disabled={updateDeal.isPending} data-testid="deal-mark-won">
                      <CheckCircle2 className="h-4 w-4" strokeWidth={1.5} />
                      Ganho
                    </Button>
                    <Button variant="outline" className="gap-1.5" onClick={() => setLostOpen(true)} data-testid="deal-mark-lost">
                      <XCircle className="h-4 w-4" strokeWidth={1.5} />
                      Perdido
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" onClick={reopen} disabled={updateDeal.isPending}>
                    Reabrir
                  </Button>
                )}
                <Button className="gap-1.5" onClick={() => setEditOpen(true)}>
                  <Pencil className="h-4 w-4" strokeWidth={1.5} />
                  Editar
                </Button>
              </div>
            </div>

            {/* Informações + etapa */}
            <div className="via-card p-5">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <InfoField icon={User} label="Contato" value={contactName(deal.contact)} />
                <InfoField icon={Building2} label="Empresa" value={deal.company?.name ?? null} />
                <InfoField
                  icon={User}
                  label="Owner"
                  value={deal.owner_id ? ownerNames.get(deal.owner_id) ?? null : null}
                />
                <InfoField icon={Percent} label="Probabilidade" value={`${deal.probability}%`} />
                <InfoField icon={Calendar} label="Previsão de fechamento" value={formatDate(deal.close_date)} />
              </div>

              <Separator className="my-4" />

              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
                  Etapa
                </span>
                <Select
                  value={deal.stage_id ?? ""}
                  onValueChange={handleStageChange}
                  disabled={deal.status !== "open"}
                >
                  <SelectTrigger className="w-56" data-testid="deal-stage-select">
                    <SelectValue placeholder="Sem etapa" />
                  </SelectTrigger>
                  <SelectContent>
                    {(stages ?? []).map((stage) => (
                      <SelectItem key={stage.id} value={stage.id}>
                        <span className="inline-flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full" style={{ background: stage.color }} aria-hidden />
                          {stage.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Corpo em duas colunas: conteúdo à esquerda, timeline à direita. */}
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="space-y-6 lg:col-span-2">
                <DealProductsSection dealId={deal.id} currency={deal.currency} />
                <DealActivitiesSection dealId={deal.id} contactId={deal.contact_id} />
                <DealQualification deal={deal} />
              </div>
              <div className="lg:col-span-1">
                <DealTimeline dealId={deal.id} contactId={deal.contact_id} />
              </div>
            </div>

            <DealFormDialog open={editOpen} onOpenChange={setEditOpen} deal={deal} />

            <RequiredFieldsDialog
              open={!!blocked}
              onOpenChange={(open) => !open && setBlocked(null)}
              stageName={blocked?.stageName ?? ""}
              missing={blocked?.missing ?? []}
            />

            <Dialog open={lostOpen} onOpenChange={setLostOpen}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Marcar como perdido</DialogTitle>
                  <DialogDescription>
                    Escolha o motivo da perda. Ele alimenta os relatórios de motivos de perda.
                  </DialogDescription>
                </DialogHeader>
                <div className="py-2">
                  <Select value={lossReasonId} onValueChange={setLossReasonId}>
                    <SelectTrigger data-testid="deal-loss-reason">
                      <SelectValue placeholder="Motivo da perda" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_REASON}>Sem motivo específico</SelectItem>
                      {(lossReasons ?? []).map((reason) => (
                        <SelectItem key={reason.id} value={reason.id}>{reason.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setLostOpen(false)}>Cancelar</Button>
                  <Button onClick={markLost} disabled={updateDeal.isPending} data-testid="deal-confirm-lost">
                    Confirmar perda
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        )}
      </div>
    </AppShell>
  );
}

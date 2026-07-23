import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { DealCard } from "@/components/deals/DealCard";
import {
  useMoveDealStage, useStages, type Deal, type PipelineStage,
} from "@/hooks/useDeals";
import { formatCurrency } from "@/lib/format";

interface Props {
  deals: Deal[];
  isLoading: boolean;
  onSelect: (deal: Deal) => void;
  onCreate: (stageId: string) => void;
}

/** Soma dos deals em aberto de uma coluna — o cabeçalho mostra o forecast da etapa. */
function stageTotal(deals: Deal[]) {
  return deals.reduce((sum, d) => sum + Number(d.value ?? 0), 0);
}

export function DealsKanban({ deals, isLoading, onSelect, onCreate }: Props) {
  const { data: stages, isLoading: loadingStages } = useStages();
  const moveStage = useMoveDealStage();

  const [dragging, setDragging] = useState<Deal | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);

  // Agrupa os deals por etapa uma vez; deals sem etapa ficam de fora do board.
  const byStage = useMemo(() => {
    const map = new Map<string, Deal[]>();
    for (const deal of deals) {
      if (!deal.stage_id) continue;
      const list = map.get(deal.stage_id) ?? [];
      list.push(deal);
      map.set(deal.stage_id, list);
    }
    return map;
  }, [deals]);

  const handleDrop = async (stage: PipelineStage) => {
    const deal = dragging;
    setDragging(null);
    setOverStage(null);
    if (!deal || deal.stage_id === stage.id) return;

    try {
      await moveStage.mutateAsync({
        id: deal.id,
        stageId: stage.id,
        probability: stage.win_probability,
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? `Não foi possível mover: ${error.message}` : "Não foi possível mover o negócio.",
      );
    }
  };

  if (loadingStages || isLoading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="w-72 shrink-0 space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (!stages || stages.length === 0) {
    return (
      <div className="via-card p-10 text-center">
        <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
          Nenhuma etapa de pipeline configurada
        </p>
        <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>
          Configure as etapas do funil em Configurações para usar o Kanban.
        </p>
      </div>
    );
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {stages.map((stage) => {
        const stageDeals = byStage.get(stage.id) ?? [];
        const isOver = overStage === stage.id;
        return (
          <div
            key={stage.id}
            data-testid="kanban-column"
            data-stage-id={stage.id}
            data-stage-name={stage.name}
            className="flex w-72 shrink-0 flex-col rounded-lg transition-colors"
            style={{ background: isOver ? "var(--via-surface)" : "transparent" }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (overStage !== stage.id) setOverStage(stage.id);
            }}
            onDragLeave={(e) => {
              // Só limpa quando o cursor sai da coluna inteira, não ao passar por um filho.
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverStage(null);
            }}
            onDrop={() => handleDrop(stage)}
          >
            <div className="mb-2 flex items-center justify-between gap-2 px-1">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: stage.color }}
                  aria-hidden
                />
                <span className="truncate text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
                  {stage.name}
                </span>
                <span className="text-xs tabular-nums" style={{ color: "var(--via-text-muted)" }}>
                  {stageDeals.length}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onCreate(stage.id)}
                className="rounded p-0.5 hover:bg-accent"
                aria-label={`Novo negócio em ${stage.name}`}
              >
                <Plus className="h-4 w-4" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
              </button>
            </div>

            <p className="mb-2 px-1 text-xs tabular-nums" style={{ color: "var(--via-text-muted)" }}>
              {formatCurrency(stageTotal(stageDeals))}
            </p>

            <div className="flex-1 space-y-2">
              {stageDeals.map((deal) => (
                <DealCard
                  key={deal.id}
                  deal={deal}
                  onClick={onSelect}
                  onDragStart={setDragging}
                  onDragEnd={() => {
                    setDragging(null);
                    setOverStage(null);
                  }}
                  isDragging={dragging?.id === deal.id}
                />
              ))}
              {stageDeals.length === 0 && (
                <div
                  className="rounded-lg border border-dashed p-4 text-center text-xs"
                  style={{ borderColor: "var(--via-border)", color: "var(--via-text-muted)" }}
                >
                  Arraste um negócio para cá
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

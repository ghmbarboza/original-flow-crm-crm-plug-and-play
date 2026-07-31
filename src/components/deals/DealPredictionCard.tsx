import { useEffect, useRef } from "react";
import { RefreshCw, Target, TrendingDown, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePredictDealClose, type PredictionFactor } from "@/hooks/useDealPrediction";
import { formatDateTime } from "@/lib/format";
import type { Deal } from "@/hooks/useDeals";

/** A previsão gravada vale por 6h; depois disso o card recalcula ao abrir. */
const STALE_MS = 6 * 60 * 60 * 1000;

function corDaProbabilidade(p: number): string {
  if (p >= 70) return "var(--via-success)";
  if (p >= 40) return "var(--via-text-primary)";
  return "var(--via-coral)";
}

/**
 * Probabilidade de fechamento por IA na ficha do deal (Parte 3 do Sprint 10B).
 * Mostra o valor gravado no deal e dispara o recálculo quando não há previsão
 * ou ela envelheceu — a predict-deal-close tem cache de 1h no servidor, então
 * reaberturas seguidas não custam chamadas de IA.
 */
export function DealPredictionCard({ deal }: { deal: Deal }) {
  const predict = usePredictDealClose();
  const requested = useRef(false);

  const probability = deal.ai_close_probability !== null ? Number(deal.ai_close_probability) : null;
  const factors = (deal.ai_close_factors ?? []) as unknown as PredictionFactor[];
  const updatedAt = deal.ai_close_probability_updated_at;

  useEffect(() => {
    if (deal.status !== "open" || requested.current) return;
    const stale = !updatedAt || Date.now() - new Date(updatedAt).getTime() > STALE_MS;
    if (probability === null || stale) {
      requested.current = true;
      predict.mutate({ dealId: deal.id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deal.id, deal.status]);

  if (deal.status !== "open") return null;

  return (
    <div className="via-card space-y-2 p-5" data-testid="deal-prediction">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-medium" style={{ color: "var(--via-text-primary)" }}>
          <Target className="h-4 w-4" strokeWidth={1.5} aria-hidden />
          Probabilidade de fechamento
        </h2>
        <Button
          size="sm"
          variant="ghost"
          className="gap-1.5"
          disabled={predict.isPending}
          onClick={() => predict.mutate({ dealId: deal.id, force: true })}
          aria-label="Recalcular a previsão"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${predict.isPending ? "animate-spin" : ""}`} strokeWidth={1.5} />
          Recalcular
        </Button>
      </div>

      {probability === null ? (
        <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>
          {predict.isPending ? "Calculando com base no histórico e no engajamento…" : "Ainda sem previsão para este negócio."}
        </p>
      ) : (
        <>
          <p className="text-3xl font-semibold tabular-nums" style={{ color: corDaProbabilidade(probability) }}>
            {Math.round(probability)}%
          </p>
          {factors.length > 0 && (
            <ul className="space-y-1">
              {factors.map((f) => (
                <li key={f.factor} className="flex items-center gap-1.5 text-sm" style={{ color: "var(--via-text-body)" }}>
                  {f.impact === "positivo" ? (
                    <TrendingUp className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} style={{ color: "var(--via-success)" }} aria-label="fator positivo" />
                  ) : (
                    <TrendingDown className="h-3.5 w-3.5 shrink-0" strokeWidth={1.5} style={{ color: "var(--via-coral)" }} aria-label="fator negativo" />
                  )}
                  {f.factor}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
            Baseado em tempo no pipeline, engajamento nas conversas, qualificação BANT e histórico
            de deals similares.{updatedAt ? ` Última atualização: ${formatDateTime(updatedAt)}.` : ""}
          </p>
        </>
      )}
    </div>
  );
}

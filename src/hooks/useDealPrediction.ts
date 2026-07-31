import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { erroDeFunction } from "@/integrations/supabase/functionError";
import { useOrgId } from "@/hooks/useOrgId";

/** Fator explicativo da previsão, como a predict-deal-close devolve. */
export interface PredictionFactor {
  factor: string;
  impact: "positivo" | "negativo";
}

export interface DealPrediction {
  probability: number;
  factors: PredictionFactor[];
  updated_at: string;
  cached: boolean;
}

/**
 * Recalcula (ou lê o cache de 1h) a previsão de fechamento de um deal.
 * A function grava o resultado no próprio deal; invalidamos as queries para
 * o card do kanban e o detalhe enxergarem o número novo.
 */
export function usePredictDealClose() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ dealId, force = false }: { dealId: string; force?: boolean }): Promise<DealPrediction> => {
      const { data, error } = await supabase.functions.invoke("predict-deal-close", {
        body: { deal_id: dealId, force },
      });
      if (error) throw await erroDeFunction(error, "Não foi possível calcular a previsão.");
      if (data?.error) throw new Error(data.error);
      return data as DealPrediction;
    },
    onSuccess: (_data, { dealId }) => {
      queryClient.invalidateQueries({ queryKey: ["deal", dealId] });
      queryClient.invalidateQueries({ queryKey: ["deals", orgId] });
    },
  });
}

/**
 * Forecast ponderado pela IA (relatórios): soma de valor × probabilidade dos
 * deals abertos que já têm previsão calculada.
 */
export function useAiForecast() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["ai-forecast", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<{ weighted: number; covered: number; open: number }> => {
      const { data, error } = await supabase
        .from("deals")
        .select("value, ai_close_probability")
        .eq("org_id", orgId!)
        .eq("status", "open");
      if (error) throw error;
      const rows = data ?? [];
      const withPrediction = rows.filter((d) => d.ai_close_probability !== null);
      const weighted = withPrediction.reduce(
        (sum, d) => sum + Number(d.value ?? 0) * (Number(d.ai_close_probability) / 100),
        0,
      );
      return { weighted, covered: withPrediction.length, open: rows.length };
    },
  });
}

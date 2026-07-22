import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";

type DemoAction = "seed" | "clear";

interface DemoResponse {
  ok?: boolean;
  action?: DemoAction;
  skipped?: boolean;
  counts?: Record<string, number>;
  error?: string;
}

const DEMO_STATUS_KEY = "demo-status";

/**
 * Verifica se existem dados de demonstração no org (checa a tabela contacts,
 * que é sempre semeada). Retorna o boolean `hasDemoData` via `data`.
 */
export function useDemoStatus() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: [DEMO_STATUS_KEY, orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from("contacts")
        .select("id")
        .eq("org_id", orgId!)
        .eq("is_demo", true)
        .limit(1);
      if (error) throw error;
      return (data ?? []).length > 0;
    },
  });
}

/** Invoca a edge function `demo-data` e trata `ok !== true` como erro. */
async function invokeDemo(action: DemoAction): Promise<DemoResponse> {
  const { data, error } = await supabase.functions.invoke<DemoResponse>("demo-data", {
    body: { action },
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? "A operação de demonstração falhou.");
  return data;
}

function useDemoMutation(action: DemoAction) {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => invokeDemo(action),
    onSuccess: () => {
      // Atualiza o status e invalida todas as queries de dados (contacts,
      // companies, deals, activities, products e derivadas) de uma vez.
      queryClient.invalidateQueries({ queryKey: [DEMO_STATUS_KEY, orgId] });
      queryClient.invalidateQueries();
    },
  });
}

/** Popula dados fictícios de demonstração no org. */
export function useSeedDemo() {
  return useDemoMutation("seed");
}

/** Remove todos os dados de demonstração do org. */
export function useClearDemo() {
  return useDemoMutation("clear");
}

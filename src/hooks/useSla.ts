import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import type { Database } from "@/integrations/supabase/types";

export type SlaConfig = Database["public"]["Tables"]["sla_configs"]["Row"];

/** Canais que o SLA pode cobrir — os mesmos do atendimento multicanal. */
export const SLA_CHANNELS = ["whatsapp", "instagram", "telegram", "facebook"] as const;

/** Configuração de SLA da org (única por org; null = nunca configurou). */
export function useSlaConfig() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["sla-config", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<SlaConfig | null> => {
      const { data, error } = await supabase
        .from("sla_configs")
        .select("*")
        .eq("org_id", orgId!)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });
}

export function useSaveSlaConfig() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (patch: {
      first_response_minutes: number;
      resolution_hours: number;
      alert_threshold_percent: number;
      active_channels: string[];
      is_active: boolean;
    }) => {
      if (!orgId) throw new Error("Organização não carregada. Recarregue a página.");
      const { error } = await supabase.from("sla_configs").upsert(
        { org_id: orgId, ...patch, updated_at: new Date().toISOString() },
        { onConflict: "org_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sla-config", orgId] }),
  });
}

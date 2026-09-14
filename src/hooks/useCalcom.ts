import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";

/**
 * Integração de agendamento via Cal.com (Parte 11 do Sprint 10A).
 *
 * Guardada em integration_configs (provider = 'calcom', UNIQUE org+provider),
 * sem migration: o link de agendamento e o que fazer quando o Cal.com confirma
 * uma reunião via webhook.
 */
export interface CalcomConfig {
  scheduling_link: string;
  create_activity: boolean;
  link_deal: boolean;
  notify_agent: boolean;
  /**
   * Colado no campo "Secret" do webhook no Cal.com, que passa a assinar cada
   * evento (x-cal-signature-256). O calcom-webhook recusa evento sem assinatura.
   * Gerado no primeiro salvamento e mantido depois.
   */
  webhook_secret?: string;
}

export const CALCOM_DEFAULTS: CalcomConfig = {
  scheduling_link: "",
  create_activity: true,
  link_deal: true,
  notify_agent: true,
};

export function novoSegredoCalcom(): string {
  return (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
}

export function useCalcomConfig() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["calcom-config", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<{ config: CalcomConfig; is_active: boolean } | null> => {
      const { data, error } = await supabase
        .from("integration_configs")
        .select("config, is_active")
        .eq("org_id", orgId!)
        .eq("provider", "calcom")
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        config: { ...CALCOM_DEFAULTS, ...(data.config as Partial<CalcomConfig>) },
        is_active: data.is_active,
      };
    },
  });
}

export function useSaveCalcomConfig() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (config: CalcomConfig) => {
      if (!orgId) throw new Error("Organização não carregada. Recarregue a página.");
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("integration_configs").upsert(
        {
          org_id: orgId,
          provider: "calcom",
          config: {
            ...config,
            scheduling_link: config.scheduling_link.trim(),
            webhook_secret: config.webhook_secret || novoSegredoCalcom(),
          },
          // Sem link não há integração: o webhook ignora e a IA não oferece agenda.
          is_active: !!config.scheduling_link.trim(),
          connected_by: auth.user?.id ?? null,
        },
        { onConflict: "org_id,provider" },
      );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["calcom-config", orgId] }),
  });
}

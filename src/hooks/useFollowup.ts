import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import type { Database } from "@/integrations/supabase/types";

export type FollowupConfig = Database["public"]["Tables"]["followup_configs"]["Row"];
export type FollowupStep = Database["public"]["Tables"]["followup_steps"]["Row"];

/** O que fazer quando o número máximo de tentativas é atingido. */
export const ON_LIMIT_OPTIONS = [
  { value: "mark_inactive", label: "Marcar contato como inativo" },
  { value: "notify_agent", label: "Notificar um agente" },
  { value: "both", label: "Ambos" },
] as const;

export function useFollowupConfig() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["followup-config", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<FollowupConfig | null> => {
      const { data, error } = await supabase
        .from("followup_configs")
        .select("*")
        .eq("org_id", orgId!)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });
}

export function useFollowupSteps() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["followup-steps", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<FollowupStep[]> => {
      const { data, error } = await supabase
        .from("followup_steps")
        .select("*")
        .eq("org_id", orgId!)
        .order("order");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUpsertFollowupConfig() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (patch: { is_active?: boolean; max_attempts?: number; on_limit_reached?: string }) => {
      if (!orgId) throw new Error("Organização não carregada.");
      const { error } = await supabase
        .from("followup_configs")
        .upsert({ org_id: orgId, ...patch, updated_at: new Date().toISOString() }, { onConflict: "org_id" });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["followup-config", orgId] }),
  });
}

export function useSaveFollowupStep() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id?: string; delay_hours: number; message_template: string; order: number }) => {
      if (!orgId) throw new Error("Organização não carregada.");
      if (input.id) {
        const { error } = await supabase
          .from("followup_steps")
          .update({ delay_hours: input.delay_hours, message_template: input.message_template, order: input.order })
          .eq("id", input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("followup_steps").insert({
          org_id: orgId,
          delay_hours: input.delay_hours,
          message_template: input.message_template,
          order: input.order,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["followup-steps", orgId] }),
  });
}

export function useDeleteFollowupStep() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("followup_steps").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["followup-steps", orgId] }),
  });
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import type { Database } from "@/integrations/supabase/types";

export type AISourceProfile = Database["public"]["Tables"]["ai_source_profiles"]["Row"];
export type FunnelModeOrigem = "inherit" | "auto" | "suggest";

export interface SaveSourceProfileInput {
  id?: string;
  source: string;
  label: string | null;
  instruction: string;
  outreach_instruction: string;
  outreach_template_name: string | null;
  funnel_mode: FunnelModeOrigem;
  initial_stage_id: string | null;
  is_active: boolean;
}

/** Perfis da IA por origem do lead (IA > Por origem). */
export function useAISourceProfiles() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["ai-source-profiles", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<AISourceProfile[]> => {
      const { data, error } = await supabase
        .from("ai_source_profiles")
        .select("*")
        .eq("org_id", orgId!)
        .order("source");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveAISourceProfile() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveSourceProfileInput) => {
      if (!orgId) throw new Error("Organização não carregada. Recarregue a página.");
      const source = input.source.trim().toLowerCase();
      if (!source) throw new Error("Informe a origem.");
      const payload = {
        org_id: orgId,
        source,
        label: input.label?.trim() || null,
        instruction: input.instruction.trim(),
        outreach_instruction: input.outreach_instruction.trim(),
        outreach_template_name: input.outreach_template_name?.trim() || null,
        funnel_mode: input.funnel_mode,
        initial_stage_id: input.initial_stage_id,
        is_active: input.is_active,
        updated_at: new Date().toISOString(),
      };
      const { error } = input.id
        ? await supabase.from("ai_source_profiles").update(payload).eq("id", input.id)
        : await supabase.from("ai_source_profiles").insert(payload);
      if (error) {
        if (error.code === "23505") throw new Error(`Já existe um perfil para a origem "${source}".`);
        throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai-source-profiles", orgId] }),
  });
}

export function useDeleteAISourceProfile() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ai_source_profiles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai-source-profiles", orgId] }),
  });
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import type { Json } from "@/integrations/supabase/types";
import { confirmarCampo, lerMemoria, type ChaveCampo, type MemoriaDoLead } from "@/lib/clientMemory";

/** Memória do lead (o que a IA sabe) na ficha do contato. */
export function useClientMemory(contactId: string | undefined) {
  return useQuery({
    queryKey: ["client-memory", contactId],
    enabled: !!contactId,
    queryFn: async (): Promise<MemoriaDoLead> => {
      const { data, error } = await supabase.from("contacts").select("client_memory").eq("id", contactId!).single();
      if (error) throw error;
      return lerMemoria(data.client_memory);
    },
  });
}

export function useConfirmMemoryField(contactId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { memoria: MemoriaDoLead; chave: ChaveCampo; valor: string }) => {
      if (!contactId) throw new Error("Contato não carregado.");
      const nova = confirmarCampo(input.memoria, input.chave, input.valor);
      const { error } = await supabase.from("contacts").update({ client_memory: nova as unknown as Json }).eq("id", contactId);
      if (error) throw error;
      return nova;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-memory", contactId] }),
  });
}

export interface AnalysisConfig { enabled: boolean; every_messages: number; min_confidence: number }
export const ANALYSIS_PADRAO: AnalysisConfig = { enabled: true, every_messages: 5, min_confidence: 70 };

export function useAnalysisConfig() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["ai-analysis-config", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<AnalysisConfig> => {
      const { data, error } = await supabase.from("ai_messaging_config").select("analysis").eq("org_id", orgId!).maybeSingle();
      if (error) throw error;
      return { ...ANALYSIS_PADRAO, ...((data?.analysis as Partial<AnalysisConfig> | null) ?? {}) };
    },
  });
}

export function useSaveAnalysisConfig() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AnalysisConfig) => {
      if (!orgId) throw new Error("Organização não carregada.");
      const { error } = await supabase.from("ai_messaging_config").update({ analysis: input as unknown as Json }).eq("org_id", orgId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai-analysis-config", orgId] }),
  });
}

export function useStageCriteria() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["stage-criteria", orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.from("pipeline_stages").select("id, name, ai_trigger_criteria, pipeline_id, order").eq("org_id", orgId!).order("order");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveStageCriteria() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; criteria: string }) => {
      const { error } = await supabase.from("pipeline_stages").update({ ai_trigger_criteria: input.criteria.trim() || null }).eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stage-criteria", orgId] });
      queryClient.invalidateQueries({ queryKey: ["pipeline-stages", orgId] });
    },
  });
}

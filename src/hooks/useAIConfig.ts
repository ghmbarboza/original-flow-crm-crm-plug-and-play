import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import type { Database } from "@/integrations/supabase/types";

export type AIConfig = Database["public"]["Tables"]["ai_messaging_config"]["Row"];
export type AIConfigInsert = Database["public"]["Tables"]["ai_messaging_config"]["Insert"];
export type FAQ = Database["public"]["Tables"]["ai_knowledge_faqs"]["Row"];
export type Objection = Database["public"]["Tables"]["ai_knowledge_objections"]["Row"];
export type PromptVersion = Database["public"]["Tables"]["ai_prompt_versions"]["Row"];

/** Dias da semana no formato guardado em `working_hours`. */
export const WEEK_DAYS = [
  { key: "mon", label: "Segunda" },
  { key: "tue", label: "Terça" },
  { key: "wed", label: "Quarta" },
  { key: "thu", label: "Quinta" },
  { key: "fri", label: "Sexta" },
  { key: "sat", label: "Sábado" },
  { key: "sun", label: "Domingo" },
] as const;

export interface WorkingDay {
  enabled: boolean;
  start: string;
  end: string;
}
export type WorkingHours = Record<string, WorkingDay>;

/**
 * Detecção de intenção de compra (Parte 6 do Sprint 10A). Vive dentro de
 * `human_trigger_rules.purchase_intent` — mesmo JSONB do acionamento humano,
 * lido pela edge function ai-reply a cada mensagem inbound.
 */
export interface PurchaseIntentRules {
  keywords: string[];
  /** Notificar o agente responsável (ou admins, se a conversa não tem dono). */
  notify: boolean;
  /** Etapa para onde mover o deal aberto do contato; null = não mover. */
  move_to_stage_id: string | null;
  /** Transferir a conversa para humano ao detectar. */
  take_over: boolean;
}

export interface HumanTriggerRules {
  keywords: string[];
  negative_sentiment: boolean;
  purchase_intent?: PurchaseIntentRules;
}

export function useAIConfig() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["ai-config", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<AIConfig | null> => {
      const { data, error } = await supabase
        .from("ai_messaging_config")
        .select("*")
        .eq("org_id", orgId!)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });
}

/**
 * Salva a configuração da IA.
 *
 * Quando o `system_prompt` muda, uma nova versão é registrada em
 * `ai_prompt_versions` — é o histórico versionado que o guia exige (lista, diff,
 * reverter). O número da versão vem de `prompt_version`, incrementado a cada save.
 */
export function useUpsertAIConfig() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (patch: Partial<Omit<AIConfigInsert, "org_id">> & { versionNote?: string }) => {
      if (!orgId) throw new Error("Organização não carregada. Recarregue a página.");
      const { versionNote, ...rest } = patch;

      const { data: current } = await supabase
        .from("ai_messaging_config")
        .select("prompt_version, system_prompt")
        .eq("org_id", orgId)
        .maybeSingle();

      const promptChanged =
        rest.system_prompt !== undefined && rest.system_prompt !== current?.system_prompt;
      const nextVersion = (current?.prompt_version ?? 0) + (promptChanged ? 1 : 0);

      const { error } = await supabase.from("ai_messaging_config").upsert(
        {
          org_id: orgId,
          ...rest,
          ...(promptChanged ? { prompt_version: nextVersion } : {}),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "org_id" },
      );
      if (error) throw error;

      if (promptChanged && rest.system_prompt) {
        const { data: auth } = await supabase.auth.getUser();
        await supabase.from("ai_prompt_versions").insert({
          org_id: orgId,
          version: nextVersion,
          system_prompt: rest.system_prompt,
          notes: versionNote ?? null,
          created_by: auth.user?.id ?? null,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-config", orgId] });
      queryClient.invalidateQueries({ queryKey: ["prompt-versions", orgId] });
    },
  });
}

// --- FAQs -----------------------------------------------------------------

export function useFAQs() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["ai-faqs", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<FAQ[]> => {
      const { data, error } = await supabase
        .from("ai_knowledge_faqs")
        .select("*")
        .eq("org_id", orgId!)
        .order("order");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveFAQ() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id?: string; question: string; answer: string }) => {
      if (!orgId) throw new Error("Organização não carregada.");
      if (input.id) {
        const { error } = await supabase
          .from("ai_knowledge_faqs")
          .update({ question: input.question, answer: input.answer })
          .eq("id", input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("ai_knowledge_faqs")
          .insert({ org_id: orgId, question: input.question, answer: input.answer });
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai-faqs", orgId] }),
  });
}

export function useDeleteFAQ() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ai_knowledge_faqs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai-faqs", orgId] }),
  });
}

export function useImportFAQs() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rows: { question: string; answer: string }[]) => {
      if (!orgId) throw new Error("Organização não carregada.");
      if (rows.length === 0) return { inserted: 0 };
      const { data, error } = await supabase
        .from("ai_knowledge_faqs")
        .insert(rows.map((r) => ({ ...r, org_id: orgId })))
        .select("id");
      if (error) throw error;
      return { inserted: data?.length ?? 0 };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai-faqs", orgId] }),
  });
}

// --- Objeções -------------------------------------------------------------

export function useObjections() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["ai-objections", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<Objection[]> => {
      const { data, error } = await supabase
        .from("ai_knowledge_objections")
        .select("*")
        .eq("org_id", orgId!)
        .order("order");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveObjection() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id?: string; objection: string; response: string }) => {
      if (!orgId) throw new Error("Organização não carregada.");
      if (input.id) {
        const { error } = await supabase
          .from("ai_knowledge_objections")
          .update({ objection: input.objection, response: input.response })
          .eq("id", input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("ai_knowledge_objections")
          .insert({ org_id: orgId, objection: input.objection, response: input.response });
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai-objections", orgId] }),
  });
}

export function useDeleteObjection() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ai_knowledge_objections").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai-objections", orgId] }),
  });
}

export function useImportObjections() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rows: { objection: string; response: string }[]) => {
      if (!orgId) throw new Error("Organização não carregada.");
      if (rows.length === 0) return { inserted: 0 };
      const { data, error } = await supabase
        .from("ai_knowledge_objections")
        .insert(rows.map((r) => ({ ...r, org_id: orgId })))
        .select("id");
      if (error) throw error;
      return { inserted: data?.length ?? 0 };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["ai-objections", orgId] }),
  });
}

// --- Versões de prompt ----------------------------------------------------

export function usePromptVersions() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["prompt-versions", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<PromptVersion[]> => {
      const { data, error } = await supabase
        .from("ai_prompt_versions")
        .select("*")
        .eq("org_id", orgId!)
        .order("version", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Reverte para uma versão: aplica o prompt daquela versão como o atual (nova versão). */
export function useRevertPromptVersion() {
  const upsert = useUpsertAIConfig();
  return useMutation({
    mutationFn: async (version: PromptVersion) => {
      await upsert.mutateAsync({
        system_prompt: version.system_prompt,
        versionNote: `Revertido para a versão ${version.version}`,
      });
    },
  });
}

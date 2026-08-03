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

/** Execução da régua numa conversa, com o contato resolvido para exibição. */
export type FollowupExecution = Database["public"]["Tables"]["followup_executions"]["Row"] & {
  conversation: {
    phone_number: string | null;
    channel_contact_name: string | null;
    contact: { first_name: string | null; last_name: string | null } | null;
  } | null;
};

/**
 * Execuções do follow-up da organização, mais recentes primeiro.
 *
 * Alimenta a tela de USO (/followup) — o que a régua está fazendo agora —
 * separada da configuração (Configurações > Automações > Cadências), que define mensagens e
 * parâmetros. Limite de 100: a tela é um painel de acompanhamento, não um
 * histórico completo.
 */
export function useFollowupExecutions() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["followup-executions", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<FollowupExecution[]> => {
      const { data, error } = await supabase
        .from("followup_executions")
        .select("*, conversation:conversations(phone_number, channel_contact_name, contact:contacts(first_name, last_name))")
        .eq("org_id", orgId!)
        .order("updated_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as FollowupExecution[];
    },
  });
}

/** Nome exibível do contato de uma execução: contato do CRM > nome do canal > telefone. */
export function nomeDaExecucao(e: FollowupExecution): string {
  const c = e.conversation;
  if (!c) return "Conversa removida";
  const doContato = [c.contact?.first_name, c.contact?.last_name].filter(Boolean).join(" ");
  return doContato || c.channel_contact_name || c.phone_number || "Sem identificação";
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

/** Anexo de uma etapa (Parte 10): tipo + upload no bucket OU URL externa. */
export interface FollowupStepMedia {
  media_type: "image" | "document" | "video" | null;
  media_path: string | null;
  media_url: string | null;
  media_filename: string | null;
}

export function useSaveFollowupStep() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: {
        id?: string;
        delay_hours: number;
        message_template: string;
        order: number;
      } & Partial<FollowupStepMedia>,
    ) => {
      if (!orgId) throw new Error("Organização não carregada.");
      const { id, ...fields } = input;
      if (id) {
        const { error } = await supabase.from("followup_steps").update(fields).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("followup_steps").insert({ org_id: orgId, ...fields });
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["followup-steps", orgId] }),
  });
}

/**
 * Sobe o anexo de uma etapa para o bucket whatsapp-media, no caminho
 * <org_id>/followup/<step_id>/<arquivo> — o prefixo org_id é o que as
 * policies do bucket exigem. Retorna o caminho gravado.
 */
export function useUploadFollowupMedia() {
  const orgId = useOrgId();
  return useMutation({
    mutationFn: async ({ stepId, file }: { stepId: string; file: File }): Promise<string> => {
      if (!orgId) throw new Error("Organização não carregada.");
      const safeName = file.name.replace(/[^\w.-]+/g, "_");
      const path = `${orgId}/followup/${stepId}/${Date.now()}-${safeName}`;
      const { error } = await supabase.storage
        .from("whatsapp-media")
        .upload(path, file, { upsert: false, contentType: file.type || undefined });
      if (error) throw error;
      return path;
    },
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

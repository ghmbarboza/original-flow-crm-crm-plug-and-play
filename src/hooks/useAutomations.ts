import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import type { Database } from "@/integrations/supabase/types";

export type Automation = Database["public"]["Tables"]["automations"]["Row"];
export type AutomationLog = Database["public"]["Tables"]["automation_logs"]["Row"];

/** Triggers disponíveis (evento que dispara a automação). */
export const TRIGGERS = [
  { value: "contact_created", label: "Novo contato criado" },
  { value: "deal_stage_changed", label: "Negócio mudou de etapa" },
  { value: "form_submitted", label: "Formulário submetido" },
  { value: "tag_added", label: "Tag adicionada a um contato" },
  { value: "message_received", label: "Mensagem de WhatsApp recebida" },
] as const;

/** Ações disponíveis. */
export const ACTIONS = [
  { value: "send_email", label: "Enviar email", param: "template_id", paramLabel: "Template" },
  { value: "create_activity", label: "Criar atividade", param: "title", paramLabel: "Título" },
  { value: "move_deal", label: "Mover negócio de etapa", param: "stage_id", paramLabel: "Etapa" },
  { value: "add_tag", label: "Adicionar tag", param: "tag_id", paramLabel: "Tag" },
  { value: "notify_agent", label: "Notificar agente", param: "message", paramLabel: "Mensagem" },
  { value: "start_sequence", label: "Iniciar sequência de email", param: "sequence_id", paramLabel: "Sequência" },
] as const;

export type TriggerType = (typeof TRIGGERS)[number]["value"];
export type ActionType = (typeof ACTIONS)[number]["value"];

export interface AutomationCondition {
  field: string;
  op: "eq" | "neq" | "contains";
  value: string;
}
export interface AutomationAction {
  type: ActionType;
  params: Record<string, string>;
}

export function useAutomations() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["automations", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<Automation[]> => {
      const { data, error } = await supabase
        .from("automations")
        .select("*")
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAutomationLogs(automationId: string | null) {
  return useQuery({
    queryKey: ["automation-logs", automationId],
    enabled: !!automationId,
    queryFn: async (): Promise<AutomationLog[]> => {
      const { data, error } = await supabase
        .from("automation_logs")
        .select("*")
        .eq("automation_id", automationId!)
        .order("ran_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveAutomation() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      id?: string;
      name: string;
      description?: string | null;
      is_active?: boolean;
      trigger: { type: TriggerType };
      conditions: AutomationCondition[];
      actions: AutomationAction[];
    }) => {
      if (!orgId) throw new Error("Organização não carregada.");
      const payload = {
        name: input.name,
        description: input.description ?? null,
        trigger: input.trigger as never,
        conditions: input.conditions as never,
        actions: input.actions as never,
        ...(input.is_active !== undefined ? { is_active: input.is_active } : {}),
        updated_at: new Date().toISOString(),
      };
      if (input.id) {
        const { error } = await supabase.from("automations").update(payload).eq("id", input.id);
        if (error) throw error;
      } else {
        const { data: auth } = await supabase.auth.getUser();
        const { error } = await supabase
          .from("automations")
          .insert({ ...payload, org_id: orgId, created_by: auth.user?.id ?? null });
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["automations", orgId] }),
  });
}

export function useToggleAutomation() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("automations").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["automations", orgId] }),
  });
}

export function useDeleteAutomation() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("automations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["automations", orgId] }),
  });
}

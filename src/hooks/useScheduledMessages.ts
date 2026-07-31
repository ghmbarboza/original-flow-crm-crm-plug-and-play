import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import type { Database } from "@/integrations/supabase/types";

export type ScheduledMessage = Database["public"]["Tables"]["scheduled_messages"]["Row"] & {
  pipeline_stage: { id: string; name: string } | null;
};

export const SCHEDULED_STATUS_LABEL: Record<string, string> = {
  pending: "Agendada",
  sent: "Enviada",
  failed: "Falhou",
  cancelled: "Cancelada",
};

/**
 * Mensagens programadas de um contato, próximas primeiro.
 *
 * Duas origens: avulsa (agente escolhe data/hora na ficha ou no inbox) e por
 * etapa do pipeline (trigger schedule_stage_message, pipeline_stage_id
 * preenchido). O envio é do scheduled-message-dispatcher (cron 5 min).
 */
export function useScheduledMessages(contactId: string | null) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["scheduled-messages", contactId],
    enabled: !!contactId && !!orgId,
    queryFn: async (): Promise<ScheduledMessage[]> => {
      const { data, error } = await supabase
        .from("scheduled_messages")
        .select("*, pipeline_stage:pipeline_stages(id, name)")
        .eq("contact_id", contactId!)
        .order("scheduled_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ScheduledMessage[];
    },
  });
}

export function useScheduleMessage() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { contactId: string; message: string; scheduledAt: string; conversationId?: string | null; dealId?: string | null }) => {
      if (!orgId) throw new Error("Organização não carregada.");
      if (!input.message.trim()) throw new Error("Escreva a mensagem.");
      const quando = new Date(input.scheduledAt);
      if (Number.isNaN(quando.getTime())) throw new Error("Data ou hora inválida.");
      if (quando.getTime() <= Date.now()) throw new Error("O horário precisa estar no futuro.");

      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("scheduled_messages").insert({
        org_id: orgId,
        contact_id: input.contactId,
        conversation_id: input.conversationId ?? null,
        deal_id: input.dealId ?? null,
        message: input.message.trim(),
        scheduled_at: quando.toISOString(),
        created_by: auth.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, input) =>
      queryClient.invalidateQueries({ queryKey: ["scheduled-messages", input.contactId] }),
  });
}

export function useCancelScheduledMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; contactId: string }) => {
      // Cancela, não apaga: a linha fica como registro do que foi agendado.
      const { error } = await supabase
        .from("scheduled_messages")
        .update({ status: "cancelled" })
        .eq("id", id)
        .eq("status", "pending");
      if (error) throw error;
    },
    onSuccess: (_d, { contactId }) =>
      queryClient.invalidateQueries({ queryKey: ["scheduled-messages", contactId] }),
  });
}

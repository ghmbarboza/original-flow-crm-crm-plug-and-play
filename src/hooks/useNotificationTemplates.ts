import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";

/** Eventos que geram notificação, na ordem exibida nas duas sub-abas. */
export const NOTIFICATION_EVENTS: { type: string; label: string; description: string }[] = [
  { type: "novo_lead", label: "Novo lead", description: "Um formulário ou uma integração gerou um lead." },
  { type: "lead_atribuido", label: "Lead atribuído a mim", description: "Um contato passou a ser seu." },
  { type: "negocio_atribuido", label: "Negócio atribuído a mim", description: "Um negócio passou a ser seu." },
  { type: "conversa_atribuida", label: "Conversa atribuída a mim", description: "Uma conversa de atendimento passou a ser sua." },
  { type: "deal_ganho", label: "Negócio ganho", description: "Um negócio foi marcado como ganho." },
  { type: "deal_perdido", label: "Negócio perdido", description: "Um negócio foi marcado como perdido." },
  { type: "tarefa_atribuida", label: "Tarefa atribuída", description: "Uma tarefa foi atribuída a você." },
  { type: "tarefa_vencendo", label: "Tarefa vencendo", description: "Uma tarefa sua vence nas próximas 24 horas." },
  { type: "ia_acionou_humano", label: "IA acionou humano", description: "A IA transferiu uma conversa para atendimento humano." },
  { type: "intencao_compra", label: "Intenção de compra", description: "Um cliente usou palavras que indicam intenção de compra." },
  { type: "sugestao_etapa", label: "IA sugeriu etapa", description: "A IA sugeriu mover um negócio de etapa (modo sugerir)." },
  { type: "conversa_sem_agente", label: "Conversa sem agente", description: "Uma conversa nova entrou e nenhum agente do canal estava disponível." },
  { type: "conversa_sem_resposta", label: "Conversa sem resposta", description: "Uma conversa passou do tempo tolerado sem resposta da equipe." },
  { type: "agente_no_limite", label: "Agente no limite", description: "Um agente atingiu o máximo de conversas do canal." },
  { type: "reuniao_agendada", label: "Reunião agendada", description: "Uma reunião foi marcada para você (pela IA, à mão ou pelo Cal.com)." },
  { type: "reuniao_no_show", label: "Cliente não compareceu", description: "Uma reunião sua passou do horário sem confirmação nem presença." },
  { type: "agendamento_confirmado", label: "Reunião agendada", description: "Um contato confirmou uma reunião pelo link de agendamento." },
  { type: "importacao_concluida", label: "Importação concluída", description: "Uma importação de planilha ou de outro CRM terminou, com o resumo do que entrou." },
  { type: "estoque_baixo", label: "Estoque baixo", description: "Um produto ficou abaixo do estoque mínimo após uma venda." },
  { type: "automacao", label: "Aviso de automação", description: "A ação 'Notificar agente' de uma automação." },
  { type: "followup_exhausted", label: "Follow-up esgotado", description: "A régua de follow-up terminou sem resposta do contato." },
];

export interface NotificationTemplate {
  event_type: string;
  personalizado: boolean;
  title_template: string;
  body_template: string;
  email_subject: string;
  email_html: string;
  whatsapp_text: string;
  whatsapp_template_name: string | null;
}

/** Modelos de texto por evento (personalizado ou padrão), via RPC que faz a fusão. */
export function useNotificationTemplates() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["notification-templates", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<NotificationTemplate[]> => {
      const { data, error } = await supabase.rpc("listar_modelos_notificacao", {
        p_eventos: NOTIFICATION_EVENTS.map((e) => e.type),
      });
      if (error) throw error;
      return (data ?? []) as NotificationTemplate[];
    },
  });
}

export function useSaveNotificationTemplate() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (t: Omit<NotificationTemplate, "personalizado">) => {
      if (!orgId) throw new Error("Organização não carregada. Recarregue a página.");
      const { error } = await supabase.from("notification_templates").upsert({
        org_id: orgId,
        event_type: t.event_type,
        title_template: t.title_template,
        body_template: t.body_template,
        email_subject: t.email_subject,
        email_html: t.email_html,
        whatsapp_text: t.whatsapp_text,
        whatsapp_template_name: t.whatsapp_template_name?.trim() || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "org_id,event_type" });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notification-templates", orgId] }),
  });
}

/** Restaurar padrão = apagar a personalização; a RPC volta a devolver o padrão. */
export function useResetNotificationTemplate() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (eventType: string) => {
      if (!orgId) throw new Error("Organização não carregada.");
      const { error } = await supabase.from("notification_templates").delete().eq("org_id", orgId).eq("event_type", eventType);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notification-templates", orgId] }),
  });
}

/** Prévia local, com os mesmos marcadores que o servidor substitui. */
export function renderizarModelo(template: string, vars: Record<string, string>): string {
  return (template ?? "").replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, k: string) => vars[k] ?? "");
}

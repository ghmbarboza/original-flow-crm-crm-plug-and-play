import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import type { TimelineItem } from "@/hooks/useContactTimeline";

/**
 * Timeline cronológica unificada do deal: atividades, notas, tarefas, emails e
 * — quando há contato vinculado — mensagens de WhatsApp, em ordem decrescente.
 *
 * Emails e atividades filtram por `deal_id`. WhatsApp não se liga ao deal
 * diretamente; puxamos as conversas do contato vinculado. Os módulos de email e
 * WhatsApp só têm dados a partir dos Sprints 3 e 4, mas já são consultados aqui.
 */
export function useDealTimeline(dealId: string | null, contactId?: string | null) {
  const orgId = useOrgId();

  return useQuery({
    queryKey: ["deal_timeline", dealId, contactId],
    enabled: !!dealId && !!orgId,
    queryFn: async (): Promise<TimelineItem[]> => {
      const [activities, emails] = await Promise.all([
        supabase
          .from("activities")
          .select("id, type, title, body, created_at, due_date, completed_at")
          .eq("deal_id", dealId!)
          .order("created_at", { ascending: false }),
        supabase
          .from("emails")
          .select("id, subject, body_html, direction, sent_at, created_at")
          .eq("deal_id", dealId!)
          .order("created_at", { ascending: false }),
      ]);

      if (activities.error) throw activities.error;
      if (emails.error) throw emails.error;

      const items: TimelineItem[] = [];

      for (const a of activities.data ?? []) {
        items.push({
          id: `activity-${a.id}`,
          kind: "activity",
          activityType: a.type,
          title: a.title,
          body: a.body,
          at: a.created_at ?? "",
          meta: a.completed_at ? "Concluída" : a.due_date ? "Pendente" : undefined,
        });
      }

      for (const e of emails.data ?? []) {
        items.push({
          id: `email-${e.id}`,
          kind: "email",
          title: e.subject ?? "(sem assunto)",
          body: e.body_html ? e.body_html.replace(/<[^>]+>/g, " ").slice(0, 160) : null,
          at: e.sent_at ?? e.created_at ?? "",
          meta: e.direction === "inbound" ? "Recebido" : "Enviado",
        });
      }

      if (contactId) {
        const { data: conversations, error } = await supabase
          .from("whatsapp_conversations")
          .select("id")
          .eq("contact_id", contactId);
        if (error) throw error;

        const conversationIds = (conversations ?? []).map((c) => c.id);
        if (conversationIds.length > 0) {
          const { data: messages, error: msgError } = await supabase
            .from("whatsapp_messages")
            .select("id, content, direction, is_from_ai, is_internal_note, sent_at")
            .in("conversation_id", conversationIds)
            .order("sent_at", { ascending: false })
            .limit(50);
          if (msgError) throw msgError;

          for (const m of messages ?? []) {
            items.push({
              id: `wpp-${m.id}`,
              kind: "whatsapp",
              title: m.is_internal_note
                ? "Nota interna"
                : m.direction === "inbound"
                  ? "Mensagem recebida"
                  : m.is_from_ai
                    ? "Resposta da IA"
                    : "Mensagem enviada",
              body: m.content,
              at: m.sent_at ?? "",
            });
          }
        }
      }

      return items
        .filter((item) => item.at)
        .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    },
  });
}

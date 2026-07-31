import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import type { Database } from "@/integrations/supabase/types";

type ActivityType = Database["public"]["Enums"]["activity_type"];

export type TimelineKind = "activity" | "email" | "whatsapp" | "deal";

export interface TimelineItem {
  id: string;
  kind: TimelineKind;
  /** Para `activity`, o tipo específico (call, email, meeting, note, task). */
  activityType?: ActivityType;
  title: string;
  body: string | null;
  at: string;
  meta?: string;
  /** Para `activity`: o id real da linha, para editar/apagar a partir da timeline. */
  activityId?: string;
  /** Para `activity`: autor (user_id), para a regra "edita quem escreveu ou admin". */
  authorId?: string | null;
}

/**
 * Timeline cronológica unificada do contato: atividades, notas, tarefas, emails,
 * mensagens de WhatsApp e negócios, em ordem decrescente.
 *
 * As fontes de WhatsApp e email só passam a ter dados nos Sprints 3 e 4, mas já
 * são consultadas aqui — quando os módulos entrarem, a timeline preenche sozinha.
 */
export function useContactTimeline(contactId: string | null) {
  const orgId = useOrgId();

  return useQuery({
    queryKey: ["contact_timeline", contactId],
    enabled: !!contactId && !!orgId,
    queryFn: async (): Promise<TimelineItem[]> => {
      const [activities, emails, deals, conversations] = await Promise.all([
        supabase
          .from("activities")
          .select("id, type, title, body, created_at, due_date, completed_at, user_id")
          .eq("contact_id", contactId!)
          .order("created_at", { ascending: false }),
        supabase
          .from("emails")
          .select("id, subject, body_html, direction, sent_at, created_at")
          .eq("contact_id", contactId!)
          .order("created_at", { ascending: false }),
        supabase
          .from("deals")
          .select("id, title, value, currency, status, created_at")
          .eq("contact_id", contactId!)
          .order("created_at", { ascending: false }),
        supabase
          .from("conversations")
          .select("id")
          .eq("contact_id", contactId!),
      ]);

      if (activities.error) throw activities.error;
      if (emails.error) throw emails.error;
      if (deals.error) throw deals.error;
      if (conversations.error) throw conversations.error;

      const items: TimelineItem[] = [];

      // Autor das anotações: activities.user_id aponta para auth.users, que o
      // embed do PostgREST não alcança — os nomes vêm de profiles numa consulta à
      // parte, só para os autores presentes.
      const autorIds = [...new Set(
        (activities.data ?? []).filter((a) => a.type === "note" && a.user_id).map((a) => a.user_id as string),
      )];
      const nomeAutor = new Map<string, string>();
      if (autorIds.length > 0) {
        const { data: perfis } = await supabase
          .from("profiles").select("id, full_name").in("id", autorIds);
        for (const p of perfis ?? []) nomeAutor.set(p.id, p.full_name);
      }

      for (const a of activities.data ?? []) {
        const autor = a.type === "note" && a.user_id ? nomeAutor.get(a.user_id) : undefined;
        items.push({
          id: `activity-${a.id}`,
          kind: "activity",
          activityType: a.type,
          title: a.type === "note" ? (autor ? `Anotação de ${autor}` : "Anotação") : a.title,
          body: a.body,
          at: a.created_at ?? "",
          meta: a.completed_at ? "Concluída" : a.due_date ? "Pendente" : undefined,
          activityId: a.id,
          authorId: a.user_id,
        });
      }

      for (const e of emails.data ?? []) {
        items.push({
          id: `email-${e.id}`,
          kind: "email",
          title: e.subject ?? "(sem assunto)",
          // Texto puro: o corpo é HTML e a timeline mostra só uma prévia.
          body: e.body_html ? e.body_html.replace(/<[^>]+>/g, " ").slice(0, 160) : null,
          at: e.sent_at ?? e.created_at ?? "",
          meta: e.direction === "inbound" ? "Recebido" : "Enviado",
        });
      }

      for (const d of deals.data ?? []) {
        items.push({
          id: `deal-${d.id}`,
          kind: "deal",
          title: d.title,
          body: null,
          at: d.created_at ?? "",
          meta: new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency: d.currency ?? "BRL",
          }).format(Number(d.value ?? 0)),
        });
      }

      const conversationIds = (conversations.data ?? []).map((c) => c.id);
      if (conversationIds.length > 0) {
        const { data: messages, error } = await supabase
          .from("conversation_messages")
          .select("id, content, direction, is_from_ai, is_internal_note, sent_at")
          .in("conversation_id", conversationIds)
          .order("sent_at", { ascending: false })
          .limit(50);
        if (error) throw error;

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

      return items
        .filter((item) => item.at)
        .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    },
  });
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import type { Database } from "@/integrations/supabase/types";

export type ScoringRule = Database["public"]["Tables"]["lead_scoring_rules"]["Row"];
export type ScoreHistory = Database["public"]["Tables"]["lead_score_history"]["Row"];

/** Eventos que podem pontuar um lead. */
export const SCORING_EVENTS = [
  { value: "message_received", label: "Mensagem recebida" },
  { value: "conversation_started", label: "Nova conversa iniciada" },
  { value: "email_opened", label: "Email aberto" },
  { value: "email_clicked", label: "Link de email clicado" },
  { value: "form_submitted", label: "Formulário submetido" },
  { value: "whatsapp_replied", label: "Respondeu no WhatsApp" },
  { value: "meeting_booked", label: "Reunião agendada" },
  { value: "deal_created", label: "Negócio criado" },
] as const;

/** Valor sentinela do dropdown de canal — "sem canal" vira NULL no banco. */
export const ALL_CHANNELS = "__all__";

/**
 * Regra sem canal (channel NULL) vale para todos os canais; com canal, só para
 * aquele. Havendo as duas para o mesmo evento, a do canal vence — a precedência
 * é resolvida no banco por pick_lead_scoring_rule(), não aqui.
 */
export type ScoringChannel = string | null;

export function useScoringRules() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["scoring-rules", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<ScoringRule[]> => {
      const { data, error } = await supabase
        .from("lead_scoring_rules")
        .select("*")
        .eq("org_id", orgId!)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveScoringRule() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      label: string;
      event_type: string;
      points: number;
      channel?: ScoringChannel;
      is_active?: boolean;
    }) => {
      if (!orgId) throw new Error("Organização não carregada.");
      if (input.id) {
        const { error } = await supabase
          .from("lead_scoring_rules")
          .update({
            label: input.label,
            event_type: input.event_type,
            points: input.points,
            ...(input.channel !== undefined ? { channel: input.channel } : {}),
            ...(input.is_active !== undefined ? { is_active: input.is_active } : {}),
          })
          .eq("id", input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("lead_scoring_rules").insert({
          org_id: orgId,
          label: input.label,
          event_type: input.event_type,
          points: input.points,
          channel: input.channel ?? null,
        });
        // O índice único por (org, evento, canal) impede duas regras iguais —
        // sem isso a pontuação ficaria não-determinística. Traduz para uma
        // mensagem que diz o que fazer.
        if (error) {
          if (error.code === "23505") {
            throw new Error(
              "Já existe uma regra para esse evento neste canal. Edite a existente em vez de criar outra.",
            );
          }
          throw error;
        }
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["scoring-rules", orgId] }),
  });
}

export function useDeleteScoringRule() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("lead_scoring_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["scoring-rules", orgId] }),
  });
}

/** Histórico de pontuação de um contato específico. */
export function useScoreHistory(contactId: string | null) {
  return useQuery({
    queryKey: ["score-history", contactId],
    enabled: !!contactId,
    queryFn: async (): Promise<ScoreHistory[]> => {
      const { data, error } = await supabase
        .from("lead_score_history")
        .select("*")
        .eq("contact_id", contactId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

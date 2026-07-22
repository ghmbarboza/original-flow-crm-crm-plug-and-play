import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import type { Database } from "@/integrations/supabase/types";

export type ScoringRule = Database["public"]["Tables"]["lead_scoring_rules"]["Row"];
export type ScoreHistory = Database["public"]["Tables"]["lead_score_history"]["Row"];

/** Eventos que podem pontuar um lead. */
export const SCORING_EVENTS = [
  { value: "email_opened", label: "Email aberto" },
  { value: "email_clicked", label: "Link de email clicado" },
  { value: "form_submitted", label: "Formulário submetido" },
  { value: "whatsapp_replied", label: "Respondeu no WhatsApp" },
  { value: "meeting_booked", label: "Reunião agendada" },
  { value: "deal_created", label: "Negócio criado" },
] as const;

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
    mutationFn: async (input: { id?: string; label: string; event_type: string; points: number; is_active?: boolean }) => {
      if (!orgId) throw new Error("Organização não carregada.");
      if (input.id) {
        const { error } = await supabase
          .from("lead_scoring_rules")
          .update({
            label: input.label,
            event_type: input.event_type,
            points: input.points,
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
        });
        if (error) throw error;
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

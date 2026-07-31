import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import type { Database } from "@/integrations/supabase/types";
import type { ReportFilters } from "@/hooks/useReports";

export type NpsConfig = Database["public"]["Tables"]["nps_configs"]["Row"];
export type NpsResponse = Database["public"]["Tables"]["nps_responses"]["Row"];

/** Canais onde o NPS pode ser enviado (os que têm envio de texto hoje). */
export const NPS_CHANNELS = ["whatsapp", "instagram", "telegram"] as const;

export function useNpsConfig() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["nps-config", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<NpsConfig | null> => {
      const { data, error } = await supabase
        .from("nps_configs")
        .select("*")
        .eq("org_id", orgId!)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });
}

export function useSaveNpsConfig() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (patch: {
      is_active: boolean;
      message: string;
      thank_you_message: string;
      delay_minutes: number;
      active_channels: string[];
    }) => {
      if (!orgId) throw new Error("Organização não carregada. Recarregue a página.");
      const { error } = await supabase.from("nps_configs").upsert(
        { org_id: orgId, ...patch, updated_at: new Date().toISOString() },
        { onConflict: "org_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["nps-config", orgId] }),
  });
}

export interface NpsReport {
  /** NPS clássico: % promotores (9-10) − % detratores (0-6). */
  nps: number | null;
  responses: number;
  surveysSent: number;
  promoters: number;
  passives: number;
  detractors: number;
  byAgent: { key: string; nps: number; count: number }[];
  byChannel: { key: string; nps: number; count: number }[];
  comments: { comment: string; score: number; responded_at: string }[];
}

function computeNps(scores: number[]): number | null {
  if (scores.length === 0) return null;
  const promoters = scores.filter((s) => s >= 9).length;
  const detractors = scores.filter((s) => s <= 6).length;
  return Math.round(((promoters - detractors) / scores.length) * 100);
}

/** Relatório de NPS: média/distribuição por período, agente e canal. */
export function useNpsReport(filters: ReportFilters) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["nps-report", orgId, filters],
    enabled: !!orgId,
    queryFn: async (): Promise<NpsReport> => {
      let query = supabase
        .from("nps_responses")
        .select("score, comment, channel, agent_id, sent_at, responded_at")
        .eq("org_id", orgId!)
        .gte("sent_at", filters.from)
        .lte("sent_at", filters.to);
      if (filters.channel) query = query.eq("channel", filters.channel);
      if (filters.ownerId) query = query.eq("agent_id", filters.ownerId);

      const { data, error } = await query;
      if (error) throw error;
      const rows = data ?? [];
      const answered = rows.filter((r) => r.score !== null);
      const scores = answered.map((r) => Number(r.score));

      const group = (keyOf: (r: (typeof rows)[number]) => string | null) => {
        const groups = new Map<string, number[]>();
        for (const r of answered) {
          const key = keyOf(r);
          if (!key) continue;
          const list = groups.get(key) ?? [];
          list.push(Number(r.score));
          groups.set(key, list);
        }
        return [...groups.entries()]
          .map(([key, values]) => ({ key, nps: computeNps(values) ?? 0, count: values.length }))
          .sort((a, b) => b.nps - a.nps);
      };

      return {
        nps: computeNps(scores),
        responses: answered.length,
        surveysSent: rows.length,
        promoters: scores.filter((s) => s >= 9).length,
        passives: scores.filter((s) => s >= 7 && s <= 8).length,
        detractors: scores.filter((s) => s <= 6).length,
        byAgent: group((r) => r.agent_id),
        byChannel: group((r) => r.channel),
        comments: answered
          .filter((r) => r.comment)
          .sort((a, b) => (b.responded_at ?? "").localeCompare(a.responded_at ?? ""))
          .slice(0, 20)
          .map((r) => ({ comment: r.comment!, score: Number(r.score), responded_at: r.responded_at! })),
      };
    },
  });
}

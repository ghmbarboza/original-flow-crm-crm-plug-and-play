import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";

export interface ReportFilters {
  /** Início do período (ISO). */
  from: string;
  /** Fim do período (ISO). */
  to: string;
  ownerId?: string | null;
}

export interface ReportData {
  deals: {
    byStage: { stage: string; color: string; count: number; value: number }[];
    open: number;
    won: number;
    lost: number;
    forecast: number;
    wonValue: number;
  };
  conversations: {
    total: number;
    open: number;
    closed: number;
    ai: number;
    human: number;
  };
  leads: {
    total: number;
    bySource: { source: string; count: number }[];
  };
}

/**
 * Agrega as métricas do período para /reports.
 *
 * Faz as consultas em paralelo e monta os recortes por etapa, status de conversa
 * e origem de lead. O forecast é a soma de `value * probability` dos deals abertos.
 */
export function useReports(filters: ReportFilters) {
  const orgId = useOrgId();

  return useQuery({
    queryKey: ["reports", orgId, filters],
    enabled: !!orgId,
    queryFn: async (): Promise<ReportData> => {
      const dealsQuery = supabase
        .from("deals")
        .select("value, probability, status, stage:pipeline_stages(name, color), owner_id, created_at")
        .eq("org_id", orgId!)
        .gte("created_at", filters.from)
        .lte("created_at", filters.to);

      const [deals, conversations, contacts] = await Promise.all([
        filters.ownerId ? dealsQuery.eq("owner_id", filters.ownerId) : dealsQuery,
        supabase
          .from("conversations")
          .select("status, created_at")
          .eq("org_id", orgId!)
          .gte("created_at", filters.from)
          .lte("created_at", filters.to),
        supabase
          .from("contacts")
          .select("source, status, created_at")
          .eq("org_id", orgId!)
          .is("merged_into_id", null)
          .gte("created_at", filters.from)
          .lte("created_at", filters.to),
      ]);

      if (deals.error) throw deals.error;
      if (conversations.error) throw conversations.error;
      if (contacts.error) throw contacts.error;

      // Deals por etapa.
      const stageMap = new Map<string, { stage: string; color: string; count: number; value: number }>();
      let open = 0, won = 0, lost = 0, forecast = 0, wonValue = 0;
      for (const d of deals.data ?? []) {
        const stage = d.stage as { name?: string; color?: string } | null;
        const key = stage?.name ?? "Sem etapa";
        const entry = stageMap.get(key) ?? { stage: key, color: stage?.color ?? "#667085", count: 0, value: 0 };
        entry.count += 1;
        entry.value += Number(d.value ?? 0);
        stageMap.set(key, entry);
        if (d.status === "open") { open += 1; forecast += Number(d.value ?? 0) * (Number(d.probability ?? 0) / 100); }
        if (d.status === "won") { won += 1; wonValue += Number(d.value ?? 0); }
        if (d.status === "lost") lost += 1;
      }

      // Conversas.
      let cOpen = 0, cClosed = 0, ai = 0, human = 0;
      for (const c of conversations.data ?? []) {
        if (c.status === "closed") cClosed += 1;
        else cOpen += 1;
        if (c.status === "ai_active") ai += 1;
        if (c.status === "human_takeover") human += 1;
      }

      // Leads por origem.
      const sourceMap = new Map<string, number>();
      for (const c of contacts.data ?? []) {
        const key = c.source || "Sem origem";
        sourceMap.set(key, (sourceMap.get(key) ?? 0) + 1);
      }

      return {
        deals: {
          byStage: [...stageMap.values()],
          open, won, lost, forecast, wonValue,
        },
        conversations: {
          total: conversations.data?.length ?? 0,
          open: cOpen, closed: cClosed, ai, human,
        },
        leads: {
          total: contacts.data?.length ?? 0,
          bySource: [...sourceMap.entries()].map(([source, count]) => ({ source, count })),
        },
      };
    },
  });
}

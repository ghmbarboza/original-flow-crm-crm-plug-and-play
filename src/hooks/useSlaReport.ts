import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import type { ReportFilters } from "@/hooks/useReports";

export interface SlaBreachRow {
  id: string;
  name: string;
  channel: string | null;
  created_at: string;
  first_response_minutes: number | null;
  assigned_to: string | null;
}

export interface SlaAverage {
  key: string;
  avgMinutes: number;
  count: number;
}

export interface SlaReport {
  /** Conversas do período com primeira resposta registrada. */
  answered: number;
  avgFirstResponseMinutes: number | null;
  /** % de conversas do período que não violaram o SLA. */
  withinRate: number | null;
  totalConsidered: number;
  byAgent: SlaAverage[];
  byChannel: SlaAverage[];
  breaches: SlaBreachRow[];
}

/**
 * Relatório de SLA (Parte 8 do Sprint 10A), calculado sobre o log gravado
 * pelos triggers em conversations: tempo médio de primeira resposta por
 * agente e canal, taxa dentro do SLA e a lista das violações.
 */
export function useSlaReport(filters: ReportFilters) {
  const orgId = useOrgId();

  return useQuery({
    queryKey: ["sla-report", orgId, filters],
    enabled: !!orgId,
    queryFn: async (): Promise<SlaReport> => {
      let query = supabase
        .from("conversations")
        .select("id, channel, assigned_to, created_at, first_response_at, first_response_minutes, sla_breached, channel_contact_name, phone_number, contact:contacts(first_name, last_name)")
        .eq("org_id", orgId!)
        .gte("created_at", filters.from)
        .lte("created_at", filters.to);
      if (filters.channel) query = query.eq("channel", filters.channel);
      if (filters.ownerId) query = query.eq("assigned_to", filters.ownerId);

      const { data, error } = await query;
      if (error) throw error;

      interface Row {
        id: string;
        channel: string | null;
        assigned_to: string | null;
        created_at: string;
        first_response_at: string | null;
        first_response_minutes: number | null;
        sla_breached: boolean;
        channel_contact_name: string | null;
        phone_number: string;
        contact: { first_name: string; last_name: string | null } | null;
      }
      const rows = (data ?? []) as unknown as Row[];

      const answeredRows = rows.filter((r) => r.first_response_minutes !== null);
      const avg = (values: number[]) =>
        values.length ? Math.round(values.reduce((s, v) => s + v, 0) / values.length) : null;

      const groupAvg = (keyOf: (r: Row) => string | null): SlaAverage[] => {
        const groups = new Map<string, number[]>();
        for (const r of answeredRows) {
          const key = keyOf(r);
          if (!key) continue;
          const list = groups.get(key) ?? [];
          list.push(r.first_response_minutes!);
          groups.set(key, list);
        }
        return [...groups.entries()]
          .map(([key, values]) => ({ key, avgMinutes: avg(values) ?? 0, count: values.length }))
          .sort((a, b) => a.avgMinutes - b.avgMinutes);
      };

      const nome = (r: Row) =>
        [r.contact?.first_name, r.contact?.last_name].filter(Boolean).join(" ").trim() ||
        r.channel_contact_name ||
        r.phone_number;

      return {
        answered: answeredRows.length,
        avgFirstResponseMinutes: avg(answeredRows.map((r) => r.first_response_minutes!)),
        withinRate: rows.length
          ? Math.round(((rows.length - rows.filter((r) => r.sla_breached).length) / rows.length) * 100)
          : null,
        totalConsidered: rows.length,
        byAgent: groupAvg((r) => r.assigned_to),
        byChannel: groupAvg((r) => r.channel ?? "whatsapp"),
        breaches: rows
          .filter((r) => r.sla_breached)
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .slice(0, 50)
          .map((r) => ({
            id: r.id,
            name: nome(r),
            channel: r.channel,
            created_at: r.created_at,
            first_response_minutes: r.first_response_minutes,
            assigned_to: r.assigned_to,
          })),
      };
    },
  });
}

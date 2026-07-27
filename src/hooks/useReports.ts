import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";

export interface ReportFilters {
  /** Início do período (ISO). */
  from: string;
  /** Fim do período (ISO). */
  to: string;
  ownerId?: string | null;
  /** Canal das conversas. null = todos. */
  channel?: string | null;
}

export interface ChannelConversion {
  channel: string;
  conversations: number;
  /** Deals criados a partir de contatos que conversaram por este canal. */
  deals: number;
  /** deals / conversations, em porcentagem. */
  rate: number;
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
    /** Volume por canal, do maior para o menor. */
    byChannel: { channel: string; count: number }[];
  };
  leads: {
    total: number;
    bySource: { source: string; count: number }[];
  };
  /** Conversão conversa → deal por canal, e qual canal converte melhor. */
  conversion: {
    byChannel: ChannelConversion[];
    bestChannel: string | null;
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
        .select("value, probability, status, stage:pipeline_stages(name, color), owner_id, contact_id, created_at")
        .eq("org_id", orgId!)
        .gte("created_at", filters.from)
        .lte("created_at", filters.to);

      // Conversas trazem contact_id para cruzar com deals na taxa de conversão.
      let conversationsQuery = supabase
        .from("conversations")
        .select("status, channel, contact_id, created_at")
        .eq("org_id", orgId!)
        .gte("created_at", filters.from)
        .lte("created_at", filters.to);
      if (filters.channel) conversationsQuery = conversationsQuery.eq("channel", filters.channel);

      const [deals, conversations, contacts] = await Promise.all([
        filters.ownerId ? dealsQuery.eq("owner_id", filters.ownerId) : dealsQuery,
        conversationsQuery,
        supabase
          .from("contacts")
          .select("id, source, status, created_at")
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

      // Conversas: totais, recorte por canal e contatos alcançados em cada canal.
      let cOpen = 0, cClosed = 0, ai = 0, human = 0;
      const channelCount = new Map<string, number>();
      const contactsByChannel = new Map<string, Set<string>>();
      for (const c of conversations.data ?? []) {
        if (c.status === "closed") cClosed += 1;
        else cOpen += 1;
        if (c.status === "ai_active") ai += 1;
        if (c.status === "human_takeover") human += 1;

        const channel = c.channel ?? "whatsapp";
        channelCount.set(channel, (channelCount.get(channel) ?? 0) + 1);
        if (c.contact_id) {
          const set = contactsByChannel.get(channel) ?? new Set<string>();
          set.add(c.contact_id);
          contactsByChannel.set(channel, set);
        }
      }

      // Conversão por canal: deals do período cujo contato conversou naquele
      // canal. Um contato que falou por dois canais conta nos dois — a métrica
      // é "qual canal participou de negócios", não atribuição exclusiva.
      const dealContacts = new Set(
        (deals.data ?? []).map((d) => d.contact_id).filter(Boolean) as string[],
      );
      const byChannelConversion: ChannelConversion[] = [...channelCount.entries()]
        .map(([channel, count]) => {
          const reached = contactsByChannel.get(channel) ?? new Set<string>();
          let dealCount = 0;
          for (const contactId of reached) if (dealContacts.has(contactId)) dealCount += 1;
          return {
            channel,
            conversations: count,
            deals: dealCount,
            rate: count > 0 ? (dealCount / count) * 100 : 0,
          };
        })
        .sort((a, b) => b.rate - a.rate);

      // Só destaca "melhor canal" com volume mínimo: 1 conversa que virou deal
      // daria 100% e enganaria a leitura.
      const best = byChannelConversion.find((c) => c.conversations >= 5 && c.deals > 0) ?? null;

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
          byChannel: [...channelCount.entries()]
            .map(([channel, count]) => ({ channel, count }))
            .sort((a, b) => b.count - a.count),
        },
        leads: {
          total: contacts.data?.length ?? 0,
          bySource: [...sourceMap.entries()].map(([source, count]) => ({ source, count })),
        },
        conversion: {
          byChannel: byChannelConversion,
          bestChannel: best?.channel ?? null,
        },
      };
    },
  });
}

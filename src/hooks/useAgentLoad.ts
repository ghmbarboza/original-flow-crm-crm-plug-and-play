import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import type { Database } from "@/integrations/supabase/types";

export type ChannelDistributionConfig =
  Database["public"]["Tables"]["channel_distribution_configs"]["Row"];

export interface AgentLoadRow {
  agentId: string;
  agentName: string;
  /** Conversas ativas por canal. */
  byChannel: Record<string, number>;
  total: number;
  unread: number;
  /** Canais em que o agente bateu o teto configurado. */
  atCapacity: string[];
}

/**
 * Carga de atendimento por agente, agregada da view agent_conversation_load.
 *
 * A view soma conversas ativas (ai_active + human_takeover) por agente e canal.
 * Ela é security_invoker, então o RLS de conversations se aplica e cada usuário
 * só enxerga a própria organização.
 */
export function useAgentLoad() {
  const orgId = useOrgId();

  return useQuery({
    queryKey: ["agent-load", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<{ rows: AgentLoadRow[]; channels: string[] }> => {
      const [load, profiles, configs] = await Promise.all([
        supabase
          .from("agent_conversation_load")
          .select("agent_id, channel, active_conversations, total_unread")
          .eq("org_id", orgId!),
        supabase
          .from("profiles")
          .select("id, full_name")
          .eq("org_id", orgId!)
          .eq("is_active", true)
          .eq("is_approved", true),
        supabase
          .from("channel_distribution_configs")
          .select("channel, max_conversations_per_agent")
          .eq("org_id", orgId!),
      ]);

      if (load.error) throw load.error;
      if (profiles.error) throw profiles.error;

      const limits = new Map<string, number>();
      for (const c of configs.data ?? []) {
        if (c.max_conversations_per_agent != null) {
          limits.set(c.channel, c.max_conversations_per_agent);
        }
      }

      // Canais presentes na carga — a tabela só mostra coluna do que existe.
      const channels = [...new Set((load.data ?? []).map((r) => r.channel ?? "whatsapp"))].sort();

      const byAgent = new Map<string, AgentLoadRow>();
      // Todo agente ativo aparece, mesmo com zero conversas: o painel serve
      // tanto para ver sobrecarga quanto para ver quem está ocioso.
      for (const p of profiles.data ?? []) {
        byAgent.set(p.id, {
          agentId: p.id,
          agentName: p.full_name ?? "(sem nome)",
          byChannel: {},
          total: 0,
          unread: 0,
          atCapacity: [],
        });
      }

      for (const row of load.data ?? []) {
        if (!row.agent_id) continue;
        const entry = byAgent.get(row.agent_id);
        if (!entry) continue; // agente inativo ou de outra org
        const channel = row.channel ?? "whatsapp";
        const count = Number(row.active_conversations ?? 0);
        entry.byChannel[channel] = count;
        entry.total += count;
        entry.unread += Number(row.total_unread ?? 0);
        const limit = limits.get(channel);
        if (limit !== undefined && count >= limit) entry.atCapacity.push(channel);
      }

      const rows = [...byAgent.values()].sort((a, b) => b.total - a.total);
      return { rows, channels };
    },
  });
}

/**
 * Mantém o painel vivo.
 *
 * Realtime do Supabase não publica mudanças de VIEW — só de tabela. Então
 * assinamos `conversations` (a origem da view) e reconsultamos a agregação a
 * cada evento, em vez de tentar assinar agent_conversation_load.
 */
export function useAgentLoadRealtime() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!orgId) return;
    const channel = supabase
      .channel(`agent-load:${orgId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `org_id=eq.${orgId}`,
        },
        () => queryClient.invalidateQueries({ queryKey: ["agent-load", orgId] }),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, queryClient]);
}

/** Conversas ativas de um agente — usado ao abrir o detalhe no painel. */
export function useAgentConversations(agentId: string | null) {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["agent-conversations", orgId, agentId],
    enabled: !!orgId && !!agentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("id, channel, status, unread_count, last_message_at, last_message_preview, phone_number, contact:contacts(first_name, last_name)")
        .eq("org_id", orgId!)
        .eq("assigned_to", agentId!)
        .in("status", ["ai_active", "human_takeover"])
        .order("last_message_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Reatribui uma conversa a outro agente (ou devolve à fila com null). */
export function useReassignConversation() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ conversationId, agentId }: { conversationId: string; agentId: string | null }) => {
      const { error } = await supabase
        .from("conversations")
        .update({ assigned_to: agentId, updated_at: new Date().toISOString() })
        .eq("id", conversationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-load", orgId] });
      queryClient.invalidateQueries({ queryKey: ["agent-conversations", orgId] });
    },
  });
}

/** Configuração de distribuição por canal. */
export function useChannelDistribution() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["channel-distribution", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<ChannelDistributionConfig[]> => {
      const { data, error } = await supabase
        .from("channel_distribution_configs")
        .select("*")
        .eq("org_id", orgId!)
        .order("channel");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveChannelDistribution() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      channel: string;
      distribution_mode: Database["public"]["Enums"]["distribution_mode"];
      offline_timeout_minutes: number;
      max_conversations_per_agent: number | null;
    }) => {
      if (!orgId) throw new Error("Organização não carregada.");
      // Upsert pela chave (org, canal): a tabela tem UNIQUE nesse par.
      const { error } = await supabase
        .from("channel_distribution_configs")
        .upsert(
          { org_id: orgId, ...input, updated_at: new Date().toISOString() },
          { onConflict: "org_id,channel" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["channel-distribution", orgId] });
      queryClient.invalidateQueries({ queryKey: ["agent-load", orgId] });
    },
  });
}

export function useDeleteChannelDistribution() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (channel: string) => {
      const { error } = await supabase
        .from("channel_distribution_configs")
        .delete()
        .eq("org_id", orgId!)
        .eq("channel", channel);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["channel-distribution", orgId] }),
  });
}

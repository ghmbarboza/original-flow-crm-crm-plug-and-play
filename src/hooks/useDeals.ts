import { useEffect, useId } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import type { Database } from "@/integrations/supabase/types";

export type DealStatus = Database["public"]["Enums"]["deal_status"];
type DealRow = Database["public"]["Tables"]["deals"]["Row"];
export type DealInsert = Database["public"]["Tables"]["deals"]["Insert"];
export type PipelineStage = Database["public"]["Tables"]["pipeline_stages"]["Row"];
export type LossReason = Database["public"]["Tables"]["loss_reasons"]["Row"];

/** Qualificação BANT. Guardada em `deals.qualification` (JSONB). */
export interface Qualification {
  budget: string | null;
  authority: string | null;
  need: string | null;
  timeline: string | null;
}

export const EMPTY_QUALIFICATION: Qualification = {
  budget: null,
  authority: null,
  need: null,
  timeline: null,
};

/** Deal no recorte do Kanban e da lista: já traz etapa, contato e empresa embutidos. */
export interface Deal extends DealRow {
  stage: { id: string; name: string; color: string; order: number } | null;
  contact: { id: string; first_name: string; last_name: string | null } | null;
  company: { id: string; name: string } | null;
}

const SELECT = `
  *,
  stage:pipeline_stages(id, name, color, order),
  contact:contacts(id, first_name, last_name),
  company:companies(id, name)
` as const;

/** Nome de exibição do contato ligado ao deal. */
export function contactName(contact: Deal["contact"]): string | null {
  if (!contact) return null;
  return [contact.first_name, contact.last_name].filter(Boolean).join(" ").trim() || null;
}

/**
 * Etapas do pipeline padrão da organização, em ordem. O Kanban desenha uma
 * coluna por etapa; sem etapas o board nasce vazio (a org já chega com o
 * pipeline default via trigger `seed_default_pipeline`).
 */
export function useStages() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["pipeline-stages", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<PipelineStage[]> => {
      // Pega o pipeline default; se não houver flag, o primeiro criado.
      const { data: pipelines, error: pErr } = await supabase
        .from("pipelines")
        .select("id, is_default, created_at")
        .eq("org_id", orgId!)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(1);
      if (pErr) throw pErr;
      const pipelineId = pipelines?.[0]?.id;
      if (!pipelineId) return [];

      const { data, error } = await supabase
        .from("pipeline_stages")
        .select("*")
        .eq("pipeline_id", pipelineId)
        .order("order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useLossReasons() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["loss-reasons", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<LossReason[]> => {
      const { data, error } = await supabase
        .from("loss_reasons")
        .select("*")
        .eq("org_id", orgId!)
        .order("order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Todos os deals da org, com etapa/contato/empresa embutidos e realtime.
 *
 * Realtime é exigência do guia para /deals: quando outro usuário arrasta um card
 * ou o valor muda, o board de todos atualiza. `deals` já tem REPLICA IDENTITY
 * FULL e está na publication `supabase_realtime` (migration de RLS/realtime).
 */
export function useDeals() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const instanceId = useId();

  useEffect(() => {
    if (!orgId) return;
    const channel = supabase
      .channel(`deals:${orgId}:${instanceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "deals", filter: `org_id=eq.${orgId}` },
        () => queryClient.invalidateQueries({ queryKey: ["deals", orgId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, queryClient, instanceId]);

  return useQuery({
    queryKey: ["deals", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<Deal[]> => {
      const { data, error } = await supabase
        .from("deals")
        .select(SELECT)
        .eq("org_id", orgId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Deal[];
    },
  });
}

export function useDeal(id: string | null) {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  const instanceId = useId();

  // O detalhe também é realtime: mover a etapa em outra aba, ou o cálculo do
  // valor pelos produtos, reflete sem recarregar a página.
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`deal:${id}:${instanceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "deals", filter: `id=eq.${id}` },
        () => queryClient.invalidateQueries({ queryKey: ["deal", id] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, queryClient, instanceId]);

  return useQuery({
    queryKey: ["deal", id],
    enabled: !!id && !!orgId,
    queryFn: async (): Promise<Deal | null> => {
      const { data, error } = await supabase
        .from("deals")
        .select(SELECT)
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as Deal | null;
    },
  });
}

export function useCreateDeal() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: Omit<DealInsert, "org_id">) => {
      if (!orgId) throw new Error("Organização não carregada. Recarregue a página.");
      const { data, error } = await supabase
        .from("deals")
        .insert({ ...input, org_id: orgId })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["deals", orgId] }),
  });
}

export function useUpdateDeal() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string } & Partial<DealInsert>) => {
      const { error } = await supabase
        .from("deals")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["deals", orgId] });
      queryClient.invalidateQueries({ queryKey: ["deal", id] });
    },
  });
}

/**
 * Move um deal para outra etapa (drag-and-drop do Kanban).
 *
 * Atualização otimista: o card salta de coluna na hora, antes do round-trip.
 * O realtime confirma; se o servidor recusar, o `onError` restaura o estado.
 * Ao mover, a probabilidade acompanha a `win_probability` da etapa de destino —
 * é o comportamento esperado de um pipeline: avançar de etapa move o forecast.
 */
export function useMoveDealStage() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      stageId,
      probability,
    }: {
      id: string;
      stageId: string;
      probability?: number;
    }) => {
      const patch: Partial<DealInsert> = { stage_id: stageId, updated_at: new Date().toISOString() };
      if (probability !== undefined) patch.probability = probability;
      const { error } = await supabase.from("deals").update(patch).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, stageId, probability }) => {
      await queryClient.cancelQueries({ queryKey: ["deals", orgId] });
      const previous = queryClient.getQueryData<Deal[]>(["deals", orgId]);
      queryClient.setQueryData<Deal[]>(["deals", orgId], (old) =>
        (old ?? []).map((deal) =>
          deal.id === id
            ? {
                ...deal,
                stage_id: stageId,
                probability: probability ?? deal.probability,
              }
            : deal,
        ),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["deals", orgId], context.previous);
      }
    },
    onSettled: (_data, _err, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["deals", orgId] });
      // O detalhe lê de ["deal", id]; sem isso a etapa só atualizaria pelo realtime.
      queryClient.invalidateQueries({ queryKey: ["deal", id] });
    },
  });
}

export function useDeleteDeal() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("deals").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["deals", orgId] }),
  });
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import type { UsoDaEtapa } from "@/lib/etapasFunil";

// Código que o banco devolve quando a etapa ainda tem negócio dentro
// (trigger trg_etapa_com_negocio).
const ETAPA_COM_NEGOCIO = "23503";

interface DadosDaEtapa {
  name: string;
  color: string;
  win_probability: number;
}

// O app não recarrega consulta sozinho (staleTime infinito): tudo que mostra
// nome, cor, ordem ou vínculo de etapa precisa ser invalidado aqui.
const CONSULTAS_COM_ETAPA = [
  "pipeline-stages", "deals", "capture-forms", "capture-form-targets", "stage-criteria", "ai-source-profiles",
] as const;

/** Recarrega tudo que desenha etapas (Kanban, formulários, IA, configurações). */
function useInvalidarEtapas() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();
  return () => Promise.all(
    CONSULTAS_COM_ETAPA.map((chave) => queryClient.invalidateQueries({ queryKey: [chave, orgId] })),
  );
}

/** Cria uma etapa no fim do funil. */
export function useCreateStage() {
  const orgId = useOrgId();
  const invalidar = useInvalidarEtapas();
  return useMutation({
    mutationFn: async (input: DadosDaEtapa & { pipelineId: string; order: number }) => {
      if (!orgId) throw new Error("Organização não carregada.");
      const { pipelineId, ...etapa } = input;
      const { error } = await supabase
        .from("pipeline_stages")
        .insert({ ...etapa, org_id: orgId, pipeline_id: pipelineId });
      if (error) throw error;
    },
    onSuccess: invalidar,
  });
}

/** Renomeia, troca a cor ou a probabilidade de ganho de uma etapa. */
export function useUpdateStage() {
  const invalidar = useInvalidarEtapas();
  return useMutation({
    mutationFn: async ({ id, ...patch }: DadosDaEtapa & { id: string }) => {
      const { error } = await supabase.from("pipeline_stages").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidar,
  });
}

/** Grava a nova ordem de todas as etapas do funil de uma vez. */
export function useReorderStages() {
  const invalidar = useInvalidarEtapas();
  return useMutation({
    mutationFn: async ({ pipelineId, stageIds }: { pipelineId: string; stageIds: string[] }) => {
      const { error } = await supabase.rpc("reorder_pipeline_stages", {
        _pipeline_id: pipelineId,
        _stage_ids: stageIds,
      });
      if (error) throw error;
    },
    // Em erro também recarrega: a tela volta para a ordem que está no banco.
    onSettled: invalidar,
  });
}

/** Exclui uma etapa vazia. Etapa com negócio o banco recusa. */
export function useDeleteStage() {
  const invalidar = useInvalidarEtapas();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pipeline_stages").delete().eq("id", id);
      if (!error) return;
      if (error.code === ETAPA_COM_NEGOCIO) {
        throw new Error("Esta etapa tem negócios. Mova os negócios para outra etapa antes de excluir.");
      }
      throw error;
    },
    onSuccess: invalidar,
  });
}

/**
 * O que depende da etapa hoje. Sempre consultado de novo ao abrir a exclusão:
 * o negócio pode ter sido movido no Kanban desde a última vez.
 */
export function useStageUsage(stageId: string) {
  return useQuery({
    queryKey: ["pipeline-stage-usage", stageId],
    staleTime: 0,
    gcTime: 0,
    queryFn: async (): Promise<UsoDaEtapa> => {
      const contar = { count: "exact", head: true } as const;
      const [negocios, formularios, perfis, gatilhos] = await Promise.all([
        supabase.from("deals").select("id", contar).eq("stage_id", stageId),
        supabase.from("capture_forms").select("id", contar).eq("target_stage_id", stageId),
        supabase.from("ai_source_profiles").select("id", contar).eq("initial_stage_id", stageId),
        supabase.from("pipeline_stages").select("id", contar).eq("move_on_reply_from_stage_id", stageId),
      ]);
      const falha = [negocios, formularios, perfis, gatilhos].find((r) => r.error)?.error;
      if (falha) throw falha;
      return {
        negocios: negocios.count ?? 0,
        formularios: formularios.count ?? 0,
        perfisDeOrigem: perfis.count ?? 0,
        gatilhosDeResposta: gatilhos.count ?? 0,
      };
    },
  });
}

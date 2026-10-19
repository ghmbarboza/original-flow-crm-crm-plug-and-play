import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import { useAIConfig } from "@/hooks/useAIConfig";
import { useOrgApiKey } from "@/hooks/useOrgApiKey";
import { statusDoCanal } from "@/lib/channelStatus";
import { useChannelAccounts } from "@/hooks/useChannelAccounts";
import { useSetupProgress } from "@/hooks/useSetup";

/**
 * Estado REAL de cada item do checklist final do onboarding.
 *
 * O checklist antigo lia `completed_steps`, ou seja, "o usuário passou por esta
 * etapa" — e mentia: uma instância Evolution presa em `connecting` (QR nunca
 * pareado) aparecia com check verde. Aqui cada item é verificado contra o dado
 * que realmente faz a feature funcionar.
 */
export interface ItemChecklist {
  ok: boolean;
  /** Texto extra quando não está ok — diz o que falta, não só "pendente". */
  detalhe?: string;
}

/** Quantas etapas de pipeline a org tem — pipeline só está pronto se existirem. */
function usePipelineStageCount() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["setup-checklist-stages", orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from("pipeline_stages")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId!);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useSetupChecklist() {
  const { data: contas } = useChannelAccounts();
  const { data: aiConfig } = useAIConfig();
  const { data: temChaveVoz } = useOrgApiKey("elevenlabs");
  const { data: totalEtapas } = usePipelineStageCount();
  const { data: progresso } = useSetupProgress();

  // Canal: mesma regra usada no card de Integrações (helper único).
  const canalStatus = statusDoCanal(contas);
  const canal: ItemChecklist = {
    ok: canalStatus.estado === "conectado",
    detalhe: canalStatus.detalhe,
  };

  const temPrompt = !!aiConfig?.system_prompt?.trim();
  const ia: ItemChecklist = {
    ok: !!aiConfig && aiConfig.is_active === true && temPrompt,
    detalhe: !aiConfig
      ? undefined
      : !temPrompt
        ? "IA em rascunho, sem instruções salvas — finalize em Configurações > IA"
        : aiConfig.is_active !== true
          ? "IA criada, mas desativada — ative em Configurações > IA"
          : undefined,
  };

  // Contar etapas não basta: toda org nasce com funil padrão (trigger de seed),
  // então stages > 0 é sempre verdade. O sinal honesto é a etapa do assistente:
  // concluída = revisou o funil; "pulado:" = ficou com o padrão sem revisar.
  const passos = progresso?.completed_steps ?? [];
  const pipelineRevisado = passos.includes("pipeline");
  const pipelinePulado = passos.includes("pulado:pipeline");
  const pipeline: ItemChecklist = {
    ok: progresso ? pipelineRevisado && (totalEtapas ?? 0) > 0 : (totalEtapas ?? 0) > 0,
    detalhe: pipelinePulado
      ? "Etapa pulada — aplicamos um funil padrão; ajuste as etapas na tela de Negócios"
      : undefined,
  };

  const voz: ItemChecklist = {
    ok: !!temChaveVoz && aiConfig?.voice_enabled === true,
    detalhe:
      temChaveVoz && aiConfig?.voice_enabled !== true
        ? "Chave salva, mas a voz está desativada — ative em Configurações > IA"
        : undefined,
  };

  return { canal, ia, pipeline, voz };
}

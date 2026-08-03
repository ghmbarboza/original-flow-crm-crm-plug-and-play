import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import { useAIConfig } from "@/hooks/useAIConfig";
import { useOrgApiKey } from "@/hooks/useOrgApiKey";
import { useWhatsAppSetup } from "@/hooks/useWhatsAppConfig";

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
  const { data: whatsapp } = useWhatsAppSetup();
  const { data: aiConfig } = useAIConfig();
  const { data: temChaveVoz } = useOrgApiKey("elevenlabs");
  const { data: totalEtapas } = usePipelineStageCount();

  // Canal: só conta conexão de fato estabelecida.
  const evolutionConectada = whatsapp?.evolution?.status === "connected";
  const metaVerificada = !!whatsapp?.meta?.webhook_verified && whatsapp?.meta?.is_active !== false;
  const zernioConectado =
    !!whatsapp?.zernio && ["connected", "active"].includes(whatsapp.zernio.status ?? "");
  const canalOk = evolutionConectada || metaVerificada || zernioConectado;
  const canalIniciado = !!whatsapp?.evolution || !!whatsapp?.meta || !!whatsapp?.zernio;

  const canal: ItemChecklist = {
    ok: canalOk,
    detalhe: canalOk
      ? undefined
      : canalIniciado
        ? "Canal configurado, aguardando pareamento — finalize em Configurações > Canais"
        : undefined,
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

  const pipeline: ItemChecklist = { ok: (totalEtapas ?? 0) > 0 };

  const voz: ItemChecklist = {
    ok: !!temChaveVoz && aiConfig?.voice_enabled === true,
    detalhe:
      temChaveVoz && aiConfig?.voice_enabled !== true
        ? "Chave salva, mas a voz está desativada — ative em Configurações > IA"
        : undefined,
  };

  return { canal, ia, pipeline, voz };
}

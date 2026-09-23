import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

/**
 * Garante que o contato tenha um negócio ABERTO no funil.
 *
 * Devolve o id do negócio (existente ou recém-criado), ou null quando não há
 * o que fazer — sem contato, sem funil configurado, ou a organização com a
 * criação automática desligada.
 *
 * Regra central: **um negócio aberto por contato**. Sem isso, cada conversa
 * nova (ou cada retomada de contato meses depois) abriria outro negócio e o
 * funil viraria uma lista de conversas repetidas.
 */
export async function garantirNegocioAberto(
  admin: SupabaseClient,
  orgId: string,
  contactId: string | null,
  titulo: string,
  opcoes: { respeitarConfig?: boolean } = {},
): Promise<string | null> {
  if (!contactId) return null;

  if (opcoes.respeitarConfig !== false) {
    const { data: org } = await admin
      .from("organizations")
      .select("auto_create_deal_on_conversation")
      .eq("id", orgId)
      .maybeSingle();
    if (org?.auto_create_deal_on_conversation === false) return null;
  }

  const { data: aberto } = await admin
    .from("deals")
    .select("id")
    .eq("org_id", orgId)
    .eq("contact_id", contactId)
    .eq("status", "open")
    .limit(1)
    .maybeSingle();
  if (aberto?.id) return aberto.id;

  // Primeira etapa do funil = menor `order`. O funil pode ter sido renomeado ou
  // reordenado pelo cliente, então nada de nome fixo.
  const { data: etapa } = await admin
    .from("pipeline_stages")
    .select("id, pipeline_id")
    .eq("org_id", orgId)
    .order("order", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!etapa?.id) return null;

  const { data: criado, error } = await admin
    .from("deals")
    .insert({
      org_id: orgId,
      contact_id: contactId,
      title: titulo,
      stage_id: etapa.id,
      status: "open",
      value: 0,
    })
    .select("id")
    .single();

  if (error) {
    console.error(`[negocio] falha ao abrir negócio para ${contactId}: ${error.message}`);
    return null;
  }
  return criado?.id ?? null;
}

/** Quem moveu o negócio, para o trigger tg_log_deal_change gravar na linha do tempo. */
export type OrigemMovimento = "ia" | "automacao" | "sistema";

/**
 * Move o negócio pela RPC mover_negocio, que carimba origem e motivo na
 * transação para o trigger de histórico. Atualizar `deals` direto a partir de
 * uma function registraria "por automação" sem motivo: por isso este é o único
 * caminho das functions para trocar de etapa.
 */
export async function moverNegocio(
  admin: SupabaseClient,
  dealId: string,
  stageId: string,
  origem: OrigemMovimento,
  motivo: string | null,
): Promise<boolean> {
  const { data, error } = await admin.rpc("mover_negocio", {
    p_deal: dealId,
    p_stage: stageId,
    p_origem: origem,
    p_motivo: motivo,
  });
  if (error) {
    console.error(`[negocio] mover_negocio falhou (${dealId} -> ${stageId}): ${error.message}`);
    return false;
  }
  return data === true;
}

export interface EtapaDoFunil {
  id: string;
  name: string;
  order: number;
  pipeline_id: string;
}

/**
 * Etapas do funil do negócio, em ordem. Sem negócio, usa o funil padrão da org
 * (o mesmo em que garantirNegocioAberto abre negócio novo).
 */
export async function carregarFunil(
  admin: SupabaseClient,
  orgId: string,
  dealStageId: string | null,
): Promise<EtapaDoFunil[]> {
  let pipelineId: string | null = null;
  if (dealStageId) {
    const { data } = await admin.from("pipeline_stages").select("pipeline_id").eq("id", dealStageId).maybeSingle();
    pipelineId = (data?.pipeline_id as string | undefined) ?? null;
  }
  if (!pipelineId) {
    const { data } = await admin
      .from("pipelines").select("id").eq("org_id", orgId)
      .order("is_default", { ascending: false }).order("created_at", { ascending: true })
      .limit(1).maybeSingle();
    pipelineId = (data?.id as string | undefined) ?? null;
  }
  if (!pipelineId) return [];
  const { data } = await admin
    .from("pipeline_stages").select("id, name, order, pipeline_id")
    .eq("org_id", orgId).eq("pipeline_id", pipelineId).order("order", { ascending: true });
  return (data ?? []) as EtapaDoFunil[];
}

/** Preferências de histórico da org (organizations.history_settings). */
export async function notasDaIAHabilitadas(admin: SupabaseClient, orgId: string): Promise<boolean> {
  const { data } = await admin.from("organizations").select("history_settings").eq("id", orgId).maybeSingle();
  const cfg = (data?.history_settings ?? {}) as { ai_notes?: boolean };
  return cfg.ai_notes !== false;
}

/**
 * Anotação da IA na linha do tempo do contato e do negócio (type 'note',
 * sem user_id: a ficha mostra "Anotação da IA"). Respeita history_settings.ai_notes.
 */
export async function registrarNotaIA(
  admin: SupabaseClient,
  dados: { orgId: string; contactId: string | null; dealId: string | null; titulo: string; corpo: string; isDemo?: boolean },
): Promise<void> {
  if (!(await notasDaIAHabilitadas(admin, dados.orgId))) return;
  const { error } = await admin.from("activities").insert({
    org_id: dados.orgId,
    type: "note",
    title: dados.titulo,
    body: dados.corpo,
    contact_id: dados.contactId,
    deal_id: dados.dealId,
    is_demo: dados.isDemo === true,
  });
  if (error) console.error(`[negocio] nota da IA não gravada: ${error.message}`);
}

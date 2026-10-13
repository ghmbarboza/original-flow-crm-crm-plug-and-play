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

  // Primeira etapa do funil PADRÃO = menor `order` dele. O funil pode ter sido
  // renomeado ou reordenado pelo cliente, então nada de nome fixo. Sem o filtro
  // de funil, uma organização com dois funis teria duas etapas na posição 0 e o
  // negócio nasceria em qualquer um.
  const [etapa] = await carregarFunil(admin, orgId, null);
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
  opcoes: { trocarFunil?: boolean } = {},
): Promise<boolean> {
  // Sem `trocarFunil`, a RPC recusa etapa de outro funil: IA, automação e
  // integração movem o negócio dentro do funil em que ele está.
  const { data, error } = await admin.rpc("mover_negocio", {
    p_deal: dealId,
    p_stage: stageId,
    p_origem: origem,
    p_motivo: motivo,
    p_trocar_funil: opcoes.trocarFunil === true,
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

/** Funil padrão da organização (o marcado como padrão; sem marca, o mais antigo). */
export async function funilPadrao(admin: SupabaseClient, orgId: string): Promise<string | null> {
  const { data } = await admin
    .from("pipelines").select("id").eq("org_id", orgId)
    .order("is_default", { ascending: false }).order("created_at", { ascending: true })
    .limit(1).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/** Funil em que o negócio está hoje (pela etapa dele); null se está sem etapa. */
export async function funilDoNegocio(admin: SupabaseClient, dealId: string): Promise<string | null> {
  const { data } = await admin
    .from("deals").select("stage:pipeline_stages(pipeline_id)").eq("id", dealId).maybeSingle();
  const etapa = data?.stage as { pipeline_id?: string } | { pipeline_id?: string }[] | null | undefined;
  const linha = Array.isArray(etapa) ? etapa[0] : etapa;
  return linha?.pipeline_id ?? null;
}

/** Todas as etapas da organização, de todos os funis, em ordem. */
export async function etapasDaOrganizacao(admin: SupabaseClient, orgId: string): Promise<EtapaDoFunil[]> {
  const { data } = await admin
    .from("pipeline_stages").select("id, name, order, pipeline_id")
    .eq("org_id", orgId).order("order", { ascending: true });
  return (data ?? []) as EtapaDoFunil[];
}

/** Etapa de menor ordem do funil pedido. */
export function primeiraEtapaDoFunil<T extends EtapaDoFunil>(etapas: readonly T[], pipelineId: string): T | null {
  const doFunil = etapas.filter((e) => e.pipeline_id === pipelineId);
  return doFunil.reduce<T | null>((menor, e) => (!menor || e.order < menor.order ? e : menor), null);
}

const mesmoNome = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Acha a etapa pelo nome sem misturar funis.
 *
 * Nomes como "Proposta" se repetem entre funis, então o nome sozinho não
 * identifica a etapa. Vale primeiro a do funil preferido. Fora dele só vale se
 * o nome existir em um único funil; repetido, devolve "ambigua" em vez de
 * escolher. Com `soNoFunil`, nunca sai do funil preferido (é o caso de mover um
 * negócio que já existe: o nome da etapa não pode trocá-lo de funil).
 */
export function resolverEtapaPorNome<T extends EtapaDoFunil>(
  etapas: readonly T[], nome: string, pipelinePreferido: string | null, opcoes: { soNoFunil?: boolean } = {},
): { etapa: T } | { erro: "inexistente" | "ambigua" } {
  const comNome = etapas.filter((e) => mesmoNome(e.name, nome));
  const noFunil = comNome.find((e) => e.pipeline_id === pipelinePreferido);
  if (noFunil) return { etapa: noFunil };
  if (opcoes.soNoFunil || comNome.length === 0) return { erro: "inexistente" };
  return comNome.length === 1 ? { etapa: comNome[0] } : { erro: "ambigua" };
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
  pipelineId ??= await funilPadrao(admin, orgId);
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

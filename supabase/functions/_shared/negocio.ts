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

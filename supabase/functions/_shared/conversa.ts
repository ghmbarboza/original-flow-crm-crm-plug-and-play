// Contato e conversa de quem mandou mensagem, à prova de rajada.
//
// POR QUE ISSO EXISTE: no WhatsApp o primeiro contato costuma chegar em várias
// mensagens seguidas, e cada uma vira uma invocação paralela do webhook. Todas
// fazem SELECT, não acham nada e tentam INSERT. Os índices únicos
// (uniq_contact_whatsapp_por_org e conversations_unique_channel_contact) barram
// as cópias, mas o erro era ignorado: a invocação ficava sem conversa e saía
// sem gravar a mensagem. O hard smoke de 14/09 mandou 6 mensagens simultâneas e
// só 1 ficou no CRM. Aqui quem perde a corrida adota a linha de quem ganhou.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const VIOLACAO_UNICA = "23505";

export interface ConversaResolvida {
  id: string;
  status: string;
  unread_count: number;
  /** true só para a invocação que de fato criou a conversa. */
  criada: boolean;
}

/**
 * Busca a conversa por org + telefone (+ canal e conta, quando informados) e
 * cria com o resultado de `novaConversa` se não existir. A fábrica só roda
 * quando vai criar: ela costuma sortear o atendente (pick_agent_for_channel), e
 * sortear para uma conversa que já existe avançaria o rodízio à toa. Devolve
 * null só em erro real, já logado.
 *
 * Com `channel_account_id`, a conversa é da CONTA (um número = uma conversa com
 * o lead). Conversa antiga do mesmo telefone sem conta é adotada por esta: o
 * histórico anterior a 16/10/2026 não se divide em duas conversas.
 */
export async function obterOuCriarConversa(
  admin: SupabaseClient,
  filtro: { org_id: string; phone_number: string; channel?: string; channel_account_id?: string | null },
  novaConversa: () => Promise<Record<string, unknown>>,
): Promise<ConversaResolvida | null> {
  const buscar = async (conta: string | null | "qualquer") => {
    let q = admin
      .from("conversations")
      .select("id, status, unread_count")
      .eq("org_id", filtro.org_id)
      .eq("phone_number", filtro.phone_number)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(1);
    if (filtro.channel) q = q.eq("channel", filtro.channel);
    if (conta === null) q = q.is("channel_account_id", null);
    else if (conta !== "qualquer") q = q.eq("channel_account_id", conta);
    const { data } = await q.maybeSingle();
    return data;
  };

  const conta = filtro.channel_account_id ?? null;
  // Sem conta informada (quem chama ainda não sabe por onde a conversa entrou),
  // qualquer conversa do telefone serve, como antes.
  const existente = await buscar(conta ?? "qualquer");
  if (existente) {
    return { id: existente.id, status: existente.status, unread_count: existente.unread_count ?? 0, criada: false };
  }

  if (conta) {
    const orfa = await buscar(null);
    if (orfa) {
      const { data: adotada } = await admin
        .from("conversations")
        .update({ channel_account_id: conta })
        .eq("id", orfa.id)
        .is("channel_account_id", null)
        .select("id")
        .maybeSingle();
      // Outra invocação pode ter adotado a mesma conversa para OUTRA conta no
      // meio do caminho; nesse caso ela já não é órfã e seguimos para criar.
      if (adotada) return { id: orfa.id, status: orfa.status, unread_count: orfa.unread_count ?? 0, criada: false };
    }
  }

  const { data: criada, error } = await admin
    .from("conversations")
    .insert({
      ...(await novaConversa()),
      org_id: filtro.org_id,
      phone_number: filtro.phone_number,
      ...(conta ? { channel_account_id: conta } : {}),
    })
    .select("id, status, unread_count")
    .single();
  if (criada) {
    return { id: criada.id, status: criada.status, unread_count: criada.unread_count ?? 0, criada: true };
  }

  if (error?.code === VIOLACAO_UNICA) {
    const vencedora = await buscar(conta ?? "qualquer");
    if (vencedora) {
      return { id: vencedora.id, status: vencedora.status, unread_count: vencedora.unread_count ?? 0, criada: false };
    }
  }
  console.error(`[conversa] não foi possível criar a conversa de ${filtro.phone_number}: ${error?.message ?? "sem retorno"}`);
  return null;
}

/**
 * Contato do WhatsApp por org + whatsapp_phone, criado com `novoContato` se não
 * existir. Mesma adoção em caso de corrida.
 */
export async function obterOuCriarContatoWhatsapp(
  admin: SupabaseClient,
  orgId: string,
  telefone: string,
  novoContato: Record<string, unknown>,
): Promise<{ id: string; avatar_synced_at: string | null } | null> {
  const buscar = async () => {
    const { data } = await admin
      .from("contacts")
      .select("id, avatar_synced_at")
      .eq("org_id", orgId)
      .eq("whatsapp_phone", telefone)
      .is("merged_into_id", null)
      .maybeSingle();
    return data;
  };

  const existente = await buscar();
  if (existente) return existente;

  const { data: criado, error } = await admin
    .from("contacts")
    .insert({ ...novoContato, org_id: orgId, whatsapp_phone: telefone })
    .select("id, avatar_synced_at")
    .single();
  if (criado) return criado;

  if (error?.code === VIOLACAO_UNICA) {
    const vencedor = await buscar();
    if (vencedor) return vencedor;
  }
  console.error(`[conversa] não foi possível criar o contato ${telefone}: ${error?.message ?? "sem retorno"}`);
  return null;
}

/**
 * Contato de canal sem telefone (Instagram, Messenger, Telegram...) por org +
 * `custom_fields.channel` + `custom_fields.channel_contact_id`, com o índice
 * uniq_contact_canal_por_org garantindo um só contato na rajada. `novo` é true
 * só para a invocação que de fato criou.
 */
export async function obterOuCriarContatoCanal(
  admin: SupabaseClient,
  orgId: string,
  canal: string,
  idNoCanal: string,
  novoContato: Record<string, unknown>,
): Promise<{ id: string; novo: boolean } | null> {
  const buscar = async () => {
    const { data } = await admin
      .from("contacts")
      .select("id")
      .eq("org_id", orgId)
      .eq("custom_fields->>channel", canal)
      .eq("custom_fields->>channel_contact_id", idNoCanal)
      .is("merged_into_id", null)
      .maybeSingle();
    return data;
  };

  const existente = await buscar();
  if (existente) return { id: existente.id, novo: false };

  const campos = (novoContato.custom_fields ?? {}) as Record<string, unknown>;
  const { data: criado, error } = await admin
    .from("contacts")
    .insert({
      ...novoContato,
      org_id: orgId,
      custom_fields: { ...campos, channel: canal, channel_contact_id: idNoCanal },
    })
    .select("id")
    .single();
  if (criado) return { id: criado.id, novo: true };

  if (error?.code === VIOLACAO_UNICA) {
    const vencedor = await buscar();
    if (vencedor) return { id: vencedor.id, novo: false };
  }
  console.error(`[conversa] não foi possível criar o contato ${canal}:${idNoCanal}: ${error?.message ?? "sem retorno"}`);
  return null;
}

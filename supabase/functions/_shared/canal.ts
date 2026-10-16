// Contas de canal (channel_accounts): por qual número ou conta uma conversa
// entrou e por qual ela sai.
//
// Antes, cada function escolhia "a instância ativa mais recente da org" para
// responder. Com vários números isso mandava a resposta pelo número errado.
// Aqui a regra é uma só: a conversa aponta para a conta pela qual entrou
// (channel_account_id) e tudo que sai dela volta pela mesma conta. Conversa
// antiga sem conta cai na primeira conta ativa do mesmo provedor (o que o CRM
// fazia até então), para o histórico continuar funcionando.
//
// Papel da conta: "passivo" só responde; "ativo" também inicia conversa
// (abordagem ativa e campanhas); "ambos" faz os dois.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export const ZERNIO_API = "https://zernio.com/api/v1";
export const GRAPH_VERSION = "v21.0";

export type Provedor = "evolution" | "meta_official" | "zernio";
export type PapelDaConta = "passivo" | "ativo" | "ambos";
export type ModoFunilDaConta = "inherit" | "auto" | "suggest";

export interface CredenciaisEvolution {
  server_url: string;
  api_key: string;
  instance_name: string;
}

export interface CredenciaisMeta {
  phone_number_id: string;
  access_token: string;
  business_account_id: string;
}

export interface CredenciaisZernio {
  api_key: string;
  profile_id: string;
  /** _id da conta no Zernio; null quando a conta foi herdada do histórico e ainda não casou. */
  account_id: string | null;
}

export interface ContaCanal {
  id: string;
  org_id: string;
  provider: Provedor;
  channel: string;
  label: string;
  role: PapelDaConta;
  ai_enabled: boolean;
  ai_instruction: string;
  ai_funnel_mode: ModoFunilDaConta;
  notifications_default: boolean;
  is_active: boolean;
  evolution: CredenciaisEvolution | null;
  meta: CredenciaisMeta | null;
  zernio: CredenciaisZernio | null;
}

const COLUNAS = [
  "id, org_id, provider, channel, label, role, ai_enabled, ai_instruction, ai_funnel_mode, notifications_default, is_active, created_at",
  "zernio_account_id",
  "evolution:evolution_configs(server_url, api_key, instance_name, is_active)",
  "meta:meta_configs(phone_number_id, access_token, business_account_id, is_active)",
].join(", ");

interface LinhaConta {
  id: string;
  org_id: string;
  provider: Provedor;
  channel: string;
  label: string;
  role: PapelDaConta;
  ai_enabled: boolean;
  ai_instruction: string;
  ai_funnel_mode: ModoFunilDaConta;
  notifications_default: boolean;
  is_active: boolean;
  zernio_account_id: string | null;
  evolution: (CredenciaisEvolution & { is_active: boolean }) | null;
  meta: (CredenciaisMeta & { is_active: boolean }) | null;
}

/** Credenciais do Zernio são por org (um profile), não por conta: uma leitura por chamada. */
async function zernioDaOrg(admin: SupabaseClient, orgId: string): Promise<{ api_key: string; profile_id: string } | null> {
  const { data } = await admin.from("zernio_configs").select("api_key, profile_id").eq("org_id", orgId).maybeSingle();
  return (data as { api_key: string; profile_id: string } | null) ?? null;
}

async function montar(admin: SupabaseClient, linhas: LinhaConta[]): Promise<ContaCanal[]> {
  const contas: ContaCanal[] = [];
  let zernio: { api_key: string; profile_id: string } | null | undefined;
  for (const l of linhas) {
    const base = {
      id: l.id, org_id: l.org_id, provider: l.provider, channel: l.channel, label: l.label, role: l.role,
      ai_enabled: l.ai_enabled, ai_instruction: l.ai_instruction ?? "", ai_funnel_mode: l.ai_funnel_mode,
      notifications_default: l.notifications_default, is_active: l.is_active,
      evolution: null, meta: null, zernio: null,
    } satisfies ContaCanal;
    if (l.provider === "evolution") {
      if (!l.evolution || !l.evolution.is_active) continue;
      const { is_active: _ignorado, ...cred } = l.evolution;
      contas.push({ ...base, evolution: cred });
    } else if (l.provider === "meta_official") {
      if (!l.meta || !l.meta.is_active) continue;
      const { is_active: _ignorado, ...cred } = l.meta;
      contas.push({ ...base, meta: cred });
    } else {
      if (zernio === undefined) zernio = await zernioDaOrg(admin, l.org_id);
      if (!zernio) continue;
      contas.push({ ...base, zernio: { ...zernio, account_id: l.zernio_account_id } });
    }
  }
  return contas;
}

/** Uma conta pelo id, com as credenciais do provedor. null se não existir ou o provedor estiver desligado. */
export async function carregarConta(admin: SupabaseClient, id: string): Promise<ContaCanal | null> {
  const { data } = await admin.from("channel_accounts").select(COLUNAS).eq("id", id).maybeSingle();
  if (!data) return null;
  const [conta] = await montar(admin, [data as unknown as LinhaConta]);
  return conta ?? null;
}

export interface FiltroContas {
  provider?: Provedor;
  channel?: string;
  /** "ativo" = pode iniciar conversa (role ativo ou ambos); "passivo" = pode responder (todas). */
  papel?: "ativo";
}

/** Contas ativas da org, na ordem em que foram conectadas. */
export async function contasDaOrg(admin: SupabaseClient, orgId: string, filtro: FiltroContas = {}): Promise<ContaCanal[]> {
  let q = admin.from("channel_accounts").select(COLUNAS).eq("org_id", orgId).eq("is_active", true).order("created_at", { ascending: true });
  if (filtro.provider) q = q.eq("provider", filtro.provider);
  if (filtro.channel) q = q.eq("channel", filtro.channel);
  if (filtro.papel === "ativo") q = q.in("role", ["ativo", "ambos"]);
  const { data } = await q;
  return montar(admin, ((data ?? []) as unknown) as LinhaConta[]);
}

export interface ConversaComConta {
  org_id: string;
  provider: string;
  channel?: string | null;
  channel_account_id?: string | null;
}

/**
 * Conta pela qual a conversa entrou. Sem conta gravada (conversa anterior a
 * esta versão), usa a primeira conta ativa do mesmo provedor e canal, que é o
 * comportamento antigo.
 */
export async function contaDaConversa(admin: SupabaseClient, conversa: ConversaComConta): Promise<ContaCanal | null> {
  if (conversa.channel_account_id) {
    const conta = await carregarConta(admin, conversa.channel_account_id);
    if (conta) return conta;
  }
  const provider = conversa.provider as Provedor;
  const canal = conversa.channel ?? "whatsapp";
  const contas = await contasDaOrg(admin, conversa.org_id, { provider, channel: provider === "zernio" ? canal : undefined });
  return contas[0] ?? null;
}

const ORDEM_PARA_ABORDAR: Provedor[] = ["evolution", "meta_official", "zernio"];

/**
 * Conta que pode INICIAR conversa (papel ativo ou ambos). Evolution primeiro
 * porque aceita texto livre; Meta e Zernio exigem template aprovado.
 */
export async function contaParaAbordagem(admin: SupabaseClient, orgId: string, canal = "whatsapp"): Promise<ContaCanal | null> {
  const contas = await contasDaOrg(admin, orgId, { channel: canal, papel: "ativo" });
  for (const provider of ORDEM_PARA_ABORDAR) {
    const conta = contas.find((c) => c.provider === provider);
    if (conta) return conta;
  }
  return null;
}

/**
 * Conta dos avisos de WhatsApp para a equipe e dos lembretes ao contato: a
 * marcada como padrão de notificações; sem marcação, a primeira que pode
 * iniciar conversa; por fim, qualquer conta ativa de WhatsApp.
 */
export async function contaDeNotificacoes(admin: SupabaseClient, orgId: string): Promise<ContaCanal | null> {
  const contas = await contasDaOrg(admin, orgId, { channel: "whatsapp" });
  const padrao = contas.find((c) => c.notifications_default);
  if (padrao) return padrao;
  for (const provider of ORDEM_PARA_ABORDAR) {
    const conta = contas.find((c) => c.provider === provider && (c.role === "ativo" || c.role === "ambos"));
    if (conta) return conta;
  }
  return contas[0] ?? null;
}

/** Bloco do prompt com as regras próprias deste número, ou vazio. */
export function instrucaoDaConta(conta: ContaCanal | null): string {
  const texto = (conta?.ai_instruction ?? "").trim();
  if (!texto) return "";
  const nome = conta?.label?.trim() || "este canal";
  return `\nEsta conversa chegou pelo canal "${nome}". Regras específicas deste canal:\n${texto}`;
}

/**
 * accountId do Zernio para enviar: o gravado na conta ou, para conta herdada
 * sem id, a conta conectada da plataforma no profile (comportamento antigo).
 */
export async function zernioAccountIdDaConta(conta: ContaCanal, canal: string): Promise<string | null> {
  if (!conta.zernio) return null;
  if (conta.zernio.account_id) return conta.zernio.account_id;
  const url = new URL(`${ZERNIO_API}/accounts`);
  url.searchParams.set("profileId", conta.zernio.profile_id);
  url.searchParams.set("platform", canal);
  url.searchParams.set("status", "connected");
  const resp = await fetch(url.toString(), { headers: { Authorization: `Bearer ${conta.zernio.api_key}` } });
  if (!resp.ok) return null;
  const data = await resp.json().catch(() => ({}));
  const accounts = (data.accounts ?? []) as { _id?: string; isActive?: boolean }[];
  return (accounts.find((a) => a.isActive) ?? accounts[0])?._id ?? null;
}

export interface ResultadoEnvio {
  ok: boolean;
  providerMessageId: string | null;
  motivo?: string;
}

const falha = (motivo: string): ResultadoEnvio => ({ ok: false, providerMessageId: null, motivo });

/**
 * Texto livre pela conta. Evolution e Meta mandam para o número; Zernio precisa
 * da conversa dele (provider_conversation_id), porque a API é por inbox.
 */
export async function enviarTextoPelaConta(
  conta: ContaCanal,
  destino: { phone_number: string; channel?: string | null; provider_conversation_id?: string | null },
  texto: string,
): Promise<ResultadoEnvio> {
  if (conta.provider === "evolution" && conta.evolution) {
    const resp = await fetch(`${conta.evolution.server_url}/message/sendText/${conta.evolution.instance_name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: conta.evolution.api_key },
      body: JSON.stringify({ number: destino.phone_number, text: texto }),
    });
    if (!resp.ok) return falha(`Evolution respondeu ${resp.status}`);
    const r = await resp.json().catch(() => ({}));
    return { ok: true, providerMessageId: r?.key?.id ?? null };
  }

  if (conta.provider === "meta_official" && conta.meta) {
    const resp = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${conta.meta.phone_number_id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${conta.meta.access_token}` },
      body: JSON.stringify({ messaging_product: "whatsapp", to: destino.phone_number, type: "text", text: { body: texto } }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      return falha(err?.error?.message ?? `Meta respondeu ${resp.status}`);
    }
    const r = await resp.json().catch(() => ({}));
    return { ok: true, providerMessageId: r?.messages?.[0]?.id ?? null };
  }

  if (conta.provider === "zernio" && conta.zernio) {
    if (!destino.provider_conversation_id) return falha("conversa do Zernio sem id do provedor (nenhuma mensagem recebida ainda)");
    const accountId = await zernioAccountIdDaConta(conta, destino.channel ?? conta.channel);
    if (!accountId) return falha(`nenhuma conta de ${destino.channel ?? conta.channel} conectada no Zernio`);
    const resp = await fetch(`${ZERNIO_API}/inbox/conversations/${destino.provider_conversation_id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${conta.zernio.api_key}` },
      body: JSON.stringify({ accountId, message: texto }),
    });
    if (!resp.ok) return falha(`Zernio respondeu ${resp.status}`);
    const r = await resp.json().catch(() => ({}));
    return { ok: true, providerMessageId: r?.data?.messageId ?? r?.message?._id ?? r?.messageId ?? null };
  }

  return falha(`conta sem credenciais do provedor ${conta.provider}`);
}

/**
 * Garante a conta de uma plataforma do Zernio (criada quando o webhook ou a
 * listagem de contas apresenta um accountId novo). Devolve o id da conta.
 */
export async function garantirContaZernio(
  admin: SupabaseClient,
  orgId: string,
  accountId: string,
  canal: string,
  label: string | null,
): Promise<string | null> {
  const { data: existente } = await admin
    .from("channel_accounts").select("id").eq("org_id", orgId).eq("zernio_account_id", accountId).maybeSingle();
  if (existente?.id) return existente.id as string;
  const { data: criada, error } = await admin
    .from("channel_accounts")
    .insert({ org_id: orgId, provider: "zernio", channel: canal, zernio_account_id: accountId, label: label ?? `${canal} (Zernio)` })
    .select("id").single();
  if (criada?.id) return criada.id as string;
  // Corrida com outra invocação: adota a linha que venceu.
  const { data: vencedora } = await admin
    .from("channel_accounts").select("id").eq("org_id", orgId).eq("zernio_account_id", accountId).maybeSingle();
  if (vencedora?.id) return vencedora.id as string;
  console.error(`[canal] não foi possível criar a conta Zernio ${accountId}: ${error?.message ?? "sem retorno"}`);
  return null;
}

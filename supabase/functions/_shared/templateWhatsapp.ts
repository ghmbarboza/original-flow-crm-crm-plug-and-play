// Templates do WhatsApp oficial (Meta e Zernio): leitura, validação e envio.
//
// Usado por message-templates (listar/criar), ai-outreach (abordagem ativa) e
// send-template-message (atendente retomando conversa fora da janela de 24h).
//
// PADRAO_VARIAVEL e renderTemplate existem também em src/lib/templateWhatsapp.ts
// (a tela monta a prévia). O teste do front compara os dois padrões.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { contasDaOrg, type ContaCanal } from "./canal.ts";

const PADRAO_VARIAVEL = /\{\{\s*(\d+)\s*\}\}/g;

export const GRAPH_VERSION = "v21.0";
export const ZERNIO_API = "https://zernio.com/api/v1";

/** Limite da Meta para o corpo de um template já com as variáveis. */
const MAX_VARIAVEL = 1024;

export type ProvedorOficial = "meta_official" | "zernio";

export interface TemplateNormalizado {
  id: string | null;
  name: string;
  status: string;
  category: string;
  language: string;
  body_text: string;
  /** Quantas variáveis o corpo espera: o envio precisa entregar exatamente isso. */
  param_count: number;
}

/** Extrai o texto do componente BODY, aceitando o type em maiúsculas ou minúsculas. */
function corpoDe(components: unknown): string {
  const lista = Array.isArray(components) ? components : [];
  const body = lista.find(
    (c) => String((c as { type?: string })?.type ?? "").toLowerCase() === "body",
  ) as { text?: string } | undefined;
  return body?.text ?? "";
}

/** Conta placeholders posicionais distintos ({{1}}, {{2}}, ...) no corpo. */
export function contarParametros(texto: string): number {
  return new Set([...texto.matchAll(PADRAO_VARIAVEL)].map((m) => Number(m[1]))).size;
}

export function normalizarTemplate(raw: Record<string, unknown>): TemplateNormalizado {
  const corpo = corpoDe(raw.components);
  return {
    id: (raw.id as string) ?? null,
    name: String(raw.name ?? ""),
    status: String(raw.status ?? "UNKNOWN").toUpperCase(),
    category: String(raw.category ?? "").toUpperCase(),
    language: String(raw.language ?? ""),
    body_text: corpo,
    param_count: contarParametros(corpo),
  };
}

/** Texto final do template com os valores no lugar das variáveis. */
export function renderTemplate(corpo: string, parametros: string[]): string {
  return corpo.replace(PADRAO_VARIAVEL, (_m, numero: string) => parametros[Number(numero) - 1] ?? "");
}

/** Motivo da recusa em linguagem de quem atende, ou null quando pode enviar. */
export function validarParametros(template: TemplateNormalizado, parametros: string[]): string | null {
  if (template.status !== "APPROVED") return "Este template ainda não foi aprovado pelo WhatsApp.";
  if (parametros.length !== template.param_count) {
    return `O template espera ${template.param_count} variável(is) e foram enviadas ${parametros.length}.`;
  }
  if (parametros.some((p) => !p.trim())) return "Preencha todas as variáveis do template.";
  if (parametros.some((p) => /[\r\n\t]/.test(p))) return "As variáveis não podem ter quebra de linha.";
  if (parametros.some((p) => p.length > MAX_VARIAVEL)) return "Variável longa demais para o WhatsApp.";
  return null;
}

/** Resolve a conta de WhatsApp conectada no Zernio (accountId é obrigatório na API). */
export async function zernioWhatsAppAccountId(apiKey: string, profileId: string): Promise<string | null> {
  const url = new URL(`${ZERNIO_API}/accounts`);
  url.searchParams.set("profileId", profileId);
  url.searchParams.set("platform", "whatsapp");
  url.searchParams.set("status", "connected");
  const resp = await fetch(url.toString(), { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!resp.ok) return null;
  const data = await resp.json().catch(() => ({}));
  const accounts = (data.accounts ?? []) as { _id?: string; isActive?: boolean }[];
  const account = accounts.find((a) => a.isActive) ?? accounts[0];
  return account?._id ?? null;
}

export interface CanalOficial {
  provider: string;
  meta?: { phone_number_id: string; access_token: string };
  /** account_id preenchido = conta de canal conhecida; sem ele, resolve pela plataforma. */
  zernio?: { api_key: string; profile_id: string; account_id?: string | null };
}

/** Credenciais oficiais de uma conta de canal, no formato que o envio de template usa. */
export function canalOficialDaConta(conta: ContaCanal): CanalOficial {
  return {
    provider: conta.provider,
    meta: conta.meta ?? undefined,
    zernio: conta.zernio ?? undefined,
  };
}

export interface AcessoAosTemplates {
  canal: CanalOficial;
  listUrl: string;
  createUrl: string;
  headers: Record<string, string>;
  extraCreateFields: Record<string, unknown>;
  /** A Meta espera os tipos de componente em maiúsculas; o Zernio, em minúsculas. */
  componentCase: "upper" | "lower";
}

/**
 * Credenciais e endereços de template do provedor oficial. Com `conta` (a conta
 * de canal da conversa), usa as credenciais dela; sem conta, a primeira conta
 * ativa do provedor na organização.
 */
export async function acessoAosTemplates(
  admin: SupabaseClient, orgId: string, provider: ProvedorOficial, conta: ContaCanal | null = null,
): Promise<AcessoAosTemplates | { erro: string }> {
  const escolhida = conta && conta.provider === provider
    ? conta
    : (await contasDaOrg(admin, orgId, { provider, channel: "whatsapp" }))[0] ?? null;

  if (provider === "meta_official") {
    const meta = escolhida?.meta;
    if (!meta) return { erro: "Nenhuma instância Meta ativa." };

    const base = `https://graph.facebook.com/${GRAPH_VERSION}/${meta.business_account_id}/message_templates`;
    return {
      canal: {
        provider,
        meta: { phone_number_id: meta.phone_number_id, access_token: meta.access_token },
      },
      listUrl: `${base}?limit=100`,
      createUrl: base,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${meta.access_token}` },
      extraCreateFields: {},
      componentCase: "upper",
    };
  }

  const zernio = escolhida?.zernio;
  if (!zernio) return { erro: "Zernio não configurado para esta organização." };

  const accountId = zernio.account_id ?? await zernioWhatsAppAccountId(zernio.api_key, zernio.profile_id);
  if (!accountId) return { erro: "Nenhuma conta de WhatsApp conectada no Zernio." };

  return {
    canal: {
      provider,
      zernio: { api_key: zernio.api_key, profile_id: zernio.profile_id, account_id: accountId },
    },
    listUrl: `${ZERNIO_API}/whatsapp/templates?accountId=${encodeURIComponent(accountId)}`,
    createUrl: `${ZERNIO_API}/whatsapp/templates`,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${zernio.api_key}` },
    extraCreateFields: { accountId },
    componentCase: "lower",
  };
}

/** Lê os templates direto do provedor (não há cópia no banco). */
export async function listarTemplates(
  acesso: AcessoAosTemplates,
): Promise<{ templates: TemplateNormalizado[] } | { erro: string }> {
  const resp = await fetch(acesso.listUrl, { headers: acesso.headers });
  if (!resp.ok) {
    const text = await resp.text();
    return { erro: `Falha ao listar templates: ${text.slice(0, 200)}` };
  }
  const data = await resp.json().catch(() => ({}));
  // Meta devolve em `data`; Zernio, em `templates`.
  const raw = (data.templates ?? data.data ?? []) as Record<string, unknown>[];
  return { templates: raw.map(normalizarTemplate) };
}

export interface TemplateEscolhido {
  nome: string;
  idioma: string;
}

export function corpoMeta(telefone: string, template: TemplateEscolhido, params: string[]) {
  return {
    messaging_product: "whatsapp",
    to: telefone,
    type: "template",
    template: {
      name: template.nome,
      language: { code: template.idioma },
      ...(params.length > 0
        ? { components: [{ type: "body", parameters: params.map((v) => ({ type: "text", text: v })) }] }
        : {}),
    },
  };
}

export function corpoZernio(accountId: string, telefone: string, template: TemplateEscolhido, params: string[]) {
  return {
    accountId,
    participantId: telefone,
    templateName: template.nome,
    templateLanguage: template.idioma,
    ...(params.length > 0 ? { templateParams: params } : {}),
  };
}

export interface EnvioDeTemplate {
  ok: boolean;
  providerMessageId: string | null;
  providerConversationId: string | null;
  motivo?: string;
}

const falha = (motivo: string): EnvioDeTemplate => ({
  ok: false, providerMessageId: null, providerConversationId: null, motivo,
});

/** Entrega um template aprovado pelo canal oficial. No Zernio abre (ou reusa) a conversa. */
export async function enviarTemplate(
  canal: CanalOficial, telefone: string, template: TemplateEscolhido, params: string[],
): Promise<EnvioDeTemplate> {
  if (canal.provider === "meta_official" && canal.meta) {
    const resp = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${canal.meta.phone_number_id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${canal.meta.access_token}` },
      body: JSON.stringify(corpoMeta(telefone, template, params)),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      return falha(err?.error?.error_user_msg ?? err?.error?.message ?? `Meta respondeu ${resp.status}`);
    }
    const result = await resp.json().catch(() => ({}));
    return { ok: true, providerMessageId: result?.messages?.[0]?.id ?? null, providerConversationId: null };
  }

  if (canal.provider === "zernio" && canal.zernio) {
    const accountId = canal.zernio.account_id ?? await zernioWhatsAppAccountId(canal.zernio.api_key, canal.zernio.profile_id);
    if (!accountId) return falha("nenhuma conta de WhatsApp conectada no Zernio");
    const resp = await fetch(`${ZERNIO_API}/inbox/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${canal.zernio.api_key}` },
      body: JSON.stringify(corpoZernio(accountId, telefone, template, params)),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      return falha(typeof err?.error === "string" ? err.error : `Zernio respondeu ${resp.status}`);
    }
    const result = await resp.json().catch(() => ({}));
    const conversa = result?.conversation ?? result;
    return {
      ok: true,
      providerMessageId: result?.message?._id ?? result?.messageId ?? null,
      providerConversationId: conversa?._id ?? conversa?.id ?? result?.conversationId ?? null,
    };
  }

  return falha("canal sem envio de template");
}

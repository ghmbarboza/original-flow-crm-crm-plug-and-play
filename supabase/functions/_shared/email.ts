// Envio de e-mail da organização, com o provedor escolhido em Configurações > E-mail.
//
// Dois caminhos:
//  - resend: e-mail de sistema (notificações, automações, sequências, testes).
//    Chave no Vault por org (service 'resend'); remetente e domínio em email_settings.
//  - gmail: conta conectada por OAuth. Com `userId`, usa a conexão daquele usuário
//    (resposta pessoal no inbox); sem, a primeira conexão ativa da org (automação).
//
// Toda mensagem enviada entra em `emails` com `provider`, para a linha do tempo.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getValidAccessToken, type GmailConnection } from "./google.ts";

export const RESEND_API_PADRAO = "https://api.resend.com";

export type ProvedorEmail = "resend" | "gmail";

export interface ConfiguracaoEmail {
  provider: ProvedorEmail;
  from_name: string | null;
  from_email: string | null;
  reply_to: string | null;
  api_base: string | null;
}

export interface PedidoEmail {
  orgId: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string | null;
  contactId?: string | null;
  dealId?: string | null;
  /** Usuário que está enviando (resposta no inbox). Sem ele, envio da org. */
  userId?: string | null;
  /** Só no Gmail: responder na mesma thread. */
  threadId?: string | null;
  /** Rótulo interno gravado em `emails.status` quando falha (ex.: 'failed'). */
}

export interface ResultadoEmail {
  ok: boolean;
  provider: ProvedorEmail;
  id: string | null;
  threadId?: string | null;
  motivo?: string;
}

/**
 * Provedor efetivo: o configurado, desde que tenha o que precisa. Resend sem
 * chave ou sem remetente cai para o Gmail; Gmail sem conexão fica sem envio.
 */
export function escolherProvedor(
  cfg: ConfiguracaoEmail | null,
  temChaveResend: boolean,
  temConexaoGmail: boolean,
): ProvedorEmail | null {
  const querResend = cfg?.provider === "resend";
  if (querResend && temChaveResend && cfg?.from_email) return "resend";
  if (temConexaoGmail) return "gmail";
  if (querResend && temChaveResend) return "resend";
  return null;
}

/** "Nome <email>" quando há nome; só o e-mail quando não há. */
export function montarRemetente(nome: string | null | undefined, email: string): string {
  const n = (nome ?? "").trim();
  return n ? `${n} <${email}>` : email;
}

/** Codifica a mensagem em base64url, como a Gmail API exige. */
function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function lerConfiguracaoEmail(admin: SupabaseClient, orgId: string): Promise<ConfiguracaoEmail | null> {
  const { data } = await admin
    .from("email_settings")
    .select("provider, from_name, from_email, reply_to, api_base")
    .eq("org_id", orgId)
    .maybeSingle();
  return (data as ConfiguracaoEmail | null) ?? null;
}

async function chaveResend(admin: SupabaseClient, orgId: string): Promise<string | null> {
  const { data, error } = await admin.rpc("get_org_api_key", { _org_id: orgId, _service: "resend" });
  if (error) {
    console.error(`[email] chave do Resend indisponível: ${error.message}`);
    return null;
  }
  return typeof data === "string" && data.trim() ? data.trim() : null;
}

type ConexaoGmail = GmailConnection & { email: string; user_id: string };

async function conexaoGmail(admin: SupabaseClient, orgId: string, userId: string | null | undefined): Promise<ConexaoGmail | null> {
  let q = admin
    .from("email_connections")
    .select("id, org_id, user_id, email, access_token, refresh_token, token_expiry")
    .eq("org_id", orgId)
    .eq("is_active", true);
  q = userId ? q.eq("user_id", userId) : q.order("created_at", { ascending: true });
  const { data } = await q.limit(1).maybeSingle();
  if (!data) return null;
  return data as unknown as ConexaoGmail;
}

async function registrar(
  admin: SupabaseClient,
  p: PedidoEmail,
  provider: ProvedorEmail,
  fromEmail: string | null,
  userId: string | null,
  ok: boolean,
  threadId: string | null,
) {
  const { error } = await admin.from("emails").insert({
    org_id: p.orgId,
    user_id: userId,
    contact_id: p.contactId ?? null,
    deal_id: p.dealId ?? null,
    direction: "outbound",
    provider,
    from_email: fromEmail,
    to_emails: [p.to],
    subject: p.subject,
    body_html: p.html,
    thread_id: threadId,
    sent_at: ok ? new Date().toISOString() : null,
    status: ok ? "sent" : "failed",
  });
  if (error) console.error(`[email] envio não registrado em emails: ${error.message}`);
}

async function viaResend(admin: SupabaseClient, p: PedidoEmail, cfg: ConfiguracaoEmail, chave: string): Promise<ResultadoEmail> {
  const base = (cfg.api_base ?? RESEND_API_PADRAO).replace(/\/$/, "");
  const from = montarRemetente(cfg.from_name, cfg.from_email!);
  const resp = await fetch(`${base}/emails`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${chave}` },
    body: JSON.stringify({
      from,
      to: [p.to],
      subject: p.subject,
      html: p.html,
      ...(p.text ? { text: p.text } : {}),
      ...(p.replyTo ?? cfg.reply_to ? { reply_to: p.replyTo ?? cfg.reply_to } : {}),
    }),
  });
  const corpo = await resp.json().catch(() => ({}));
  const ok = resp.ok;
  await registrar(admin, p, "resend", cfg.from_email, p.userId ?? null, ok, null);
  if (!ok) {
    const motivo = corpo?.message ?? corpo?.error ?? `Resend respondeu ${resp.status}`;
    return { ok: false, provider: "resend", id: null, motivo: String(motivo).slice(0, 200) };
  }
  return { ok: true, provider: "resend", id: corpo?.id ?? null };
}

async function viaGmail(
  admin: SupabaseClient,
  p: PedidoEmail,
  conn: ConexaoGmail,
): Promise<ResultadoEmail> {
  const token = await getValidAccessToken(admin, conn);
  if (!token) {
    await registrar(admin, p, "gmail", conn.email, conn.user_id, false, null);
    return { ok: false, provider: "gmail", id: null, motivo: "Não foi possível obter um token válido do Gmail" };
  }
  const raw = [
    `From: ${conn.email}`,
    `To: ${p.to}`,
    `Subject: ${p.subject}`,
    ...(p.replyTo ? [`Reply-To: ${p.replyTo}`] : []),
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "",
    p.html,
  ].join("\r\n");
  const resp = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: toBase64Url(raw), ...(p.threadId ? { threadId: p.threadId } : {}) }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    await registrar(admin, p, "gmail", conn.email, conn.user_id, false, p.threadId ?? null);
    return { ok: false, provider: "gmail", id: null, motivo: `Gmail recusou o envio: ${err.slice(0, 200)}` };
  }
  const result = await resp.json().catch(() => ({}));
  const threadId = result?.threadId ?? p.threadId ?? null;
  await registrar(admin, p, "gmail", conn.email, conn.user_id, true, threadId);
  return { ok: true, provider: "gmail", id: result?.id ?? null, threadId };
}

/** Envia pelo provedor da org e registra em `emails`. Nunca lança: devolve `ok: false` com o motivo. */
export async function enviarEmail(admin: SupabaseClient, p: PedidoEmail): Promise<ResultadoEmail> {
  if (!p.to || !p.subject) return { ok: false, provider: "gmail", id: null, motivo: "Destinatário e assunto são obrigatórios" };
  const cfg = await lerConfiguracaoEmail(admin, p.orgId);
  const chave = cfg?.provider === "resend" ? await chaveResend(admin, p.orgId) : null;
  const conn = await conexaoGmail(admin, p.orgId, p.userId);
  const provedor = escolherProvedor(cfg, !!chave, !!conn);
  if (provedor === "resend" && cfg && chave) return viaResend(admin, p, cfg, chave);
  if (provedor === "gmail" && conn) return viaGmail(admin, p, conn);
  return {
    ok: false,
    provider: cfg?.provider ?? "gmail",
    id: null,
    motivo: cfg?.provider === "resend"
      ? "Resend sem chave ou sem remetente configurado em Configurações > E-mail"
      : "Nenhuma conta de e-mail conectada em Configurações > E-mail",
  };
}

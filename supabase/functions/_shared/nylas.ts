// Cliente Nylas v3 (Sprint 12 B11), porte do nylas-calendar da Nina Zernio.
// Credenciais por org no Vault (api_keys_registry: nylas_client_id e
// nylas_api_key). O grant é por usuário (calendar_integrations). `apiBase`
// alternativo só existe para o hard smoke apontar a integration-sandbox.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export const NYLAS_API = "https://api.us.nylas.com";
const TIMEOUT_MS = 10_000;

export interface CredenciaisNylas {
  clientId: string;
  apiKey: string;
}

export interface IntegracaoCalendario {
  id: string;
  org_id: string;
  user_id: string;
  grant_id: string;
  grant_provider: string | null;
  account_email: string | null;
  calendar_id: string;
  status: string;
  sync_enabled: boolean;
  create_meet: boolean;
  api_base: string | null;
}

export interface EventoCalendario {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  timezone: string;
  participants: { email: string; name?: string | null }[];
}

export class ErroNylas extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function credenciaisNylas(admin: SupabaseClient, orgId: string): Promise<CredenciaisNylas | null> {
  const ler = async (servico: string) => {
    const { data } = await admin.rpc("get_org_api_key", { _org_id: orgId, _service: servico });
    return typeof data === "string" ? data.trim() : "";
  };
  const clientId = await ler("nylas_client_id");
  const apiKey = await ler("nylas_api_key");
  return clientId && apiKey ? { clientId, apiKey } : null;
}

export function baseNylas(apiBase: string | null | undefined): string {
  return (apiBase ?? NYLAS_API).replace(/\/+$/, "");
}

export async function nylasFetch<T = Record<string, unknown>>(apiKey: string, url: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json", ...(init.headers ?? {}) },
    });
    const texto = await resp.text();
    if (!resp.ok) {
      const corpo = (() => { try { return JSON.parse(texto); } catch { return null; } })() as { error?: { message?: string } } | null;
      throw new ErroNylas(resp.status, corpo?.error?.message ?? `Nylas respondeu ${resp.status}`);
    }
    return (texto ? JSON.parse(texto) : {}) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Corpo do evento no formato do Nylas v3. Participantes sem repetição, em minúsculas. */
export function corpoDoEvento(ev: EventoCalendario, integracao: Pick<IntegracaoCalendario, "create_meet" | "grant_provider">) {
  const vistos = new Set<string>();
  const participants: { email: string; name?: string }[] = [];
  for (const p of ev.participants) {
    const email = (p.email ?? "").trim().toLowerCase();
    if (!email || vistos.has(email)) continue;
    vistos.add(email);
    participants.push(p.name ? { email, name: p.name } : { email });
  }
  const provedorSala = integracao.grant_provider === "google" ? "Google Meet" : integracao.grant_provider === "microsoft" ? "Microsoft Teams" : null;
  return {
    title: ev.title,
    description: ev.description ?? "",
    when: {
      start_time: Math.floor(new Date(ev.starts_at).getTime() / 1000),
      end_time: Math.floor(new Date(ev.ends_at).getTime() / 1000),
      start_timezone: ev.timezone,
      end_timezone: ev.timezone,
    },
    participants,
    metadata: { key1: ev.id, flowcrm_appointment_id: ev.id },
    ...(integracao.create_meet && provedorSala ? { conferencing: { provider: provedorSala, autocreate: {} } } : {}),
  };
}

interface RespostaEvento { data?: { id?: string; conferencing?: { details?: { url?: string } } } }

/** Cria ou atualiza o evento; devolve o id externo e o link da sala quando houver. */
export async function sincronizarEvento(
  cred: CredenciaisNylas, integracao: IntegracaoCalendario, ev: EventoCalendario, externalId: string | null,
): Promise<{ externalId: string; meetingUrl: string | null }> {
  const base = `${baseNylas(integracao.api_base)}/v3/grants/${integracao.grant_id}`;
  const query = `calendar_id=${encodeURIComponent(integracao.calendar_id)}&notify_participants=true`;
  const corpo = JSON.stringify(corpoDoEvento(ev, integracao));
  let alvo = externalId;
  if (alvo) {
    try {
      const r = await nylasFetch<RespostaEvento>(cred.apiKey, `${base}/events/${alvo}?${query}`, { method: "PUT", body: corpo });
      return { externalId: r.data?.id ?? alvo, meetingUrl: r.data?.conferencing?.details?.url ?? null };
    } catch (e) {
      if (!(e instanceof ErroNylas) || (e.status !== 404 && e.status !== 410)) throw e;
      alvo = null;
    }
  }
  // Repetição segura: se o evento já existe com este metadata, atualiza em vez de duplicar.
  const existente = await nylasFetch<{ data?: { id?: string }[] }>(cred.apiKey, `${base}/events?calendar_id=${encodeURIComponent(integracao.calendar_id)}&metadata_pair=key1:${ev.id}&limit=1`);
  const idExistente = existente.data?.[0]?.id;
  if (idExistente) {
    const r = await nylasFetch<RespostaEvento>(cred.apiKey, `${base}/events/${idExistente}?${query}`, { method: "PUT", body: corpo });
    return { externalId: r.data?.id ?? idExistente, meetingUrl: r.data?.conferencing?.details?.url ?? null };
  }
  const r = await nylasFetch<RespostaEvento>(cred.apiKey, `${base}/events?${query}`, { method: "POST", body: corpo });
  if (!r.data?.id) throw new ErroNylas(502, "Nylas não devolveu o id do evento");
  return { externalId: r.data.id, meetingUrl: r.data.conferencing?.details?.url ?? null };
}

export async function apagarEvento(cred: CredenciaisNylas, integracao: IntegracaoCalendario, externalId: string): Promise<void> {
  const base = `${baseNylas(integracao.api_base)}/v3/grants/${integracao.grant_id}`;
  try {
    await nylasFetch(cred.apiKey, `${base}/events/${externalId}?calendar_id=${encodeURIComponent(integracao.calendar_id)}&notify_participants=true`, { method: "DELETE" });
  } catch (e) {
    if (e instanceof ErroNylas && (e.status === 404 || e.status === 410)) return;
    throw e;
  }
}

export interface Ocupado { start: string; end: string }

/** Free/busy do calendário conectado no período. Falha vira lista vazia (a tabela local ainda vale). */
export async function ocupacoes(cred: CredenciaisNylas, integracao: IntegracaoCalendario, inicio: Date, fim: Date): Promise<Ocupado[]> {
  if (!integracao.account_email) return [];
  const base = `${baseNylas(integracao.api_base)}/v3/grants/${integracao.grant_id}`;
  try {
    const r = await nylasFetch<{ data?: { email?: string; time_slots?: { start_time: number; end_time: number; status?: string }[] }[] }>(
      cred.apiKey, `${base}/calendars/free-busy`,
      { method: "POST", body: JSON.stringify({ start_time: Math.floor(inicio.getTime() / 1000), end_time: Math.floor(fim.getTime() / 1000), emails: [integracao.account_email] }) },
    );
    const slots = r.data?.[0]?.time_slots ?? [];
    return slots.filter((s) => (s.status ?? "busy") === "busy").map((s) => ({ start: new Date(s.start_time * 1000).toISOString(), end: new Date(s.end_time * 1000).toISOString() }));
  } catch (e) {
    console.error("[nylas] free/busy falhou:", e instanceof Error ? e.message : e);
    return [];
  }
}

/** Troca o code do OAuth por um grant. */
export async function trocarCode(cred: CredenciaisNylas, apiBase: string | null, code: string, redirectUri: string) {
  const r = await fetch(`${baseNylas(apiBase)}/v3/connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, client_id: cred.clientId, client_secret: cred.apiKey, redirect_uri: redirectUri, grant_type: "authorization_code" }),
  });
  const corpo = await r.json().catch(() => ({})) as { grant_id?: string; email?: string; provider?: string; error_description?: string; error?: string };
  if (!r.ok || !corpo.grant_id) throw new ErroNylas(r.status, corpo.error_description ?? corpo.error ?? "Nylas recusou a autorização");
  return { grantId: corpo.grant_id, email: corpo.email ?? null, provider: corpo.provider ?? null };
}

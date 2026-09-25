import { createHmac, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { credencial } from "../helpers";

/**
 * Base do hard smoke test das integrações.
 *
 * POR QUE EXISTE: o smoke normal só percorre telas. Nenhuma integração tinha
 * teste, e quem entrega o CRM não tem acesso às ferramentas dos clientes
 * (Evolution, Meta, Zernio, Cal.com, ERP). Aqui cada integração é exercitada
 * contra o backend de produção com os payloads que o fornecedor manda de verdade,
 * e o que o CRM envia para fora é interceptado pela function integration-sandbox.
 *
 * Tudo roda com a sessão do usuário E2E (RLS de admin), sem service role.
 * Cada registro criado entra em `limpeza` e sai no afterAll do spec, mesmo se o
 * teste falhar no meio.
 */

export const MARCADOR = "E2E hard";

export interface Ctx {
  db: SupabaseClient;
  orgId: string;
  userId: string;
  url: string;
  anonKey: string;
  functions: string;
}

let cache: Promise<Ctx> | null = null;

export function ctx(): Promise<Ctx> {
  if (!cache) cache = conectar();
  return cache;
}

async function conectar(): Promise<Ctx> {
  const url = credencial("SUPABASE_URL", "VITE_SUPABASE_URL");
  const anonKey = credencial("VITE_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY");
  const password = credencial("E2E_PASSWORD");
  if (!url || !anonKey || !password) {
    throw new Error("Hard smoke precisa de VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY e E2E_PASSWORD.");
  }
  const db = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data, error } = await db.auth.signInWithPassword({
    email: credencial("E2E_EMAIL") ?? "sabrina@viverdeia.ai",
    password,
  });
  if (error || !data.user) throw new Error(`Login do hard smoke falhou: ${error?.message}`);

  const { data: profile } = await db.from("profiles").select("org_id").eq("id", data.user.id).single();
  if (!profile?.org_id) throw new Error("Usuário E2E sem organização.");

  return { db, orgId: profile.org_id, userId: data.user.id, url, anonKey, functions: `${url}/functions/v1` };
}

/** Pilha de desfazer: cada teste registra como apagar/restaurar o que mexeu. */
export class Limpeza {
  private passos: Array<{ nome: string; fn: () => Promise<unknown> }> = [];

  add(nome: string, fn: () => Promise<unknown>) {
    this.passos.push({ nome, fn });
  }

  async rodar() {
    const falhas: string[] = [];
    for (const { nome, fn } of this.passos.reverse()) {
      try {
        await fn();
      } catch (e) {
        falhas.push(`${nome}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    this.passos = [];
    // Limpeza que falha é problema real (dado de teste em produção): não engolir.
    if (falhas.length) throw new Error(`Limpeza incompleta:\n${falhas.join("\n")}`);
  }
}

/** Levanta erro do PostgREST com contexto em vez de seguir com `data` nulo. */
export function ok<T>(r: { data: T; error: { message: string } | null }, onde: string): T {
  if (r.error) throw new Error(`${onde}: ${r.error.message}`);
  return r.data;
}

export async function esperar<T>(
  descricao: string,
  fn: () => Promise<T | null | undefined | false>,
  { timeout = 30_000, intervalo = 1_000 } = {},
): Promise<T> {
  const fim = Date.now() + timeout;
  let ultimo: unknown;
  while (Date.now() < fim) {
    try {
      const v = await fn();
      if (v) return v as T;
    } catch (e) {
      ultimo = e;
    }
    await new Promise((r) => setTimeout(r, intervalo));
  }
  throw new Error(`Timeout esperando: ${descricao}${ultimo ? ` (último erro: ${String(ultimo)})` : ""}`);
}

export function hmacHex(secret: string, corpo: string) {
  return createHmac("sha256", secret).update(corpo).digest("hex");
}

export function telefoneUnico() {
  return `55119${Date.now().toString().slice(-8)}`;
}

export function uid() {
  return randomUUID().replace(/-/g, "");
}

/** POST cru numa function, sem login (como um fornecedor externo chamaria). */
export async function postFunction(
  c: Ctx,
  caminho: string,
  corpo: string | object,
  headers: Record<string, string> = {},
) {
  const body = typeof corpo === "string" ? corpo : JSON.stringify(corpo);
  const resp = await fetch(`${c.functions}/${caminho}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body,
  });
  const texto = await resp.text();
  let json: unknown = null;
  try { json = JSON.parse(texto); } catch { /* corpo não-JSON */ }
  return { status: resp.status, texto, json: json as Record<string, unknown> | null };
}

/** Chama uma function com a sessão do usuário E2E (como o front chamaria). */
export async function invocar(c: Ctx, nome: string, body: object) {
  const { data: sessao } = await c.db.auth.getSession();
  return postFunction(c, nome, body, {
    Authorization: `Bearer ${sessao.session?.access_token}`,
    apikey: c.anonKey,
  });
}

// ---------------------------------------------------------------------------
// Sandbox
// ---------------------------------------------------------------------------

export interface Sessao {
  id: string;
  token: string;
  /** Base para usar como server_url do Evolution ou como URL de webhook. */
  base: string;
}

export async function abrirSandbox(c: Ctx, limpeza: Limpeza, label: string): Promise<Sessao> {
  const s = ok(
    await c.db.from("integration_sandbox_sessions")
      .insert({ org_id: c.orgId, label: `${MARCADOR} ${label}` })
      .select("id, token").single(),
    "abrir sandbox",
  ) as { id: string; token: string };
  // CASCADE leva as capturas junto.
  limpeza.add(`sandbox ${label}`, async () =>
    ok(await c.db.from("integration_sandbox_sessions").delete().eq("id", s.id), "apagar sandbox"));
  return { ...s, base: `${c.functions}/integration-sandbox/${s.token}` };
}

export interface Captura {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: Record<string, unknown> | null;
  raw_body: string | null;
  response_status: number;
  created_at: string;
}

export async function capturas(c: Ctx, sessao: Sessao, prefixo = ""): Promise<Captura[]> {
  const rows = ok(
    await c.db.from("integration_sandbox_captures")
      .select("method, path, query, headers, body, raw_body, response_status, created_at")
      .eq("session_id", sessao.id)
      .like("path", `${prefixo}%`)
      .order("created_at"),
    "ler capturas",
  );
  return (rows ?? []) as Captura[];
}

export async function rodarDispatcher(c: Ctx, nome: string) {
  ok(await c.db.rpc("executar_dispatcher_agora", { p_function: nome }), `disparar ${nome}`);
}

/** Credenciais falsas de voz (a sandbox ignora os valores) só se a org ainda não tiver. */
export async function garantirChavesVoz(c: Ctx, limpeza: Limpeza) {
  for (const [servico, valor] of [["elevenlabs", "el_sandbox"], ["twilio_account_sid", "ACsandbox0000000000000000000000000"], ["twilio_auth_token", "token_sandbox"]]) {
    const existe = ok(await c.db.from("api_keys_registry").select("service_name").eq("org_id", c.orgId).eq("service_name", servico).limit(1).maybeSingle(), `chave ${servico}`);
    if (existe) continue;
    const s = await invocar(c, "store-api-key", { service_name: servico, api_key: valor, label: servico });
    if (s.status !== 200) throw new Error(`store-api-key ${servico}: ${s.status} ${s.texto}`);
    limpeza.add(`chave ${servico}`, async () => ok(await c.db.from("api_keys_registry").delete().eq("org_id", c.orgId).eq("service_name", servico), `apagar ${servico}`));
  }
}

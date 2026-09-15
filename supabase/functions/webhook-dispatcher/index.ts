// Entrega dos webhooks de saída (Sprint 11, Fase 2). Contrato em WEBHOOKS.md.
//
// Três caminhos:
//  - cron (x-cron-secret): entrega a fila de webhook_deliveries, 100 por vez.
//  - { action: "test", endpoint_id } com login de admin: manda um `ping` agora
//    para o destino e devolve o que ele respondeu (botão "Testar").
//  - { action: "redeliver", delivery_id } com login de admin: reenvia agora uma
//    entrega que falhou (botão "Reenviar").
//
// Cada entrega é assinada: X-FlowCRM-Signature = "sha256=" + HMAC-SHA256(secret,
// "<X-FlowCRM-Timestamp>.<corpo>"). Resposta 2xx em até 10 s = sucesso. Qualquer
// outra coisa agenda nova tentativa (1 min, 5 min, 30 min, 2 h, 12 h); na sexta
// falha a entrega fica "failed" com o status e o começo da resposta do destino.
//
// Destino com format = "painel_preditivo" recebe o corpo convertido para o
// formato do Painel Preditivo de Metas (_shared/painelPreditivo.ts).
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corpoPainelPreditivo } from "../_shared/painelPreditivo.ts";
import { cronAutorizado, hmacSha256Hex, naoAutorizado } from "../_shared/seguranca.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** Espera antes da tentativa N+1, indexada pelo número de tentativas já feitas. */
const ESPERAS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 12 * 3_600_000];
const MAX_TENTATIVAS = ESPERAS_MS.length + 1;
const LOTE = 100;
const TIMEOUT_MS = 10_000;
/** Entrega presa em "sending" (a function caiu no meio) volta para a fila. */
const SENDING_TRAVADO_MS = 2 * 60_000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface Destino {
  id: string;
  url: string;
  secret: string;
  headers: Record<string, string> | null;
  format: "flowcrm" | "painel_preditivo";
  is_active: boolean;
  consecutive_failures: number;
}

interface Entrega {
  id: string;
  endpoint_id: string;
  event_id: string;
  event: string;
  payload: Record<string, unknown>;
  attempts: number;
}

interface Resultado {
  ok: boolean;
  status_code: number | null;
  resposta: string | null;
  erro: string | null;
}

async function enviar(destino: Destino, entrega: Entrega): Promise<Resultado> {
  const painel = destino.format === "painel_preditivo";
  const ping = entrega.event === "ping";
  let corpoObj: Record<string, unknown> | null = entrega.payload;
  if (painel) {
    // O painel exige `deal` em todo evento; no teste vai um negócio vazio, que ele
    // registra e recusa com corretor_not_found sem criar nada.
    corpoObj = ping
      ? { event_type: "ping", deal: { external_id: `flowcrm-ping-${entrega.event_id}` } }
      : corpoPainelPreditivo(entrega.payload);
    if (!corpoObj) {
      return { ok: true, status_code: null, resposta: "Não enviado: o Painel Preditivo só recebe eventos de negócio.", erro: null };
    }
  }

  const corpo = JSON.stringify(corpoObj);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const assinatura = await hmacSha256Hex(destino.secret, `${timestamp}.${corpo}`);

  // Headers extras do cadastro vêm primeiro: os do contrato não podem ser
  // sobrescritos por engano (a assinatura deixaria de bater).
  const headers: Record<string, string> = {
    ...(destino.headers ?? {}),
    "Content-Type": "application/json",
    "User-Agent": "FlowCRM-Webhooks/1.0",
    "X-FlowCRM-Event": entrega.event,
    "X-FlowCRM-Event-Id": entrega.event_id,
    "X-FlowCRM-Delivery": entrega.id,
    "X-FlowCRM-Timestamp": timestamp,
    "X-FlowCRM-Signature": `sha256=${assinatura}`,
    // O painel confere o secret em texto nesse header (integrations.config.secret).
    ...(painel ? { "x-webhook-secret": destino.secret } : {}),
  };

  try {
    const resp = await fetch(destino.url, {
      method: "POST",
      headers,
      body: corpo,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const texto = (await resp.text().catch(() => "")).slice(0, 500);
    // Teste no painel: 422 corretor_not_found prova URL certa e secret aceito
    // (secret errado seria 401 invalid_secret).
    if (painel && ping && resp.status === 422 && texto.includes("corretor_not_found")) {
      return { ok: true, status_code: resp.status, resposta: "Painel alcançado e secret aceito (o teste não cria negócio).", erro: null };
    }
    return {
      ok: resp.ok,
      status_code: resp.status,
      resposta: texto || null,
      erro: resp.ok ? null : `O destino respondeu HTTP ${resp.status}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const timeout = /timed? ?out|abort/i.test(msg);
    return {
      ok: false,
      status_code: null,
      resposta: null,
      erro: timeout ? `O destino não respondeu em ${TIMEOUT_MS / 1000} s` : `Falha de rede: ${msg.slice(0, 200)}`,
    };
  }
}

/** Entrega uma linha já reivindicada e grava o desfecho na entrega e no destino. */
async function processar(admin: SupabaseClient, entrega: Entrega, destino: Destino | null): Promise<Resultado> {
  const agora = new Date();
  const tentativas = entrega.attempts + 1;

  const resultado: Resultado = !destino
    ? { ok: false, status_code: null, resposta: null, erro: "Destino apagado" }
    : !destino.is_active
      ? { ok: false, status_code: null, resposta: null, erro: "Destino desativado" }
      : await enviar(destino, entrega);

  // Destino desativado ou apagado não adianta tentar de novo.
  const definitivo = resultado.ok || !destino || !destino.is_active || tentativas >= MAX_TENTATIVAS;

  await admin.from("webhook_deliveries").update({
    status: resultado.ok ? "success" : definitivo ? "failed" : "retrying",
    attempts: tentativas,
    next_attempt_at: resultado.ok || definitivo
      ? agora.toISOString()
      : new Date(agora.getTime() + ESPERAS_MS[tentativas - 1]).toISOString(),
    last_status_code: resultado.status_code,
    last_response: resultado.resposta,
    last_error: resultado.erro,
    delivered_at: resultado.ok ? agora.toISOString() : null,
    updated_at: agora.toISOString(),
  }).eq("id", entrega.id);

  if (destino?.is_active) {
    await admin.from("webhook_endpoints").update(
      resultado.ok
        ? { last_success_at: agora.toISOString(), consecutive_failures: 0 }
        : { last_failure_at: agora.toISOString(), consecutive_failures: destino.consecutive_failures + 1 },
    ).eq("id", destino.id);
  }
  return resultado;
}

async function reivindicar(admin: SupabaseClient, id: string, de: string[]): Promise<Entrega | null> {
  const { data } = await admin
    .from("webhook_deliveries")
    .update({ status: "sending", updated_at: new Date().toISOString() })
    .eq("id", id)
    .in("status", de)
    .select("id, endpoint_id, event_id, event, payload, attempts")
    .maybeSingle();
  return (data as Entrega | null) ?? null;
}

async function carregarDestino(admin: SupabaseClient, id: string): Promise<Destino | null> {
  const { data } = await admin
    .from("webhook_endpoints")
    .select("id, url, secret, headers, format, is_active, consecutive_failures")
    .eq("id", id)
    .maybeSingle();
  return (data as Destino | null) ?? null;
}

/** Admin logado da org dona do recurso. */
async function adminDaOrg(admin: SupabaseClient, req: Request): Promise<{ orgId: string } | Response> {
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "Não autorizado" }, 401);
  const { data: userData } = await admin.auth.getUser(jwt);
  const userId = userData?.user?.id;
  if (!userId) return json({ error: "Não autorizado" }, 401);
  const { data: profile } = await admin.from("profiles").select("org_id").eq("id", userId).maybeSingle();
  const { data: papel } = await admin.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
  if (!profile?.org_id || !papel) return json({ error: "Apenas administradores." }, 403);
  return { orgId: profile.org_id as string };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const body = await req.json().catch(() => ({}));

  // ---- Botão "Testar" --------------------------------------------------------
  if (body?.action === "test") {
    const auth = await adminDaOrg(admin, req);
    if (auth instanceof Response) return auth;
    const destino = await carregarDestino(admin, String(body.endpoint_id ?? ""));
    const { data: dono } = await admin.from("webhook_endpoints").select("org_id").eq("id", String(body.endpoint_id ?? "")).maybeSingle();
    if (!destino || dono?.org_id !== auth.orgId) return json({ error: "Destino não encontrado." }, 404);

    const eventId = crypto.randomUUID();
    const { data: criada, error } = await admin.from("webhook_deliveries").insert({
      org_id: auth.orgId,
      endpoint_id: destino.id,
      event_id: eventId,
      event: "ping",
      status: "sending",
      payload: {
        id: eventId,
        event: "ping",
        org_id: auth.orgId,
        occurred_at: new Date().toISOString(),
        source: "flowcrm",
        data: { message: "Teste de conexão do FlowCRM." },
      },
    }).select("id, endpoint_id, event_id, event, payload, attempts").single();
    if (error || !criada) return json({ error: `Não foi possível registrar o teste: ${error?.message}` }, 500);

    // Teste é uma tentativa só: não entra na fila de novas tentativas.
    const resultado = await processar(admin, { ...(criada as Entrega), attempts: MAX_TENTATIVAS - 1 }, destino);
    return json(
      resultado.ok
        ? { ok: true, status_code: resultado.status_code }
        : { error: resultado.erro, status_code: resultado.status_code, resposta: resultado.resposta },
      resultado.ok ? 200 : 502,
    );
  }

  // ---- Botão "Reenviar" ------------------------------------------------------
  if (body?.action === "redeliver") {
    const auth = await adminDaOrg(admin, req);
    if (auth instanceof Response) return auth;
    const { data: alvo } = await admin.from("webhook_deliveries").select("org_id").eq("id", String(body.delivery_id ?? "")).maybeSingle();
    if (!alvo || alvo.org_id !== auth.orgId) return json({ error: "Entrega não encontrada." }, 404);

    // Reenvio manual recomeça a contagem: é uma decisão do admin, não da fila.
    await admin.from("webhook_deliveries").update({ attempts: 0 }).eq("id", body.delivery_id).in("status", ["failed", "retrying"]);
    const entrega = await reivindicar(admin, String(body.delivery_id), ["failed", "retrying"]);
    if (!entrega) return json({ error: "Só dá para reenviar entregas que falharam ou estão aguardando nova tentativa." }, 409);
    const resultado = await processar(admin, entrega, await carregarDestino(admin, entrega.endpoint_id));
    return json(
      resultado.ok ? { ok: true, status_code: resultado.status_code } : { error: resultado.erro, status_code: resultado.status_code },
      resultado.ok ? 200 : 502,
    );
  }

  // ---- Fila (cron) -----------------------------------------------------------
  if (!(await cronAutorizado(req, admin))) return naoAutorizado();

  await admin.from("webhook_deliveries")
    .update({ status: "retrying", last_error: "Execução anterior interrompida; reenviando" })
    .eq("status", "sending")
    .lt("updated_at", new Date(Date.now() - SENDING_TRAVADO_MS).toISOString());

  const { data: candidatas } = await admin
    .from("webhook_deliveries")
    .select("id")
    .in("status", ["pending", "retrying"])
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at", { ascending: true })
    .limit(LOTE);

  const destinos = new Map<string, Destino | null>();
  let enviadas = 0;
  let falhas = 0;
  for (const { id } of candidatas ?? []) {
    const entrega = await reivindicar(admin, id, ["pending", "retrying"]);
    if (!entrega) continue; // outra execução pegou
    if (!destinos.has(entrega.endpoint_id)) {
      destinos.set(entrega.endpoint_id, await carregarDestino(admin, entrega.endpoint_id));
    }
    const destino = destinos.get(entrega.endpoint_id) ?? null;
    const resultado = await processar(admin, entrega, destino);
    // O contador de falhas seguidas é lido uma vez por execução: atualiza a cópia.
    if (destino) destino.consecutive_failures = resultado.ok ? 0 : destino.consecutive_failures + 1;
    if (resultado.ok) enviadas++;
    else falhas++;
  }

  return json({ ok: true, enviadas, falhas });
});

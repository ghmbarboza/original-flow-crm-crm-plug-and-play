// API pública do FlowCRM: outras ferramentas e soluções (SDR de IA, TypeFlow,
// n8n, Make) lendo e escrevendo no CRM com chave por escopo.
//
//   Authorization: Bearer fcrm_live_...   (criada em Configurações > API)
//   GET  /api/openapi.json                (público)
//   GET  /api/pipelines
//   GET  /api/contacts?email=|phone=|q=   GET /api/contacts/:id   POST /api/contacts
//   GET  /api/deals?contact_id=|status=   GET /api/deals/:id      POST /api/deals   PATCH /api/deals/:id
//   GET  /api/conversations?phone=|contact_id=   GET /api/conversations/:id/messages
//   POST /api/conversations/:id/messages  (registra)   POST /api/conversations/:id/send (envia pelo canal)
//   POST /api/conversations/:id/handoff   POST /api/conversations/:id/pause-ai   POST /api/conversations/:id/resume-ai
//   POST /api/activities   GET /api/products?q=   GET /api/knowledge
//
// Cada chamada: valida a chave (hash SHA-256), confere o escopo, consome a cota
// por minuto e grava em api_request_logs. Contrato completo em WEBHOOKS.md.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { ErroApi, executarRota, type Chave } from "./rotas.ts";
import { openapi } from "./openapi.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, idempotency-key",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function sha256Hex(texto: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function autenticar(admin: SupabaseClient, req: Request): Promise<Chave> {
  const bruto = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim() || req.headers.get("x-api-key") || "";
  if (!bruto.startsWith("fcrm_live_")) throw new ErroApi(401, "Chave ausente. Envie Authorization: Bearer fcrm_live_...");
  const { data } = await admin
    .from("api_keys").select("id, org_id, name, scopes, rate_limit_per_minute, revoked_at")
    .eq("key_hash", await sha256Hex(bruto)).maybeSingle();
  if (!data || data.revoked_at) throw new ErroApi(401, "Chave inválida ou revogada.");
  const { data: dentroDaCota } = await admin.rpc("consumir_cota_api", { p_key: data.id, p_limite: data.rate_limit_per_minute });
  if (dentroDaCota === false) throw new ErroApi(429, `Limite de ${data.rate_limit_per_minute} chamadas por minuto atingido.`);
  await admin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  return { id: data.id, orgId: data.org_id, nome: data.name, escopos: (data.scopes ?? []) as string[] };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const inicio = Date.now();
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const url = new URL(req.url);
  const caminho = "/" + (url.pathname.split("/api/")[1] ?? "").replace(/\/+$/, "");

  if (req.method === "GET" && caminho === "/openapi.json") {
    return json(openapi(`${Deno.env.get("SUPABASE_URL")}/functions/v1/api`));
  }

  let chave: Chave | null = null;
  try {
    chave = await autenticar(admin, req);
    const corpo = req.method === "GET" ? {} : await req.json().catch(() => ({}));
    const resultado = await executarRota(admin, chave, req.method, caminho, url.searchParams, corpo);
    await admin.from("api_request_logs").insert({
      org_id: chave.orgId, key_id: chave.id, method: req.method, path: caminho, status: resultado.status, duration_ms: Date.now() - inicio,
    });
    return json(resultado.body, resultado.status);
  } catch (err) {
    const status = err instanceof ErroApi ? err.status : 500;
    const mensagem = err instanceof Error ? err.message : "Erro inesperado";
    if (chave) {
      await admin.from("api_request_logs").insert({
        org_id: chave.orgId, key_id: chave.id, method: req.method, path: caminho, status, duration_ms: Date.now() - inicio, error: mensagem.slice(0, 300),
      });
    }
    return json({ error: mensagem }, status);
  }
});

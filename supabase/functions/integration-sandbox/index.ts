// Simulador de integrações usado pelo hard smoke test (e2e/hard).
//
// URL: /functions/v1/integration-sandbox/<token-da-sessão>/<caminho>
//
// Dois papéis:
//  1. Servidor Evolution falso. O teste grava esta URL como server_url de uma
//     instância, e o CRM chama /instance/create, /webhook/set, /message/sendText
//     etc. sem saber que não é o servidor real. As respostas imitam a v2.3.
//  2. CRMs de origem falsos em /crm/<provedor>/... (ver crm.ts) e o Resend.
//  3. Destino de webhook de saída. Qualquer outro caminho responde com o
//     response_status da sessão (200 por padrão; o teste muda para 500).
//
// Toda chamada fica em integration_sandbox_captures para o teste conferir
// método, caminho, headers e corpo. Sessão inexistente ou vencida: 404 e nada
// é gravado. Ver migration 20260914110000.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { respostaCrm } from "./crm.ts";
import { respostaNylas } from "./nylas.ts";
import { respostaVoz } from "./voice.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// 1x1 PNG, só para o QR ter um data URL válido.
const QR_FALSO =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

// Poucos bytes de OGG ("OggS"), o bastante para o download de mídia ter conteúdo.
const MIDIA_FALSA_B64 = "T2dnUwACAAAAAAAAAAA=";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

interface Sessao {
  id: string;
  org_id: string;
  response_status: number;
  webhook_url: string | null;
  webhook_events: unknown;
}

/** Resposta imitando o Evolution v2.3 para os caminhos que o CRM usa. */
function respostaEvolution(
  caminho: string,
  corpo: Record<string, unknown> | null,
  sessao: Sessao,
): { status: number; body: unknown } | null {
  const instancia = caminho.split("/").pop() ?? "";

  if (caminho === "/instance/create") {
    return { status: 201, body: { instance: { instanceName: corpo?.instanceName }, qrcode: { base64: QR_FALSO } } };
  }
  if (caminho === "/instance/fetchInstances") {
    return { status: 200, body: [{ name: "sandbox", connectionStatus: "open" }] };
  }
  if (caminho.startsWith("/instance/connect/")) {
    return { status: 200, body: { base64: QR_FALSO, code: "sandbox" } };
  }
  if (caminho.startsWith("/instance/connectionState/")) {
    return { status: 200, body: { instance: { instanceName: instancia, state: "open" } } };
  }
  if (caminho.startsWith("/webhook/find/")) {
    return {
      status: 200,
      body: { enabled: true, url: sessao.webhook_url, events: sessao.webhook_events ?? [] },
    };
  }
  if (caminho.startsWith("/message/send")) {
    return {
      status: 201,
      body: { key: { remoteJid: `${corpo?.number ?? ""}@s.whatsapp.net`, fromMe: true, id: `SANDBOX-${crypto.randomUUID()}` } },
    };
  }
  if (caminho.startsWith("/chat/getBase64FromMediaMessage/")) {
    return { status: 200, body: { base64: MIDIA_FALSA_B64, mimetype: "audio/ogg" } };
  }
  if (caminho.startsWith("/chat/fetchProfilePictureUrl/")) {
    return { status: 200, body: { profilePictureUrl: null } };
  }
  return null;
}

/** Resposta imitando o Resend para os caminhos que o CRM usa. */
function respostaResend(caminho: string, metodo: string, corpo: Record<string, unknown> | null): { status: number; body: unknown } | null {
  if (caminho === "/emails" && metodo === "POST") {
    return { status: 200, body: { id: `sandbox-${crypto.randomUUID()}` } };
  }
  if (caminho === "/domains" && metodo === "GET") {
    return {
      status: 200,
      body: {
        data: [{
          id: "sandbox-dominio",
          name: "sandbox.viverdeia.ai",
          status: "verified",
          records: [{ record: "SPF", name: "send", type: "TXT", value: "v=spf1 include:amazonses.com ~all", status: "verified" }],
        }],
      },
    };
  }
  void corpo;
  return null;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const partes = url.pathname.split("/integration-sandbox/")[1]?.split("/") ?? [];
  const token = partes.shift() ?? "";
  const caminho = "/" + partes.join("/");
  if (!token) return json({ error: "sessão ausente" }, 404);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: sessao } = await admin
    .from("integration_sandbox_sessions")
    .select("id, org_id, response_status, webhook_url, webhook_events")
    .eq("token", token)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (!sessao) return json({ error: "sessão inexistente ou vencida" }, 404);

  const raw = req.method === "GET" || req.method === "HEAD" ? "" : await req.text();
  let corpo: Record<string, unknown> | null = null;
  try { corpo = raw ? JSON.parse(raw) : null; } catch { corpo = null; }

  // /webhook/set grava a URL para o /webhook/find confirmar, como o servidor real.
  if (caminho.startsWith("/webhook/set/")) {
    const webhook = (corpo?.webhook ?? corpo) as { url?: string; events?: unknown } | null;
    await admin
      .from("integration_sandbox_sessions")
      .update({ webhook_url: webhook?.url ?? null, webhook_events: webhook?.events ?? null })
      .eq("id", sessao.id);
  }

  const evolution = caminho.startsWith("/webhook/set/")
    ? { status: 201, body: { webhook: corpo?.webhook ?? corpo } }
    : respostaEvolution(caminho, corpo, sessao as Sessao)
      ?? respostaResend(caminho, req.method, corpo)
      ?? respostaCrm(caminho, req.method, url.searchParams, `${SUPABASE_URL}/functions/v1/integration-sandbox/${token}`)
      ?? respostaNylas(caminho, req.method, corpo)
      ?? respostaVoz(caminho, req.method, corpo, url.searchParams);
  // Sessão configurada para falhar (response_status >= 400) derruba TODOS os
  // provedores simulados, não só os caminhos sem fixture: é assim que o estresse
  // de falhas prova que cada function reage a um provedor fora do ar.
  const derrubada = (sessao.response_status as number) >= 400;
  const status = derrubada ? (sessao.response_status as number) : (evolution?.status ?? (sessao.response_status as number));
  const body = derrubada ? { error: "sandbox configurada para falhar" } : (evolution?.body ?? (status < 300 ? { ok: true } : { error: "sandbox configurada para falhar" }));
  const bruto = derrubada ? null : ((evolution as { raw?: Uint8Array } | null)?.raw ?? null);

  await admin.from("integration_sandbox_captures").insert({
    session_id: sessao.id,
    org_id: sessao.org_id,
    method: req.method,
    path: caminho,
    query: Object.fromEntries(url.searchParams),
    headers: Object.fromEntries(req.headers),
    body: corpo,
    raw_body: raw.slice(0, 20_000),
    response_status: status,
  });

  if (bruto) return new Response(bruto as unknown as BodyInit, { status, headers: { "Content-Type": "audio/mpeg" } });
  return json(body, status);
});

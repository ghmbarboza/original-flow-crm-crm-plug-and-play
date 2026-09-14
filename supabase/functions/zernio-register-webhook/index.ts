// Cadastra (ou atualiza) no Zernio o webhook que traz as mensagens para o CRM.
//
// POR QUE ISSO EXISTE: a tela do Zernio salvava api_key + profile_id, mas nunca
// mostrava nem registrava a URL do zernio-webhook. Sem ela o Zernio não avisa o
// CRM de nada: os canais apareciam conectados e nenhuma mensagem chegava.
//
// Fluxo: gera (ou reaproveita) o secret da org, procura um webhook do Zernio que
// já aponte para a nossa URL e atualiza; se não houver, cria. O secret é o que o
// Zernio usa para assinar cada entrega (X-Zernio-Signature, HMAC-SHA256 hex).
// API: https://docs.zernio.com/webhooks
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const ZERNIO_API = "https://zernio.com/api/v1";

const EVENTOS_ZERNIO = [
  "message.received",
  "conversation.started",
  "message.delivered",
  "message.read",
  "message.failed",
];

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

interface WebhookZernio {
  _id?: string;
  id?: string;
  url?: string;
}

/** A listagem vem como `{ webhooks: [...] }` ou como array direto, conforme a versão. */
function extrairLista(corpo: unknown): WebhookZernio[] {
  if (Array.isArray(corpo)) return corpo as WebhookZernio[];
  const obj = corpo as { webhooks?: unknown; data?: unknown } | null;
  if (Array.isArray(obj?.webhooks)) return obj!.webhooks as WebhookZernio[];
  if (Array.isArray(obj?.data)) return obj!.data as WebhookZernio[];
  return [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("Authorization");
    const { data: userData } = authHeader
      ? await admin.auth.getUser(authHeader.replace("Bearer ", ""))
      : { data: { user: null } };
    const user = userData?.user;
    if (!user) return json({ error: "Não autorizado" }, 401);

    const { data: profile } = await admin
      .from("profiles").select("org_id").eq("id", user.id).maybeSingle();
    const orgId = profile?.org_id as string | undefined;
    if (!orgId) return json({ error: "Organização não encontrada" }, 400);

    const { data: adminRole } = await admin
      .from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!adminRole) return json({ error: "Apenas administradores podem configurar o Zernio." }, 403);

    const { data: config } = await admin
      .from("zernio_configs")
      .select("id, api_key, profile_id, webhook_secret")
      .eq("org_id", orgId)
      .maybeSingle();
    if (!config) return json({ error: "Zernio não configurado para esta organização." }, 400);

    const secret = (config.webhook_secret as string | null) ||
      crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
    const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/zernio-webhook`;
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${config.api_key}` };

    const listResp = await fetch(`${ZERNIO_API}/webhooks/settings`, {
      headers,
      signal: AbortSignal.timeout(10_000),
    });
    if (listResp.status === 401 || listResp.status === 403) {
      return json({ error: "O Zernio recusou a API Key. Confira a chave no painel do Zernio." }, 400);
    }
    if (!listResp.ok) {
      return json({ error: `O Zernio não listou os webhooks (${listResp.status}).` }, 502);
    }
    const existente = extrairLista(await listResp.json().catch(() => null)).find((w) => w.url === url);
    const idExistente = existente?._id ?? existente?.id;

    const corpo = {
      name: "FlowCRM",
      url,
      secret,
      events: EVENTOS_ZERNIO,
      isActive: true,
      ...(idExistente ? { _id: idExistente } : {}),
    };
    const saveResp = await fetch(`${ZERNIO_API}/webhooks/settings`, {
      method: idExistente ? "PUT" : "POST",
      headers,
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(10_000),
    });
    if (!saveResp.ok) {
      const texto = await saveResp.text();
      return json({ error: `O Zernio não aceitou o webhook (${saveResp.status}): ${texto.slice(0, 200)}` }, 502);
    }

    // O secret só é gravado depois que o Zernio aceitou: gravar antes deixaria o
    // CRM exigindo uma assinatura que o Zernio não conhece.
    const { error } = await admin
      .from("zernio_configs")
      .update({ webhook_secret: secret, updated_at: new Date().toISOString() })
      .eq("id", config.id);
    if (error) return json({ error: `Webhook criado, mas o secret não foi salvo: ${error.message}` }, 500);

    return json({ ok: true, url, atualizado: !!idExistente });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Erro inesperado" }, 500);
  }
});

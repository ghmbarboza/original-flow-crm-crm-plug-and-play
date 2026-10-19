// Cria/conecta uma instância Evolution e devolve o QR Code para parear o número.
//
// Fluxo:
//  1. Autentica o usuário e resolve a org.
//  2. Cria a instância no servidor Evolution (ou reaproveita a existente/escolhida).
//  3. Registra o webhook via `POST /webhook/set/{instance}` e CONFIRMA com
//     `GET /webhook/find/{instance}` — o objeto `webhook` do `/instance/create`
//     é ignorado silenciosamente pela v2.3, então nunca confiamos nele.
//  4. Busca o QR Code com algumas tentativas em `/instance/connect/{instance}`.
//  5. Persiste a instância em `evolution_configs`.
//
// A api_key da Evolution fica só no banco (protegido por RLS) — nunca volta ao cliente.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { falhaDeAlcance, mensagemServidorInalcancavel } from "../_shared/evolutionAlcance.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const WEBHOOK_EVENTS = ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"];
const QR_TENTATIVAS = 3;
const QR_INTERVALO_MS = 3000;

const ERRO_CHAVE_RECUSADA =
  "O servidor Evolution recusou a API Key (401). Use a chave GLOBAL do servidor — a mesma que " +
  "abre o /manager, definida em AUTHENTICATION_API_KEY — e não a chave de uma instância. " +
  "Se você trocou de servidor, a chave também muda.";

const AVISO_SEM_QR =
  "O servidor Evolution não está gerando QR Code — isso costuma indicar servidor " +
  "desatualizado ou travado. Peça ao administrador para reiniciar/atualizar o Evolution.";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface EvolutionAlvo {
  server_url: string;
  api_key: string;
  instance_name: string;
}

/**
 * Registra o webhook e confirma a gravação.
 *
 * A v2 exige o objeto aninhado `{ "webhook": { ... } }`; o formato plano é aceito
 * sem erro mas não persiste. Por isso a confirmação via `/webhook/find` é obrigatória.
 */
async function registrarWebhook(
  { server_url, api_key, instance_name }: EvolutionAlvo,
  webhookUrl: string,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const headers = { "Content-Type": "application/json", apikey: api_key };

  const setResp = await fetch(`${server_url}/webhook/set/${instance_name}`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url: webhookUrl,
        byEvents: false,
        base64: true,
        events: WEBHOOK_EVENTS,
      },
    }),
  });

  if (!setResp.ok) {
    const text = await setResp.text();
    return {
      ok: false,
      erro: `Não foi possível registrar o webhook na instância (${setResp.status}): ${text.slice(0, 200)}`,
    };
  }

  const findResp = await fetch(`${server_url}/webhook/find/${instance_name}`, { headers });
  if (!findResp.ok) {
    return {
      ok: false,
      erro: `O servidor não confirmou o webhook (${findResp.status}). Verifique a versão do Evolution.`,
    };
  }

  const found = await findResp.json().catch(() => null);
  const node = found?.webhook ?? found;
  const url: string | undefined = node?.url;
  if (!url || url !== webhookUrl) {
    return {
      ok: false,
      erro:
        "O servidor Evolution aceitou a chamada mas não gravou o webhook. " +
        "Atualize o Evolution (v2.2+) ou registre o webhook manualmente.",
    };
  }

  // URL certa mas desabilitado ou sem MESSAGES_UPSERT = integração muda:
  // conexão "funciona" e nenhuma mensagem chega. Confirmar tudo, não só a URL.
  const enabled = node?.enabled;
  const eventos: string[] = Array.isArray(node?.events) ? node.events : [];
  const faltando = WEBHOOK_EVENTS.filter((e) => !eventos.includes(e));
  if (enabled === false || faltando.length > 0) {
    return {
      ok: false,
      erro:
        `O webhook foi gravado mas ficou ${enabled === false ? "desabilitado" : "sem os eventos: " + faltando.join(", ")}. ` +
        "Atualize o Evolution ou registre o webhook manualmente.",
    };
  }

  return { ok: true };
}

/** Tenta obter o QR (e o estado) em `/instance/connect`, com algumas tentativas. */
async function buscarQrCode(
  { server_url, api_key, instance_name }: EvolutionAlvo,
  tentativas = QR_TENTATIVAS,
): Promise<{ qr: string | null; state: string | null }> {
  let state: string | null = null;
  for (let i = 0; i < tentativas; i++) {
    if (i > 0) await dormir(QR_INTERVALO_MS);
    const resp = await fetch(`${server_url}/instance/connect/${instance_name}`, {
      headers: { apikey: api_key },
    });
    if (!resp.ok) continue;
    const data = await resp.json().catch(() => null);
    state = data?.instance?.state ?? state;
    const qr: string | null = data?.base64 ?? data?.code ?? data?.qrcode?.base64 ?? null;
    if (qr) return { qr, state };
    if (state === "open") return { qr: null, state };
  }
  return { qr: null, state };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Guardado fora do try para a mensagem de servidor fora do ar dizer qual.
  let servidorAlvo = "";
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
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .maybeSingle();
    const orgId = profile?.org_id;
    if (!orgId) return json({ error: "Organização não encontrada" }, 400);

    const body = await req.json().catch(() => ({}));
    const server_url: string = (body.server_url ?? "").replace(/\/$/, "");
    servidorAlvo = server_url;
    const api_key: string = body.api_key ?? "";
    const instance_name: string = body.instance_name ?? "";
    const display_name: string = body.display_name ?? instance_name;
    // "create" cria uma instância nova; "existing" reaproveita uma já existente
    // no servidor (escolhida na listagem do wizard).
    const mode: "create" | "existing" = body.mode === "existing" ? "existing" : "create";

    if (!server_url || !api_key || !instance_name) {
      return json({ error: "Informe server_url, api_key e instance_name." }, 400);
    }

    const alvo: EvolutionAlvo = { server_url, api_key, instance_name };

    // O token vai na URL do webhook e é a prova de origem que o evolution-webhook
    // confere. Reconectar a mesma instância mantém o token (e a URL) de antes.
    const { data: existing } = await admin
      .from("evolution_configs")
      .select("id, webhook_token")
      .eq("org_id", orgId)
      .eq("instance_name", instance_name)
      .maybeSingle();
    const webhookToken = (existing?.webhook_token as string | undefined) ??
      crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
    const webhookUrl =
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/evolution-webhook?token=${webhookToken}`;

    let qrCode: string | null = null;
    let status = "connecting";
    let state: string | null = null;

    // 1. Cria a instância (o `webhook` aqui é best-effort: a v2.3 ignora).
    if (mode === "create") {
      const createResp = await fetch(`${server_url}/instance/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: api_key },
        body: JSON.stringify({
          instanceName: instance_name,
          qrcode: true,
          integration: "WHATSAPP-BAILEYS",
          webhook: {
            enabled: true,
            url: webhookUrl,
            byEvents: false,
            base64: true,
            events: WEBHOOK_EVENTS,
          },
        }),
      });

      if (createResp.ok) {
        const created = await createResp.json().catch(() => null);
        qrCode = created?.qrcode?.base64 ?? created?.qrcode?.code ?? null;
      } else if (createResp.status === 401) {
        // Ver ERRO_CHAVE_RECUSADA: a chave de instância não cria instância nova,
        // e o JSON cru do servidor não diz isso.
        return json({ error: ERRO_CHAVE_RECUSADA }, 400);
      } else if (createResp.status !== 403 && createResp.status !== 409) {
        const text = await createResp.text();
        return json({ error: `Falha ao criar instância: ${text.slice(0, 200)}` }, 400);
      }
      // 403/409 = instância já existe: seguimos e reaproveitamos abaixo.
    }

    // 2. Webhook explícito + confirmação (obrigatório: sem ele não chega QR nem mensagem).
    const webhook = await registrarWebhook(alvo, webhookUrl);
    if (!webhook.ok) return json({ error: webhook.erro }, 400);

    // 3. QR Code (com tentativas) quando o create não trouxe.
    if (!qrCode) {
      const resultado = await buscarQrCode(alvo);
      qrCode = resultado.qr;
      state = resultado.state;
      if (state === "open") status = "connected";
    }

    const semQr = !qrCode && status !== "connected";

    // 4. Persiste (upsert por instância dentro da org).
    const record = {
      org_id: orgId,
      server_url,
      api_key,
      instance_name,
      webhook_token: webhookToken,
      display_name,
      qr_code: qrCode,
      status,
      is_active: true,
      updated_at: new Date().toISOString(),
    };

    let instanceId: string;
    if (existing?.id) {
      await admin.from("evolution_configs").update(record).eq("id", existing.id);
      instanceId = existing.id;
    } else {
      const { data: inserted, error } = await admin
        .from("evolution_configs")
        .insert(record)
        .select("id")
        .single();
      if (error) return json({ error: `Falha ao salvar instância: ${error.message}` }, 500);
      instanceId = inserted.id;
    }

    return json({
      instance_id: instanceId,
      qr_code: qrCode,
      status,
      webhook_registered: true,
      warning: semQr ? AVISO_SEM_QR : null,
    });
  } catch (err) {
    if (servidorAlvo && falhaDeAlcance(err)) {
      return json({ error: mensagemServidorInalcancavel(servidorAlvo, err) }, 502);
    }
    return json({ error: err instanceof Error ? err.message : "Erro inesperado" }, 500);
  }
});

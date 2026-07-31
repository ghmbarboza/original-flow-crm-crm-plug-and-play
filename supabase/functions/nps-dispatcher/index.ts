// Envio do NPS automático (Parte 5 do Sprint 10B). Rodado por cron a cada
// minuto via pg_cron + pg_net.
//
// Duas varreduras por org com NPS ativo:
//  1. ENVIO — conversas encerradas há >= delay_minutes, em canal coberto, sem
//     NPS já enviado e que não são importação de histórico: manda a pergunta
//     e cria a linha em nps_responses (score nulo = aguardando).
//  2. AGRADECIMENTO — respostas com score preenchido (pelo trigger
//     capture_nps_response) e sem thanked_at: manda o obrigado e marca.
//
// Segurança: opcionalmente protegido por NPS_CRON_SECRET (x-cron-secret),
// mesmo padrão dos outros dispatchers.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function sendText(
  admin: ReturnType<typeof createClient>,
  provider: string,
  orgId: string,
  phone: string,
  text: string,
): Promise<boolean> {
  if (provider === "evolution") {
    const { data: instance } = await admin
      .from("evolution_configs")
      .select("server_url, api_key, instance_name")
      .eq("org_id", orgId).eq("is_active", true)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!instance) return false;
    const resp = await fetch(`${instance.server_url}/message/sendText/${instance.instance_name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: instance.api_key as string },
      body: JSON.stringify({ number: phone, text }),
    });
    return resp.ok;
  }
  const { data: instance } = await admin
    .from("meta_configs")
    .select("phone_number_id, access_token")
    .eq("org_id", orgId).eq("is_active", true)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!instance) return false;
  const resp = await fetch(`https://graph.facebook.com/v21.0/${instance.phone_number_id}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${instance.access_token}` },
    body: JSON.stringify({ messaging_product: "whatsapp", to: phone, type: "text", text: { body: text } }),
  });
  return resp.ok;
}

/** Registra a mensagem enviada no histórico da conversa, sem reabri-la. */
async function recordMessage(
  admin: ReturnType<typeof createClient>,
  conversationId: string,
  orgId: string,
  content: string,
) {
  await admin.from("conversation_messages").insert({
    conversation_id: conversationId,
    org_id: orgId,
    direction: "outbound",
    content,
    is_from_ai: true,
    type: "text",
    status: "sent",
  });
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("NPS_CRON_SECRET");
  if (secret && req.headers.get("x-cron-secret") !== secret) {
    return json({ error: "Não autorizado" }, 401);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  let sent = 0;
  let thanked = 0;

  const { data: configs } = await admin
    .from("nps_configs")
    .select("org_id, message, thank_you_message, delay_minutes, active_channels, updated_at")
    .eq("is_active", true);

  for (const config of configs ?? []) {
    const orgId = config.org_id;
    const channels = (config.active_channels as string[] | null) ?? ["whatsapp"];
    const cutoff = new Date(Date.now() - Number(config.delay_minutes ?? 5) * 60_000).toISOString();

    const { data: org } = await admin.from("organizations").select("name").eq("id", orgId).maybeSingle();
    const pergunta = String(config.message).replace(/\{\{company\}\}/g, org?.name ?? "nossa empresa");

    // --- 1. Envio -------------------------------------------------------
    // resolved_at (gravado pelo trigger de SLA no fechamento) é o relógio do
    // delay. O corte em config.updated_at impede pesquisa retroativa: ligar o
    // NPS hoje não dispara para quem encerrou semana passada.
    const { data: encerradas } = await admin
      .from("conversations")
      .select("id, org_id, provider, phone_number, channel, assigned_to, contact_id, resolved_at")
      .eq("org_id", orgId)
      .eq("status", "closed")
      .is("import_id", null)
      .in("channel", channels)
      .not("resolved_at", "is", null)
      .gte("resolved_at", config.updated_at)
      .lte("resolved_at", cutoff)
      .limit(100);

    for (const conv of encerradas ?? []) {
      // Uma pesquisa por conversa, para sempre: encerrar de novo não repergunta.
      const { data: existente } = await admin
        .from("nps_responses")
        .select("id")
        .eq("conversation_id", conv.id)
        .limit(1)
        .maybeSingle();
      if (existente) continue;

      const ok = await sendText(admin, conv.provider, orgId, conv.phone_number, pergunta);
      if (!ok) continue;

      await admin.from("nps_responses").insert({
        org_id: orgId,
        conversation_id: conv.id,
        contact_id: conv.contact_id,
        agent_id: conv.assigned_to,
        channel: conv.channel ?? "whatsapp",
      });
      await recordMessage(admin, conv.id, orgId, pergunta);
      sent++;
    }

    // --- 2. Agradecimento ----------------------------------------------
    const { data: respondidas } = await admin
      .from("nps_responses")
      .select("id, conversation_id, conversation:conversations(provider, phone_number)")
      .eq("org_id", orgId)
      .not("score", "is", null)
      .is("thanked_at", null)
      .limit(50);

    for (const resp of respondidas ?? []) {
      const conv = resp.conversation as { provider: string; phone_number: string } | null;
      if (!conv) continue;
      const ok = await sendText(admin, conv.provider, orgId, conv.phone_number, config.thank_you_message);
      // Marca mesmo se o envio falhar? Não: tenta de novo na próxima passada.
      if (!ok) continue;
      await admin.from("nps_responses").update({ thanked_at: new Date().toISOString() }).eq("id", resp.id);
      await recordMessage(admin, resp.conversation_id, orgId, config.thank_you_message);
      thanked++;
    }
  }

  return json({ ok: true, sent, thanked });
});

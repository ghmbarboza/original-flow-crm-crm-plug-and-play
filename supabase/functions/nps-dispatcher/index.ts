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
// Segurança: só o cron chama, com o segredo interno (ver _shared/seguranca.ts).
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { cronAutorizado, naoAutorizado } from "../_shared/seguranca.ts";
import { contaDaConversa, enviarTextoPelaConta } from "../_shared/canal.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Conversa com o que o envio precisa: a pesquisa sai pelo número em que ela entrou. */
interface ConversaNps {
  org_id: string;
  provider: string;
  phone_number: string;
  channel: string | null;
  provider_conversation_id: string | null;
  channel_account_id: string | null;
}

const COLUNAS_CONVERSA = "org_id, provider, phone_number, channel, provider_conversation_id, channel_account_id";

async function sendText(admin: SupabaseClient, conv: ConversaNps, text: string): Promise<boolean> {
  const conta = await contaDaConversa(admin, conv);
  if (!conta) return false;
  const envio = await enviarTextoPelaConta(conta, conv, text);
  return envio.ok;
}

/** Registra a mensagem enviada no histórico da conversa, sem reabri-la. */
async function recordMessage(
  admin: SupabaseClient,
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
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  if (!(await cronAutorizado(req, admin))) return naoAutorizado();
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
      .select(`id, ${COLUNAS_CONVERSA}, assigned_to, contact_id, resolved_at`)
      .eq("org_id", orgId)
      .eq("status", "closed")
      // Trava da demo: nunca disparar NPS real para conversa semeada.
      .eq("is_demo", false)
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

      const ok = await sendText(admin, conv as unknown as ConversaNps, pergunta);
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
      .select(`id, conversation_id, conversation:conversations(${COLUNAS_CONVERSA})`)
      .eq("org_id", orgId)
      .not("score", "is", null)
      .is("thanked_at", null)
      .limit(50);

    for (const resp of respondidas ?? []) {
      // O PostgREST embute a relação como objeto, mas os tipos do supabase-js
      // inferem array; converter via `unknown` alinha tipo e realidade.
      const conv = resp.conversation as unknown as ConversaNps | null;
      if (!conv) continue;
      const ok = await sendText(admin, conv, config.thank_you_message);
      // Marca mesmo se o envio falhar? Não: tenta de novo na próxima passada.
      if (!ok) continue;
      await admin.from("nps_responses").update({ thanked_at: new Date().toISOString() }).eq("id", resp.id);
      await recordMessage(admin, resp.conversation_id, orgId, config.thank_you_message);
      thanked++;
    }
  }

  return json({ ok: true, sent, thanked });
});

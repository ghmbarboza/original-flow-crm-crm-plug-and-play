// Webhook público da Evolution API.
//
// Recebe eventos do servidor Evolution: atualização de conexão/QR e mensagens
// recebidas. Para cada mensagem inbound, resolve (ou cria) o contato e a conversa,
// grava a mensagem e — se a conversa está com a IA ativa — dispara a resposta
// automática (ai-reply).
//
// Endpoint público (a Evolution não envia auth). A segurança vem de resolver a
// instância pelo instance_name: eventos de instâncias desconhecidas são ignorados.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  base64ParaBytes, extensaoDeAudio, salvarAudioNoBucket, transcreverAudio,
} from "../_shared/audio.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function ok(body: unknown = { received: true }) {
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
}

/**
 * Baixa o binário de uma mídia pela própria Evolution.
 *
 * A URL do payload vem criptografada (mediaKey); descriptografar na mão é
 * frágil e desnecessário — a Evolution expõe o endpoint que devolve o base64
 * já decifrado.
 */
async function baixarMidiaEvolution(
  serverUrl: string,
  apiKey: string,
  instanceName: string,
  mensagemOriginal: unknown,
): Promise<{ bytes: Uint8Array; mimetype: string } | null> {
  try {
    const resp = await fetch(`${serverUrl}/chat/getBase64FromMediaMessage/${instanceName}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({ message: mensagemOriginal, convertToMp4: false }),
    });
    if (!resp.ok) {
      console.error(`[evolution] getBase64FromMediaMessage recusou [${resp.status}]: ${(await resp.text()).slice(0, 300)}`);
      return null;
    }
    const data = await resp.json().catch(() => ({}));
    const base64 = data?.base64 ?? data?.data?.base64;
    if (typeof base64 !== "string" || !base64) {
      console.error("[evolution] resposta de mídia sem base64:", JSON.stringify(data).slice(0, 300));
      return null;
    }
    return {
      bytes: base64ParaBytes(base64),
      mimetype: data?.mimetype ?? data?.data?.mimetype ?? "audio/ogg",
    };
  } catch (err) {
    console.error("[evolution] falha ao baixar mídia:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** Dispara a resposta da IA sem bloquear a resposta ao provedor. */
function triggerAI(conversationId: string) {
  const call = fetch(`${SUPABASE_URL}/functions/v1/ai-reply`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
    },
    body: JSON.stringify({ conversation_id: conversationId }),
  }).catch(() => {});
  // Mantém a função viva até a IA responder, sem atrasar o 200 ao provedor.
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(call);
  return call;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return ok();

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const body = await req.json().catch(() => ({}));

  const event: string = body.event ?? body.type ?? "";
  const instanceName: string = body.instance ?? body.instanceName ?? "";
  const data = body.data ?? {};

  if (!instanceName) return ok();

  const { data: instance } = await admin
    .from("evolution_configs")
    .select("id, org_id, server_url, api_key, instance_name")
    .eq("instance_name", instanceName)
    .maybeSingle();
  if (!instance) return ok({ ignored: "instância desconhecida" });

  const normalizedEvent = event.toUpperCase().replace(/\./g, "_");

  // Conexão / QR: atualiza a instância (o wizard faz poll disso).
  if (normalizedEvent === "CONNECTION_UPDATE") {
    const state = data.state ?? data.connection;
    const status = state === "open" ? "connected" : state === "close" ? "disconnected" : "connecting";
    await admin
      .from("evolution_configs")
      .update({
        status,
        phone_number: data.wuid ? String(data.wuid).split("@")[0] : undefined,
        connected_at: status === "connected" ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", instance.id);
    return ok();
  }

  if (normalizedEvent === "QRCODE_UPDATED") {
    await admin
      .from("evolution_configs")
      .update({ qr_code: data.qrcode?.base64 ?? data.qrcode?.code ?? null, status: "connecting", updated_at: new Date().toISOString() })
      .eq("id", instance.id);
    return ok();
  }

  if (normalizedEvent !== "MESSAGES_UPSERT") return ok();

  // Mensagem recebida. Ignora as enviadas por nós (fromMe).
  const key = data.key ?? {};
  if (key.fromMe) return ok();

  const remoteJid: string = key.remoteJid ?? "";
  const phone = remoteJid.split("@")[0];
  if (!phone) return ok();

  const message = data.message ?? {};
  const content: string =
    message.conversation ??
    message.extendedTextMessage?.text ??
    message.imageMessage?.caption ??
    "";
  if (!content) return ok({ ignored: "mensagem sem texto" });

  const orgId = instance.org_id;

  // Contato: casa pelo whatsapp_phone; cria um lead se não existir.
  const { data: existingContact } = await admin
    .from("contacts")
    .select("id")
    .eq("org_id", orgId)
    .eq("whatsapp_phone", phone)
    .is("merged_into_id", null)
    .maybeSingle();

  let contactId = existingContact?.id ?? null;
  if (!contactId) {
    const { data: created } = await admin
      .from("contacts")
      .insert({
        org_id: orgId,
        first_name: data.pushName ?? phone,
        whatsapp_phone: phone,
        status: "lead",
        source: "whatsapp",
      })
      .select("id")
      .single();
    contactId = created?.id ?? null;
  }

  // Conversa: uma por telefone dentro da org.
  const { data: existingConversation } = await admin
    .from("conversations")
    .select("id, status, unread_count")
    .eq("org_id", orgId)
    .eq("phone_number", phone)
    .maybeSingle();

  let conversationId = existingConversation?.id ?? null;
  let status = existingConversation?.status ?? "ai_active";
  if (!conversationId) {
    // Distribuição por canal: pré-atribui um agente elegível (round-robin) ou null.
    const { data: assignedTo } = await admin.rpc("pick_agent_for_channel", {
      p_org: orgId,
      p_channel: "whatsapp",
    });
    const { data: created } = await admin
      .from("conversations")
      .insert({
        org_id: orgId,
        phone_number: phone,
        contact_id: contactId,
        provider: "evolution",
        status: "ai_active",
        assigned_to: assignedTo ?? null,
        last_message_at: new Date().toISOString(),
        last_message_preview: content.slice(0, 120),
        unread_count: 1,
      })
      .select("id, status")
      .single();
    conversationId = created?.id ?? null;
    status = created?.status ?? "ai_active";
  } else {
    await admin
      .from("conversations")
      .update({
        contact_id: contactId,
        last_message_at: new Date().toISOString(),
        last_message_preview: content.slice(0, 120),
        unread_count: (existingConversation?.unread_count ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversationId);
  }

  if (!conversationId) return ok();

  await admin.from("conversation_messages").insert({
    conversation_id: conversationId,
    org_id: orgId,
    direction: "inbound",
    content,
    provider_message_id: key.id ?? null,
    type: "text",
    status: "received",
  });

  // Lead scoring por canal. Sem regra ativa a função não faz nada.
  if (contactId) {
    if (!existingConversation) {
      await admin.rpc("apply_lead_score", {
        p_org: orgId, p_contact: contactId,
        p_event: "conversation_started", p_channel: "whatsapp",
      });
    }
    await admin.rpc("apply_lead_score", {
      p_org: orgId, p_contact: contactId,
      p_event: "message_received", p_channel: "whatsapp",
    });
  }

  // IA responde só quando está no comando da conversa.
  if (status === "ai_active") {
    const call = triggerAI(conversationId);
    const runtime = (globalThis as { EdgeRuntime?: unknown }).EdgeRuntime;
    if (!runtime) await call; // sem waitUntil, aguarda para não perder a resposta
  }

  return ok();
});

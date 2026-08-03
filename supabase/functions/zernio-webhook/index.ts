// Webhook público do Zernio (multicanal: WhatsApp, Instagram, Telegram, ...).
//
// Recebe eventos do Zernio e, para cada mensagem recebida, resolve (ou cria) o
// contato e a conversa do canal, grava a mensagem e — se a conversa está com a IA
// ativa — dispara a resposta automática.
//
// Endpoint público (verify_jwt=false). A segurança vem de: (1) resolver a org pelo
// profileId da conta; e (2) verificar a assinatura HMAC-SHA256 (X-Zernio-Signature)
// quando a org tem webhook_secret configurado.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  baixarBinario, extensaoDeAudio, salvarAudioNoBucket, transcreverAudio,
} from "../_shared/audio.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function ok(body: unknown = { received: true }) {
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
}

/** Dispara a resposta da IA sem bloquear o 200 ao Zernio. */
function triggerAI(conversationId: string) {
  const call = fetch(`${SUPABASE_URL}/functions/v1/ai-reply`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY },
    body: JSON.stringify({ conversation_id: conversationId }),
  }).catch(() => {});
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(call);
  return call;
}

/** Comparação constant-time de duas strings. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const toHex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const toB64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)));

/**
 * Verifica X-Zernio-Signature = HMAC-SHA256(secret, rawBody).
 * O spec não fixa o encoding; aceitamos hex ou base64, com/sem prefixo "sha256=".
 */
async function verifySignature(secret: string, rawBody: string, header: string | null): Promise<boolean> {
  if (!header) return false;
  const provided = header.replace(/^sha256=/i, "").trim();
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  return safeEqual(provided, toHex(sig)) || safeEqual(provided, toB64(sig));
}

interface Sender {
  id?: string;
  name?: string;
  username?: string;
  phoneNumber?: string | null;
}

/** Áudio recebido, já resolvido para uma URL baixável. */
interface AudioRecebido {
  url: string;
  mimetype?: string;
  headers?: Record<string, string>;
}

/**
 * Procura um anexo de áudio no payload do Zernio.
 *
 * O spec não fixa o formato dos anexos, então tentamos os arranjos plausíveis
 * (`attachments[]`, `media`, `audio`) e, quando o evento parece ter mídia mas
 * nada casa, logamos o payload para ajustar o parser com um caso real em mão.
 */
function extrairAudioZernio(message: Record<string, unknown>): AudioRecebido | null {
  const candidatos: unknown[] = [
    ...(Array.isArray(message.attachments) ? message.attachments : []),
    message.media,
    message.audio,
  ];

  for (const bruto of candidatos) {
    if (!bruto || typeof bruto !== "object") continue;
    const item = bruto as Record<string, unknown>;
    const tipo = String(item.type ?? item.mediaType ?? "").toLowerCase();
    const mimetype = String(item.mimetype ?? item.mimeType ?? item.contentType ?? "");
    const url = item.url ?? item.mediaUrl ?? item.downloadUrl ?? item.link;
    if (typeof url !== "string" || !url) continue;
    if (tipo.includes("audio") || tipo === "voice" || tipo === "ptt" || mimetype.startsWith("audio/")) {
      return { url, mimetype: mimetype || undefined };
    }
  }

  const temMidia = !!message.attachments || !!message.media || !!message.audio;
  if (temMidia) {
    console.error("[zernio] anexo em formato não reconhecido:", JSON.stringify(message).slice(0, 800));
  }
  return null;
}

/**
 * Resolve o contato do remetente em qualquer canal, criando um lead se não existir.
 *
 * WhatsApp casa pelo `whatsapp_phone` (compatibilidade com o fluxo antigo). Os demais
 * canais não têm telefone, então casam pelo identificador da plataforma guardado em
 * `custom_fields.channel_contact_id` — sempre em conjunto com `custom_fields.channel`,
 * porque ids de plataformas diferentes podem colidir.
 *
 * O contato criado registra a origem no `source` (= canal) e guarda o identificador em
 * `custom_fields`, até que um agente vincule manualmente um telefone.
 */
async function resolveContact(
  admin: ReturnType<typeof createClient>,
  orgId: string,
  channel: string,
  identifier: string,
  channelContactId: string,
  name: string | null,
): Promise<string | null> {
  if (channel === "whatsapp") {
    const { data } = await admin
      .from("contacts").select("id")
      .eq("org_id", orgId).eq("whatsapp_phone", identifier)
      .is("merged_into_id", null).maybeSingle();
    if (data?.id) return data.id as string;
  } else {
    const { data } = await admin
      .from("contacts").select("id")
      .eq("org_id", orgId)
      .eq("custom_fields->>channel_contact_id", channelContactId)
      .eq("custom_fields->>channel", channel)
      .is("merged_into_id", null).maybeSingle();
    if (data?.id) return data.id as string;
  }

  const { data: created } = await admin
    .from("contacts")
    .insert({
      org_id: orgId,
      first_name: name ?? identifier,
      whatsapp_phone: channel === "whatsapp" ? identifier : null,
      status: "lead",
      source: channel,
      custom_fields: { channel_contact_id: channelContactId, channel },
    })
    .select("id").single();
  return (created?.id as string | undefined) ?? null;
}

/** Cria/atualiza contato+conversa e grava a mensagem inbound. Devolve o status da conversa. */
async function ingestInbound(
  admin: ReturnType<typeof createClient>,
  orgId: string,
  channel: string,
  sender: Sender,
  text: string,
  providerConversationId: string | null,
  providerMessageId: string | null,
  audio: AudioRecebido | null = null,
): Promise<{ conversationId: string; status: string; transcricao: string | null } | null> {
  // Identificador do remetente no canal. WhatsApp = telefone; demais = id da plataforma.
  const identifier = (sender.phoneNumber ?? sender.id ?? "").replace(/^\+/, "");
  if (!identifier) return null;
  // Áudio ainda não transcrito precisa aparecer na lista de conversas.
  const preview = text ? text.slice(0, 120) : "🎤 Áudio";
  const now = new Date().toISOString();

  // Conversa: única por (org, canal, identificador).
  const { data: existing } = await admin
    .from("conversations")
    .select("id, status, unread_count, contact_id")
    .eq("org_id", orgId)
    .eq("channel", channel)
    .eq("phone_number", identifier)
    .maybeSingle();

  let conversationId = existing?.id as string | undefined;
  let status = (existing?.status as string) ?? "ai_active";
  let contactId = (existing?.contact_id as string | null) ?? null;
  const isNewConversation = !conversationId;

  if (!conversationId) {
    contactId = await resolveContact(
      admin, orgId, channel, identifier,
      sender.id ?? identifier,
      sender.name ?? sender.username ?? null,
    );

    // Distribuição por canal: pré-atribui um agente elegível (round-robin) ou null.
    const { data: assignedTo } = await admin.rpc("pick_agent_for_channel", {
      p_org: orgId,
      p_channel: channel,
    });
    const { data: conv } = await admin
      .from("conversations")
      .insert({
        org_id: orgId,
        channel,
        provider: "zernio",
        phone_number: identifier,
        channel_contact_id: sender.id ?? identifier,
        channel_contact_name: sender.name ?? null,
        contact_id: contactId,
        provider_conversation_id: providerConversationId,
        status: "ai_active",
        assigned_to: assignedTo ?? null,
        last_message_at: now,
        last_message_preview: preview,
        unread_count: 1,
      })
      .select("id, status").single();
    conversationId = conv?.id as string | undefined;
    status = (conv?.status as string) ?? "ai_active";
  } else {
    await admin
      .from("conversations")
      .update({
        last_message_at: now,
        last_message_preview: preview,
        unread_count: (existing?.unread_count ?? 0) + 1,
        // Preenche o id do Zernio se ainda não tínhamos (ex.: conversa criada por outro evento).
        provider_conversation_id: providerConversationId ?? undefined,
        updated_at: now,
      })
      .eq("id", conversationId);
  }

  if (!conversationId) return null;

  // Áudio: guarda o binário no bucket e transcreve. A transcrição vai em
  // `content`, então o histórico lido pela IA continua textual. Falha de
  // download ou de transcrição nunca descarta a mensagem.
  let transcricao: string | null = null;
  if (audio) {
    const midia = await baixarBinario(audio.url, audio.headers ?? {});
    let mediaPath: string | null = null;
    if (midia) {
      const mimetype = audio.mimetype ?? midia.mimetype;
      mediaPath = await salvarAudioNoBucket(
        admin as unknown as Parameters<typeof salvarAudioNoBucket>[0],
        orgId, conversationId, midia.bytes,
        `${Date.now()}.${extensaoDeAudio(mimetype)}`, mimetype,
      );
      transcricao = await transcreverAudio(midia.bytes, mimetype);
    }
    await admin.from("conversation_messages").insert({
      conversation_id: conversationId,
      org_id: orgId,
      direction: "inbound",
      content: transcricao,
      media_url: mediaPath,
      provider_message_id: providerMessageId,
      type: "audio",
      status: "received",
    });
    if (transcricao) {
      await admin
        .from("conversations")
        .update({ last_message_preview: transcricao.slice(0, 120) })
        .eq("id", conversationId);
    }
  } else {
    await admin.from("conversation_messages").insert({
      conversation_id: conversationId,
      org_id: orgId,
      direction: "inbound",
      content: text,
      provider_message_id: providerMessageId,
      type: "text",
      status: "received",
    });
  }

  // Lead scoring por canal. A função resolve a regra (canal vence geral),
  // grava o histórico e incrementa o score; sem regra ativa, não faz nada.
  if (contactId) {
    if (isNewConversation) {
      await admin.rpc("apply_lead_score", {
        p_org: orgId,
        p_contact: contactId,
        p_event: "conversation_started",
        p_channel: channel,
      });
    }
    await admin.rpc("apply_lead_score", {
      p_org: orgId,
      p_contact: contactId,
      p_event: "message_received",
      p_channel: channel,
    });
  }

  return { conversationId, status, transcricao };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return ok();

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const rawBody = await req.text();
  let body: Record<string, unknown>;
  try { body = JSON.parse(rawBody); } catch { return ok({ ignored: "corpo inválido" }); }

  const event = String(body.event ?? "");
  const account = (body.account ?? {}) as { profileId?: string; accountId?: string; platform?: string };

  // Resolve a org pelo profileId da conta (o zernio_config guarda o profile_id).
  const profileId = account.profileId;
  if (!profileId) return ok({ ignored: "sem profileId" });

  const { data: config } = await admin
    .from("zernio_configs")
    .select("org_id, webhook_secret")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (!config) return ok({ ignored: "profile desconhecido" });
  const orgId = config.org_id as string;

  // Assinatura: obrigatória apenas quando a org configurou um webhook_secret.
  if (config.webhook_secret) {
    const valid = await verifySignature(
      config.webhook_secret as string, rawBody, req.headers.get("X-Zernio-Signature"),
    );
    if (!valid) return new Response(JSON.stringify({ error: "assinatura inválida" }), { status: 401 });
  }

  // ---- message.received: nova mensagem recebida ----
  if (event === "message.received") {
    const message = (body.message ?? {}) as {
      platform?: string; text?: string; conversationId?: string; id?: string; sender?: Sender;
    };
    const conversation = (body.conversation ?? {}) as { id?: string };
    const channel = message.platform ?? account.platform ?? "whatsapp";
    const text = message.text ?? "";
    const audio = extrairAudioZernio(message as Record<string, unknown>);
    if (!text && !audio) return ok({ ignored: "mensagem sem texto" });

    const result = await ingestInbound(
      admin, orgId, channel, message.sender ?? {}, text,
      conversation.id ?? message.conversationId ?? null, message.id ?? null, audio,
    );
    if (!result) return ok();

    // Áudio sem transcrição não dispara a IA: não há texto para ela ler.
    if (result.status === "ai_active" && (!audio || result.transcricao)) {
      const call = triggerAI(result.conversationId);
      const runtime = (globalThis as { EdgeRuntime?: unknown }).EdgeRuntime;
      if (!runtime) await call;
    }
    return ok();
  }

  // ---- conversation.started: garante a conversa (sem mensagem) ----
  if (event === "conversation.started") {
    const conv = (body.conversation ?? {}) as {
      id?: string; platform?: string; participantId?: string; participantName?: string;
    };
    const channel = conv.platform ?? account.platform ?? "whatsapp";
    const identifier = conv.participantId ?? "";
    if (!identifier) return ok();

    const { data: existing } = await admin
      .from("conversations").select("id")
      .eq("org_id", orgId).eq("channel", channel).eq("phone_number", identifier).maybeSingle();
    if (!existing) {
      const contactId = await resolveContact(
        admin, orgId, channel, identifier, identifier, conv.participantName ?? null,
      );
      // Distribuição por canal: pré-atribui um agente elegível (round-robin) ou null.
      const { data: assignedTo } = await admin.rpc("pick_agent_for_channel", {
        p_org: orgId,
        p_channel: channel,
      });
      await admin.from("conversations").insert({
        org_id: orgId, channel, provider: "zernio", phone_number: identifier,
        channel_contact_id: identifier, channel_contact_name: conv.participantName ?? null,
        contact_id: contactId, provider_conversation_id: conv.id ?? null,
        status: "ai_active", assigned_to: assignedTo ?? null,
        last_message_at: new Date().toISOString(), unread_count: 0,
      });
    }
    return ok();
  }

  // ---- status de entrega: atualiza a mensagem pelo provider_message_id ----
  if (event === "message.delivered" || event === "message.read" || event === "message.failed") {
    const message = (body.message ?? {}) as { platformMessageId?: string; id?: string };
    const pmid = message.platformMessageId ?? message.id;
    if (pmid) {
      const status = event === "message.failed" ? "failed" : event === "message.read" ? "read" : "delivered";
      await admin.from("conversation_messages").update({ status }).eq("provider_message_id", pmid).eq("org_id", orgId);
    }
    return ok();
  }

  return ok({ ignored: event });
});

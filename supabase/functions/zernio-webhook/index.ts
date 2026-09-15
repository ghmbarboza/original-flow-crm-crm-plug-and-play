// Webhook público do Zernio (multicanal: WhatsApp, Instagram, Telegram, ...).
//
// Recebe eventos do Zernio e, para cada mensagem recebida, resolve (ou cria) o
// contato e a conversa do canal, grava a mensagem e — se a conversa está com a IA
// ativa — dispara a resposta automática.
//
// Endpoint público (verify_jwt=false). A segurança vem de: (1) resolver a org pelo
// profileId da conta; e (2) verificar a assinatura HMAC-SHA256 (X-Zernio-Signature),
// obrigatória desde 14/09 (o secret é gravado pelo zernio-register-webhook).
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  baixarBinario, extensaoDeAudio, resolverChaveElevenLabs, salvarAudioNoBucket, salvarMidiaNoBucket,
  transcreverAudio,
} from "../_shared/audio.ts";
import { obterOuCriarContatoCanal, obterOuCriarContatoWhatsapp, obterOuCriarConversa } from "../_shared/conversa.ts";

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

type TipoAnexo = "audio" | "image" | "video" | "document";

/** Anexo recebido, já resolvido para uma URL baixável. */
interface AnexoRecebido {
  tipo: TipoAnexo;
  url: string;
  mimetype?: string;
  /** Nome original do arquivo, quando o canal informa (documento). */
  nome?: string;
}

// Pasta no bucket e rótulo da lista de conversas, iguais aos do evolution-webhook.
const MIDIA: Record<Exclude<TipoAnexo, "audio">, { pasta: string; rotulo: string; ext: string }> = {
  image: { pasta: "imagem", rotulo: "📷 Foto", ext: "jpg" },
  video: { pasta: "video", rotulo: "🎥 Vídeo", ext: "mp4" },
  document: { pasta: "documento", rotulo: "📎 Documento", ext: "bin" },
};

function tipoDoAnexo(tipo: string, mimetype: string): TipoAnexo | null {
  if (tipo.includes("audio") || tipo === "voice" || tipo === "ptt" || mimetype.startsWith("audio/")) return "audio";
  if (tipo === "image" || tipo === "sticker" || tipo === "gif" || mimetype.startsWith("image/")) return "image";
  if (tipo === "video" || mimetype.startsWith("video/")) return "video";
  if (tipo === "file" || tipo === "document" || mimetype) return "document";
  return null;
}

/**
 * Procura o primeiro anexo (áudio, foto, vídeo ou documento) no payload do Zernio.
 *
 * O contrato é `attachments[]` com `{ type: image|video|file|sticker|audio, url }`
 * (InboxWebhookMessage no zernio-api-openapi.yaml). `media` e `audio` ficam como
 * tolerância; quando o evento parece ter mídia mas nada casa, logamos o payload
 * para ajustar o parser com um caso real em mão.
 */
function extrairAnexoZernio(message: Record<string, unknown>): AnexoRecebido | null {
  const candidatos: unknown[] = [
    ...(Array.isArray(message.attachments) ? message.attachments : []),
    message.media,
    message.audio,
  ];

  for (const bruto of candidatos) {
    if (!bruto || typeof bruto !== "object") continue;
    const item = bruto as Record<string, unknown>;
    const payload = (item.payload && typeof item.payload === "object" ? item.payload : {}) as Record<string, unknown>;
    const tipoBruto = String(item.type ?? item.mediaType ?? "").toLowerCase();
    const mimetype = String(item.mimetype ?? item.mimeType ?? item.contentType ?? payload.mimeType ?? payload.mime_type ?? "");
    const url = item.url ?? item.mediaUrl ?? item.downloadUrl ?? item.link;
    if (typeof url !== "string" || !url) continue;
    // O objeto `audio` legado não traz type: vale como áudio.
    const tipo = tipoDoAnexo(tipoBruto || (bruto === message.audio ? "audio" : ""), mimetype);
    if (!tipo) continue;
    const nome = item.filename ?? item.fileName ?? payload.filename ?? payload.fileName;
    return {
      tipo, url,
      mimetype: mimetype || undefined,
      nome: typeof nome === "string" && nome ? nome : undefined,
    };
  }

  // Lista de anexos vazia não é mídia: antes toda mensagem de texto caía aqui e
  // enchia o log de erro falso, escondendo os casos reais.
  const temMidia = (Array.isArray(message.attachments) && message.attachments.length > 0) ||
    !!message.media || !!message.audio;
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
  admin: SupabaseClient,
  orgId: string,
  channel: string,
  identifier: string,
  channelContactId: string,
  name: string | null,
): Promise<{ id: string; novo: boolean } | null> {
  const dados = {
    first_name: name ?? identifier,
    status: "lead",
    source: channel,
    custom_fields: { channel_contact_id: channelContactId, channel },
  };

  // WhatsApp tem índice único por telefone: o helper adota o contato de uma
  // invocação paralela em vez de perder a mensagem.
  if (channel === "whatsapp") {
    const contato = await obterOuCriarContatoWhatsapp(admin, orgId, identifier, dados);
    return contato ? { id: contato.id, novo: false } : null;
  }

  // Demais canais: índice único uniq_contact_canal_por_org, mesma adoção em corrida.
  return await obterOuCriarContatoCanal(admin, orgId, channel, channelContactId, dados);
}

/** Cria/atualiza contato+conversa e grava a mensagem inbound. Devolve o status da conversa. */
async function ingestInbound(
  admin: SupabaseClient,
  orgId: string,
  channel: string,
  sender: Sender,
  text: string,
  providerConversationId: string | null,
  providerMessageId: string | null,
  anexo: AnexoRecebido | null = null,
  apiKey: string | null = null,
): Promise<{ conversationId: string; status: string; transcricao: string | null } | null> {
  // Identificador do remetente no canal. WhatsApp = telefone; demais = id da plataforma.
  const identifier = (sender.phoneNumber ?? sender.id ?? "").replace(/^\+/, "");
  if (!identifier) return null;
  // Mídia sem legenda (e áudio ainda não transcrito) precisa aparecer na lista de conversas.
  const preview = text
    ? text.slice(0, 120)
    : !anexo || anexo.tipo === "audio" ? "🎤 Áudio" : MIDIA[anexo.tipo].rotulo;
  const now = new Date().toISOString();

  // Conversa: única por (org, canal, identificador), à prova de rajada
  // (ver _shared/conversa.ts). O contato só é resolvido quando a conversa é nova.
  const conversa = await obterOuCriarConversa(admin, { org_id: orgId, phone_number: identifier, channel }, async () => {
    const contatoCriado = await resolveContact(
      admin, orgId, channel, identifier,
      sender.id ?? identifier,
      sender.name ?? sender.username ?? null,
    );
    // Distribuição por canal: pré-atribui um agente elegível (round-robin) ou null.
    const { data: assignedTo } = await admin.rpc("pick_agent_for_channel", {
      p_org: orgId,
      p_channel: channel,
    });
    return {
      channel,
      provider: "zernio",
      channel_contact_id: sender.id ?? identifier,
      channel_contact_name: sender.name ?? null,
      contact_id: contatoCriado?.id ?? null,
      provider_conversation_id: providerConversationId,
      status: "ai_active",
      assigned_to: assignedTo ?? null,
      last_message_at: now,
      last_message_preview: preview,
      unread_count: 1,
    };
  });
  if (!conversa) return null;

  const conversationId = conversa.id;
  const status = conversa.status;
  const isNewConversation = conversa.criada;
  // Contato de rajada não precisa de limpeza: o índice uniq_contact_canal_por_org
  // faz as invocações paralelas adotarem o mesmo contato. Apagar a "sobra" aqui
  // apagaria justamente o contato que a conversa vencedora referencia.
  const { data: dono } = await admin.from("conversations").select("contact_id").eq("id", conversationId).single();
  const contactId = (dono?.contact_id as string | null) ?? null;

  if (!conversa.criada) {
    await admin
      .from("conversations")
      .update({
        last_message_at: now,
        last_message_preview: preview,
        unread_count: conversa.unread_count + 1,
        // Preenche o id do Zernio se ainda não tínhamos (ex.: conversa criada por outro evento).
        provider_conversation_id: providerConversationId ?? undefined,
        updated_at: now,
      })
      .eq("id", conversationId);
  }

  // Áudio: guarda o binário no bucket e transcreve. A transcrição vai em
  // `content`, então o histórico lido pela IA continua textual. Falha de
  // download ou de transcrição nunca descarta a mensagem.
  // Mídia do WhatsApp vem por GET /v1/whatsapp/media/{id} do próprio Zernio, que
  // exige a API Key; Instagram, Facebook e Telegram mandam link direto da CDN.
  // Sem o header o download dava 401 e o áudio do WhatsApp nunca era transcrito.
  const headersDownload: Record<string, string> =
    anexo && apiKey && /(^|\.)zernio\.com$/i.test(new URL(anexo.url, "https://x").hostname)
      ? { Authorization: `Bearer ${apiKey}` }
      : {};

  let transcricao: string | null = null;
  if (anexo && anexo.tipo !== "audio") {
    const info = MIDIA[anexo.tipo];
    const midia = await baixarBinario(anexo.url, headersDownload);
    let mediaPath: string | null = null;
    if (midia) {
      const mimetype = anexo.mimetype ?? midia.mimetype;
      // Documento guarda o nome original; foto e vídeo não têm nome útil.
      const nome = (anexo.tipo === "document" ? anexo.nome?.replace(/[^\w.-]/g, "_") : "") || `${Date.now()}.${info.ext}`;
      mediaPath = await salvarMidiaNoBucket(
        admin, orgId, conversationId, info.pasta, midia.bytes, `${Date.now()}-${nome}`, mimetype,
      );
    }
    // Download falho não descarta a mensagem: fica o registro de que o cliente mandou algo.
    await admin.from("conversation_messages").insert({
      conversation_id: conversationId,
      org_id: orgId,
      direction: "inbound",
      content: text || null,
      media_url: mediaPath,
      provider_message_id: providerMessageId,
      type: anexo.tipo,
      status: "received",
    });
  } else if (anexo) {
    const midia = await baixarBinario(anexo.url, headersDownload);
    let mediaPath: string | null = null;
    if (midia) {
      const mimetype = anexo.mimetype ?? midia.mimetype;
      mediaPath = await salvarAudioNoBucket(
        admin, orgId, conversationId, midia.bytes,
        `${Date.now()}.${extensaoDeAudio(mimetype)}`, mimetype,
      );
      transcricao = await transcreverAudio(
        midia.bytes, mimetype, await resolverChaveElevenLabs(admin, orgId),
      );
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
    .select("org_id, webhook_secret, api_key")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (!config) return ok({ ignored: "profile desconhecido" });
  const orgId = config.org_id as string;

  // Assinatura obrigatória. O secret é gravado pelo zernio-register-webhook no
  // mesmo momento em que o webhook é cadastrado no Zernio, então toda org que
  // recebe eventos tem um. Sem secret, não há como provar que veio do Zernio.
  const valid = !!config.webhook_secret && await verifySignature(
    config.webhook_secret as string, rawBody, req.headers.get("X-Zernio-Signature"),
  );
  if (!valid) {
    console.error(`[zernio] assinatura ${config.webhook_secret ? "inválida" : "sem secret cadastrado"} (org ${orgId})`);
    return new Response(JSON.stringify({ error: "assinatura inválida" }), { status: 401 });
  }

  // ---- message.received: nova mensagem recebida ----
  if (event === "message.received") {
    const message = (body.message ?? {}) as {
      platform?: string; text?: string; conversationId?: string; id?: string; sender?: Sender;
    };
    const conversation = (body.conversation ?? {}) as { id?: string };
    const channel = message.platform ?? account.platform ?? "whatsapp";
    const text = message.text ?? "";
    const anexo = extrairAnexoZernio(message as Record<string, unknown>);
    if (!text && !anexo) return ok({ ignored: "mensagem sem texto nem mídia" });

    const result = await ingestInbound(
      admin, orgId, channel, message.sender ?? {}, text,
      conversation.id ?? message.conversationId ?? null, message.id ?? null, anexo,
      (config.api_key as string | null) ?? null,
    );
    if (!result) return ok();

    // A IA só lê texto: áudio sem transcrição e mídia sem legenda ficam para a
    // equipe, porque responder no vácuo é pior que ficar calada.
    if (result.status === "ai_active" && (!!text || !!result.transcricao)) {
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

    // Chega junto com o message.received da mesma conversa: usa o mesmo helper à
    // prova de corrida em vez de SELECT-e-INSERT.
    await obterOuCriarConversa(admin, { org_id: orgId, phone_number: identifier, channel }, async () => {
      const contactId = (await resolveContact(
        admin, orgId, channel, identifier, identifier, conv.participantName ?? null,
      ))?.id ?? null;
      // Distribuição por canal: pré-atribui um agente elegível (round-robin) ou null.
      const { data: assignedTo } = await admin.rpc("pick_agent_for_channel", {
        p_org: orgId,
        p_channel: channel,
      });
      return {
        channel, provider: "zernio",
        channel_contact_id: identifier, channel_contact_name: conv.participantName ?? null,
        contact_id: contactId, provider_conversation_id: conv.id ?? null,
        status: "ai_active", assigned_to: assignedTo ?? null,
        last_message_at: new Date().toISOString(), unread_count: 0,
      };
    });
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

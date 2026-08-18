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
  base64ParaBytes, extensaoDeAudio, resolverChaveElevenLabs, salvarAudioNoBucket,
  salvarMidiaNoBucket, transcreverAudio,
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

/**
 * Janela de agrupamento: quanto tempo esperar, depois de uma mensagem, para ver
 * se a pessoa ainda está escrevendo.
 *
 * No WhatsApp ninguém escreve um parágrafo — escreve em pedaços ("Enfrento
 * fome" / "muita fome"). Respondendo cada pedaço na hora, a IA devolvia uma
 * resposta por mensagem: duas respostas seguidas, cada uma cega para a outra,
 * conversando com metade do contexto.
 *
 * 8s é o meio-termo entre parecer atenta e atropelar quem está digitando.
 * Ajustável por AI_DEBOUNCE_MS sem redeploy.
 */
const JANELA_AGRUPAMENTO_MS = Number(Deno.env.get("AI_DEBOUNCE_MS") ?? 8000);

async function chamarAiReply(conversationId: string) {
  return fetch(`${SUPABASE_URL}/functions/v1/ai-reply`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
    },
    body: JSON.stringify({ conversation_id: conversationId }),
  }).catch(() => {});
}

/**
 * Dispara a resposta da IA depois que a rajada de mensagens termina.
 *
 * Cada mensagem recebida agenda uma resposta, espera a janela e então pergunta:
 * "ainda sou a última mensagem desta conversa?". Se não for, desiste em
 * silêncio — quem chegou depois responde por todas, e a `ai-reply` já lê o
 * histórico inteiro. Assim uma rajada de N mensagens vira UMA resposta, que
 * enxerga as N.
 *
 * O desempate por id existe porque duas mensagens podem cair no mesmo
 * milissegundo: sem ele, as duas se veriam como "a última" e a duplicidade
 * voltaria pela porta dos fundos.
 */
function triggerAI(
  admin: ReturnType<typeof createClient>,
  conversationId: string,
  mensagemId: string | null,
) {
  const fluxo = (async () => {
    if (mensagemId && JANELA_AGRUPAMENTO_MS > 0) {
      await new Promise((r) => setTimeout(r, JANELA_AGRUPAMENTO_MS));

      const { data: ultima } = await admin
        .from("conversation_messages")
        .select("id")
        .eq("conversation_id", conversationId)
        .eq("direction", "inbound")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (ultima?.id && ultima.id !== mensagemId) return;

      // A janela é tempo real de conversa: um atendente pode ter assumido nesse
      // intervalo. Responder agora seria a IA falando por cima do humano.
      const { data: conversa } = await admin
        .from("conversations")
        .select("status")
        .eq("id", conversationId)
        .maybeSingle();
      if (conversa?.status !== "ai_active") return;
    }

    await chamarAiReply(conversationId);
  })();

  // Mantém a função viva até a IA responder, sem atrasar o 200 ao provedor.
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(fluxo);
  return fluxo;
}

/**
 * Foto de perfil do contato, buscada no próprio WhatsApp.
 *
 * A URL do CDN (`pps.whatsapp.net`) vem com prazo de validade embutido, então
 * não basta gravar uma vez: `avatar_synced_at` diz quando revalidar. Uma semana
 * é o meio-termo entre foto velha e uma chamada extra a cada mensagem.
 *
 * Nada aqui pode derrubar o recebimento da mensagem — é enfeite. Por isso todo
 * o corpo é best-effort: falhou, segue sem foto e tenta de novo na próxima.
 */
const AVATAR_TTL_MS = 7 * 24 * 60 * 60 * 1000;

async function sincronizarFoto(
  admin: ReturnType<typeof createClient>,
  instance: { server_url: string; api_key: string; instance_name: string },
  contactId: string,
  phone: string,
  sincronizadoEm: string | null,
) {
  try {
    if (sincronizadoEm && Date.now() - new Date(sincronizadoEm).getTime() < AVATAR_TTL_MS) return;

    const resp = await fetch(
      `${instance.server_url}/chat/fetchProfilePictureUrl/${instance.instance_name}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: instance.api_key },
        body: JSON.stringify({ number: phone }),
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!resp.ok) return;

    const corpo = await resp.json().catch(() => null);
    const url: string | null = corpo?.profilePictureUrl ?? null;

    // Contato sem foto no WhatsApp também é resposta: grava o carimbo para não
    // perguntar de novo a cada mensagem que ele mandar.
    await admin
      .from("contacts")
      .update({ avatar_url: url, avatar_synced_at: new Date().toISOString() })
      .eq("id", contactId);
  } catch (_) {
    // silencioso de propósito: ver o comentário acima
  }
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
    .select("id, org_id, server_url, api_key, instance_name, status")
    .eq("instance_name", instanceName)
    .maybeSingle();
  if (!instance) return ok({ ignored: "instância desconhecida" });

  const normalizedEvent = event.toUpperCase().replace(/\./g, "_");

  // Conexão / QR: atualiza a instância (o wizard faz poll disso).
  if (normalizedEvent === "CONNECTION_UPDATE") {
    const state = data.state ?? data.connection;
    const telefone = data.wuid ? String(data.wuid).split("@")[0] : undefined;

    // Só `open` e `close` são desfechos. A Evolution emite `connecting` várias
    // vezes durante o handshake e também depois, em reconexões de socket — e um
    // desses, chegando atrasado, rebaixava uma instância que já estava
    // atendendo. O wizard voltava a exibir o QR de um número já pareado.
    if (state !== "open" && state !== "close") {
      // O número costuma vir junto do handshake: aproveita sem mexer no estado.
      if (telefone) {
        await admin
          .from("evolution_configs")
          .update({ phone_number: telefone, updated_at: new Date().toISOString() })
          .eq("id", instance.id);
      }
      return ok({ ignored: `estado intermediário: ${state ?? "desconhecido"}` });
    }

    const conectou = state === "open";
    await admin
      .from("evolution_configs")
      .update({
        status: conectou ? "connected" : "disconnected",
        phone_number: telefone,
        connected_at: conectou ? new Date().toISOString() : null,
        // QR de instância pareada não vale nada e ainda por cima reaparece na
        // tela se alguém reabrir o wizard.
        qr_code: conectou ? null : undefined,
        updated_at: new Date().toISOString(),
      })
      .eq("id", instance.id);
    return ok();
  }

  if (normalizedEvent === "QRCODE_UPDATED") {
    // A v2.3 manda o QR ora aninhado (`data.qrcode.base64`), ora plano
    // (`data.base64`) — o `/instance/connect` do mesmo servidor responde plano.
    // Ler só a forma aninhada gravava null e apagava o código que estava na
    // tela do usuário no meio do pareamento.
    const novoQr =
      data.qrcode?.base64 ?? data.qrcode?.code ?? data.base64 ?? data.code ?? null;

    // Evento sem QR nenhum não é motivo para apagar o que já está salvo: o
    // usuário pode estar com um código válido aberto neste exato momento.
    if (!novoQr) return ok({ ignored: "qrcode.updated sem código" });

    // Instância já pareada não volta a pedir QR. Este update gravava
    // `status: "connecting"` incondicionalmente, então um qrcode.updated
    // atrasado derrubava para "conectando" um número que estava conectado — foi
    // o que deixou o wizard preso na tela do QR com o WhatsApp já pareado.
    if (instance.status === "connected") {
      return ok({ ignored: "instância já conectada" });
    }

    await admin
      .from("evolution_configs")
      .update({ qr_code: novoQr, status: "connecting", updated_at: new Date().toISOString() })
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

  /**
   * Mídia que o cliente manda e que antes sumia.
   *
   * O webhook só aceitava texto e áudio: foto, vídeo, documento e figurinha
   * caíam no `ignored` e NADA era gravado — nem a mensagem, nem o registro de
   * que o cliente enviou algo. Um lead mandando a foto do documento ou do
   * imóvel virava silêncio no CRM.
   *
   * A legenda continua sendo o conteúdo textual; o binário vai para o mesmo
   * bucket do áudio.
   */
  const MIDIAS = [
    { no: message.imageMessage, tipo: "image", pasta: "imagem", rotulo: "📷 Foto", ext: "jpg" },
    { no: message.videoMessage, tipo: "video", pasta: "video", rotulo: "🎥 Vídeo", ext: "mp4" },
    { no: message.documentMessage, tipo: "document", pasta: "documento", rotulo: "📎 Documento", ext: "bin" },
    { no: message.stickerMessage, tipo: "image", pasta: "figurinha", rotulo: "🈁 Figurinha", ext: "webp" },
  ].find((m) => m.no);

  const textoRecebido: string =
    message.conversation ??
    message.extendedTextMessage?.text ??
    message.imageMessage?.caption ??
    "";

  // Áudio (inclui PTT — a Evolution entrega os dois em audioMessage).
  const audioMessage = message.audioMessage ?? null;
  if (!textoRecebido && !audioMessage && !MIDIAS) {
    return ok({ ignored: "mensagem sem texto nem mídia" });
  }

  // Preview da conversa antes de saber a transcrição: um áudio precisa aparecer
  // na lista mesmo que a transcrição falhe depois.
  const preview = textoRecebido
    ? textoRecebido.slice(0, 120)
    : MIDIAS
      ? MIDIAS.rotulo
      : "🎤 Áudio";

  const orgId = instance.org_id;

  // Contato: casa pelo whatsapp_phone; cria um lead se não existir.
  const { data: existingContact } = await admin
    .from("contacts")
    .select("id, avatar_synced_at")
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

  if (contactId) {
    await sincronizarFoto(
      admin,
      instance as { server_url: string; api_key: string; instance_name: string },
      contactId,
      phone,
      (existingContact?.avatar_synced_at as string | null) ?? null,
    );
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
        last_message_preview: preview,
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
        last_message_preview: preview,
        unread_count: (existingConversation?.unread_count ?? 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversationId);
  }

  if (!conversationId) return ok();

  // Áudio: baixa o binário, guarda no bucket e transcreve. A transcrição vai em
  // `content`, então o histórico que a IA lê continua sendo texto.
  //
  // Falha de download ou de transcrição NÃO descarta a mensagem: o áudio (ou ao
  // menos o registro dele) fica na conversa para a equipe ouvir/responder.
  let transcricao: string | null = null;
  // Id da mensagem recém-gravada: é ele que decide, ao fim da janela de
  // agrupamento, se esta invocação ainda é a última da rajada.
  let mensagemId: string | null = null;

  if (audioMessage) {
    const midia = await baixarMidiaEvolution(
      instance.server_url as string,
      instance.api_key as string,
      instance.instance_name as string,
      data,
    );
    let mediaPath: string | null = null;
    if (midia) {
      const mimetype = (audioMessage.mimetype as string | undefined) ?? midia.mimetype;
      mediaPath = await salvarAudioNoBucket(
        admin, orgId, conversationId, midia.bytes,
        `${Date.now()}.${extensaoDeAudio(mimetype)}`, mimetype,
      );
      transcricao = await transcreverAudio(
        midia.bytes, mimetype, await resolverChaveElevenLabs(admin, orgId),
      );
    }

    const { data: inserida } = await admin.from("conversation_messages").insert({
      conversation_id: conversationId,
      org_id: orgId,
      direction: "inbound",
      content: transcricao,
      media_url: mediaPath,
      provider_message_id: key.id ?? null,
      type: "audio",
      status: "received",
    }).select("id").single();
    mensagemId = inserida?.id ?? null;

    if (transcricao) {
      await admin
        .from("conversations")
        .update({ last_message_preview: transcricao.slice(0, 120) })
        .eq("id", conversationId);
    }
  } else if (MIDIAS) {
    const midia = await baixarMidiaEvolution(
      instance.server_url as string,
      instance.api_key as string,
      instance.instance_name as string,
      data,
    );

    let mediaPath: string | null = null;
    if (midia) {
      const mimetype = (MIDIAS.no?.mimetype as string | undefined) ?? midia.mimetype;
      // Nome do arquivo do documento importa para quem abre depois; foto e
      // vídeo não têm nome útil, então vale o timestamp.
      const nomeOriginal = MIDIAS.tipo === "document"
        ? String(MIDIAS.no?.fileName ?? "").replace(/[^\w.\-]/g, "_")
        : "";
      const nome = nomeOriginal || `${Date.now()}.${MIDIAS.ext}`;
      mediaPath = await salvarMidiaNoBucket(
        admin, orgId, conversationId, MIDIAS.pasta, midia.bytes,
        `${Date.now()}-${nome}`, mimetype,
      );
    }

    // Download falho não descarta a mensagem: fica o registro de que o cliente
    // mandou algo, que é melhor do que a conversa não mostrar nada.
    const { data: inserida } = await admin.from("conversation_messages").insert({
      conversation_id: conversationId,
      org_id: orgId,
      direction: "inbound",
      content: textoRecebido || null,
      media_url: mediaPath,
      provider_message_id: key.id ?? null,
      type: MIDIAS.tipo,
      status: "received",
    }).select("id").single();
    mensagemId = inserida?.id ?? null;
  } else {
    const { data: inserida } = await admin.from("conversation_messages").insert({
      conversation_id: conversationId,
      org_id: orgId,
      direction: "inbound",
      content: textoRecebido,
      provider_message_id: key.id ?? null,
      type: "text",
      status: "received",
    }).select("id").single();
    mensagemId = inserida?.id ?? null;
  }

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

  // IA responde só quando está no comando da conversa E tem o que ler.
  // Áudio sem transcrição e mídia sem legenda não viram resposta automática: a
  // IA não enxerga imagem nem documento, e responder no vácuo seria pior que
  // ficar calada — a mídia fica na conversa para a equipe tratar.
  const temTextoParaIA = !!textoRecebido || !!transcricao;
  if (status === "ai_active" && (audioMessage || MIDIAS ? temTextoParaIA : true)) {
    const call = triggerAI(admin, conversationId, mensagemId);
    const runtime = (globalThis as { EdgeRuntime?: unknown }).EdgeRuntime;
    if (!runtime) await call; // sem waitUntil, aguarda para não perder a resposta
  }

  return ok();
});

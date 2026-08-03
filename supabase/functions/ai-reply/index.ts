// Gera e envia a resposta da IA para uma conversa de WhatsApp.
//
// Chamada pelos webhooks (evolution-webhook / meta-webhook) após uma mensagem
// inbound, quando a conversa está com a IA ativa. Monta o contexto (personalidade,
// base de conhecimento, produtos, janela de mensagens), chama o LLM, grava a
// resposta e entrega pelo provedor.
//
// O provedor de IA é escolhido em _shared/ai.ts: Anthropic quando o secret
// ANTHROPIC_API_KEY existir, senão o AI Gateway do Lovable. O system prompt pede
// resposta direta, sem raciocínio no corpo, em qualquer um dos dois.
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { chamarIA, ErroIA, type FerramentaIA, type MensagemIA } from "../_shared/ai.ts";
import { bytesParaBase64, gerarAudioDaResposta, salvarAudioNoBucket } from "../_shared/audio.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ZERNIO_API = "https://zernio.com/api/v1";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Detecção de intenção de compra (Parte 6 do Sprint 10A), gravada pela tela de IA. */
interface PurchaseIntentRules {
  keywords?: string[];
  notify?: boolean;
  move_to_stage_id?: string | null;
  take_over?: boolean;
}

interface TriggerRules {
  keywords?: string[];
  max_ai_turns?: number;
  purchase_intent?: PurchaseIntentRules;
}

function matchesKeyword(text: string, keywords: string[] | undefined): boolean {
  const lower = text.toLowerCase();
  for (const kw of keywords ?? []) {
    if (kw && lower.includes(kw.toLowerCase())) return true;
  }
  return false;
}

/** Decide se a mensagem do cliente deve escalar para humano. */
function shouldEscalate(text: string, rules: TriggerRules, aiTurns: number, maxTurns: number): boolean {
  if (matchesKeyword(text, rules.keywords)) return true;
  if (maxTurns > 0 && aiTurns >= maxTurns) return true;
  return false;
}

/**
 * Mesma mecânica de keywords do shouldEscalate, ações diferentes: intenção de
 * compra notifica o responsável e opcionalmente move o deal, em vez de tirar a
 * IA da conversa (a não ser que take_over esteja ligado).
 */
function detectPurchaseIntent(text: string, rules: PurchaseIntentRules | undefined): boolean {
  if (!rules) return false;
  return matchesKeyword(text, rules.keywords);
}

interface WorkingDay {
  enabled?: boolean;
  start?: string;
  end?: string;
}
/** Formato novo, gravado pela tela de IA: uma entrada por dia da semana. */
type WorkingHoursPorDia = Record<string, WorkingDay>;
/** Formato legado, que é o DEFAULT da coluna no banco. */
interface WorkingHoursLegado {
  days?: number[];
  start?: string;
  end?: string;
}

/** Ordem ISO: 1 = segunda ... 7 = domingo, casando com o formato legado. */
const DIAS_ISO = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/** Uma janela HH:MM contém o horário atual? Trata janela que vira o dia. */
function dentroDaJanela(agora: string, inicio: string, fim: string): boolean {
  if (inicio <= fim) return agora >= inicio && agora <= fim;
  // Ex.: 22:00 às 02:00 é contínua, não vazia.
  return agora >= inicio || agora <= fim;
}

/**
 * A IA só responde dentro do horário de atendimento configurado.
 *
 * Fuso: usa organizations.timezone, não o do servidor. A edge function roda em
 * UTC e comparar contra ele responderia no horário errado para qualquer org
 * fora de Greenwich.
 *
 * DOIS FORMATOS convivem na coluna e ambos precisam funcionar:
 *  - por dia   {"mon": {enabled, start, end}, ...} — o que a tela de IA grava
 *  - legado    {"days": [1..5], "start", "end"}    — o DEFAULT da coluna
 * Uma org que nunca abriu a tela tem o legado. Entender só o formato novo faria
 * a IA responder 24h justamente para quem nunca configurou nada.
 *
 * Sem configuração reconhecível, atende: silenciar quem não configurou seria
 * pior que o excesso.
 */
function dentroDoHorario(workingHours: unknown, timezone: string): boolean {
  if (!workingHours || typeof workingHours !== "object") return true;

  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const diaKey = partes.find((p) => p.type === "weekday")?.value.toLowerCase() ?? "";
  const hora = partes.find((p) => p.type === "hour")?.value ?? "00";
  const minuto = partes.find((p) => p.type === "minute")?.value ?? "00";
  const agora = `${hora}:${minuto}`;

  const legado = workingHours as WorkingHoursLegado;
  if (Array.isArray(legado.days)) {
    const isoHoje = DIAS_ISO.indexOf(diaKey) + 1; // 0 vira -1+1 = 0, nunca casa
    if (!legado.days.includes(isoHoje)) return false;
    return dentroDaJanela(agora, legado.start ?? "00:00", legado.end ?? "23:59");
  }

  const porDia = workingHours as WorkingHoursPorDia;
  if (Object.keys(porDia).length === 0) return true;

  const dia = porDia[diaKey];
  // Dia ausente é tratado como não configurado, não como fechado.
  if (!dia) return true;
  if (dia.enabled === false) return false;
  return dentroDaJanela(agora, dia.start ?? "00:00", dia.end ?? "23:59");
}

/** Dados da conversa necessários para entregar a resposta em qualquer provedor. */
interface ConversaEntrega {
  org_id: string;
  provider: string;
  phone_number: string;
  channel?: string | null;
  provider_conversation_id?: string | null;
}

interface Entrega {
  providerMessageId: string | null;
  /** true quando o provedor aceitou o áudio; false = seguiu (ou caiu para) texto. */
  comoAudio: boolean;
}

/**
 * Entrega a resposta ao cliente pelo provedor da conversa.
 *
 * Com `audio`, tenta enviar como nota de voz; qualquer falha no envio de áudio
 * cai para texto no mesmo provedor — o lead nunca fica sem resposta por causa
 * de um recurso opcional.
 */
async function deliver(
  // `ReturnType<typeof createClient>` resolve os genéricos como `never` e não
  // aceita o cliente real (`SupabaseClient<any, "public", any>`), o que fazia
  // `deno check` acusar erro nas duas chamadas. Tipar pela instância evita isso.
  admin: SupabaseClient,
  conversation: ConversaEntrega,
  content: string,
  audio: Uint8Array | null = null,
): Promise<Entrega> {
  const { provider, org_id: orgId, phone_number: phone } = conversation;

  if (provider === "evolution") {
    const { data: instance } = await admin
      .from("evolution_configs")
      .select("server_url, api_key, instance_name")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!instance) return { providerMessageId: null, comoAudio: false };

    if (audio) {
      // A Evolution converte o mp3 em ogg/opus (PTT) quando `encoding` está ligado.
      const resp = await fetch(
        `${instance.server_url}/message/sendWhatsAppAudio/${instance.instance_name}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: instance.api_key as string },
          body: JSON.stringify({ number: phone, audio: bytesParaBase64(audio), encoding: true }),
        },
      );
      if (resp.ok) {
        const result = await resp.json().catch(() => ({}));
        return { providerMessageId: result?.key?.id ?? null, comoAudio: true };
      }
      console.error(`[ai-reply] Evolution recusou o áudio [${resp.status}]: ${(await resp.text()).slice(0, 300)} — enviando em texto.`);
    }

    const resp = await fetch(`${instance.server_url}/message/sendText/${instance.instance_name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: instance.api_key as string },
      body: JSON.stringify({ number: phone, text: content }),
    });
    if (!resp.ok) return { providerMessageId: null, comoAudio: false };
    const result = await resp.json().catch(() => ({}));
    return { providerMessageId: result?.key?.id ?? null, comoAudio: false };
  }

  // Zernio (multicanal). Sem este ramo, conversas do Zernio caíam no ramo da
  // Meta e falhavam silenciosamente. A API de inbox aceita texto — voz, por ora,
  // é entregue como texto neste provedor.
  if (provider === "zernio") {
    const zernioConversationId = conversation.provider_conversation_id;
    if (!zernioConversationId) {
      console.error("[ai-reply] conversa do Zernio sem provider_conversation_id — não é possível responder.");
      return { providerMessageId: null, comoAudio: false };
    }

    const { data: config } = await admin
      .from("zernio_configs")
      .select("api_key, profile_id")
      .eq("org_id", orgId)
      .maybeSingle();
    if (!config) return { providerMessageId: null, comoAudio: false };

    // accountId é obrigatório no envio: resolve a conta conectada do canal.
    const accountsUrl = new URL(`${ZERNIO_API}/accounts`);
    accountsUrl.searchParams.set("profileId", config.profile_id as string);
    accountsUrl.searchParams.set("platform", (conversation.channel as string) ?? "whatsapp");
    accountsUrl.searchParams.set("status", "connected");
    const accResp = await fetch(accountsUrl.toString(), {
      headers: { Authorization: `Bearer ${config.api_key}` },
    });
    if (!accResp.ok) {
      console.error(`[ai-reply] Zernio recusou a listagem de contas [${accResp.status}]: ${(await accResp.text()).slice(0, 200)}`);
      return { providerMessageId: null, comoAudio: false };
    }
    const accData = await accResp.json().catch(() => ({}));
    const account = (accData.accounts ?? []).find((a: { isActive?: boolean }) => a.isActive) ?? (accData.accounts ?? [])[0];
    const accountId = account?._id as string | undefined;
    if (!accountId) {
      console.error(`[ai-reply] nenhuma conta conectada no Zernio para o canal ${conversation.channel}.`);
      return { providerMessageId: null, comoAudio: false };
    }

    const sendResp = await fetch(
      `${ZERNIO_API}/inbox/conversations/${zernioConversationId}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.api_key}` },
        body: JSON.stringify({ accountId, message: content }),
      },
    );
    if (!sendResp.ok) {
      console.error(`[ai-reply] Zernio recusou o envio [${sendResp.status}]: ${(await sendResp.text()).slice(0, 200)}`);
      return { providerMessageId: null, comoAudio: false };
    }
    const result = await sendResp.json().catch(() => ({}));
    return { providerMessageId: result?.data?.messageId ?? null, comoAudio: false };
  }

  // Meta
  const { data: instance } = await admin
    .from("meta_configs")
    .select("phone_number_id, access_token")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!instance) return { providerMessageId: null, comoAudio: false };

  if (audio) {
    // A Cloud API não aceita binário inline: sobe a mídia e envia pelo id.
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", "audio/mpeg");
    form.append("file", new Blob([audio], { type: "audio/mpeg" }), "resposta.mp3");
    const upResp = await fetch(
      `https://graph.facebook.com/v21.0/${instance.phone_number_id}/media`,
      { method: "POST", headers: { Authorization: `Bearer ${instance.access_token}` }, body: form },
    );
    const upData = upResp.ok ? await upResp.json().catch(() => ({})) : null;
    const mediaId = upData?.id as string | undefined;
    if (!mediaId) {
      console.error(`[ai-reply] upload de áudio na Meta falhou [${upResp.status}] — enviando em texto.`);
    } else {
      const audioResp = await fetch(
        `https://graph.facebook.com/v21.0/${instance.phone_number_id}/messages`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${instance.access_token}`,
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: phone,
            type: "audio",
            audio: { id: mediaId },
          }),
        },
      );
      if (audioResp.ok) {
        const result = await audioResp.json().catch(() => ({}));
        return { providerMessageId: result?.messages?.[0]?.id ?? null, comoAudio: true };
      }
      console.error(`[ai-reply] Meta recusou o áudio [${audioResp.status}]: ${(await audioResp.text()).slice(0, 300)} — enviando em texto.`);
    }
  }

  const resp = await fetch(
    `https://graph.facebook.com/v21.0/${instance.phone_number_id}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${instance.access_token}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phone,
        type: "text",
        text: { body: content },
      }),
    },
  );
  if (!resp.ok) return { providerMessageId: null, comoAudio: false };
  const result = await resp.json().catch(() => ({}));
  return { providerMessageId: result?.messages?.[0]?.id ?? null, comoAudio: false };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { conversation_id } = await req.json().catch(() => ({}));
    if (!conversation_id) return json({ error: "Informe conversation_id." }, 400);

    const { data: conversation } = await admin
      .from("conversations")
      .select("id, org_id, phone_number, provider, status, assigned_to, contact_id, deal_id, channel_contact_name, channel, provider_conversation_id")
      .eq("id", conversation_id)
      .maybeSingle();
    if (!conversation) return json({ error: "Conversa não encontrada" }, 404);

    // A IA só responde quando está ativa na conversa.
    if (conversation.status !== "ai_active") return json({ skipped: "IA não está ativa nesta conversa" });

    const { data: config } = await admin
      .from("ai_messaging_config")
      .select("*")
      .eq("org_id", conversation.org_id)
      .maybeSingle();
    if (!config || !config.is_active) return json({ skipped: "IA desativada para a organização" });

    // Horário de atendimento: fora dele a IA fica em silêncio, em qualquer canal.
    // A conversa segue aberta — quem responde é a equipe no próximo expediente.
    const { data: org } = await admin
      .from("organizations")
      .select("timezone")
      .eq("id", conversation.org_id)
      .maybeSingle();
    const timezone = (org?.timezone as string) || "America/Sao_Paulo";

    if (!dentroDoHorario(config.working_hours, timezone)) {
      return json({ skipped: "fora do horário de atendimento", timezone });
    }

    // Janela de contexto: últimas N mensagens (não notas internas), em ordem.
    const windowSize = config.context_window_size ?? 20;
    const { data: history } = await admin
      .from("conversation_messages")
      .select("direction, content, is_from_ai, sent_at, is_internal_note, type")
      .eq("conversation_id", conversation_id)
      .eq("is_internal_note", false)
      .order("sent_at", { ascending: false })
      .limit(windowSize);

    const ordered = (history ?? []).slice().reverse();
    const lastInbound = ordered.filter((m) => m.direction === "inbound").at(-1);
    const aiTurns = ordered.filter((m) => m.is_from_ai).length;

    // Cooldown: se a IA acabou de responder, não responde de novo.
    //
    // Protege contra duplicação — o mesmo webhook reentregue, ou o cliente
    // mandando várias mensagens seguidas, dispararia uma resposta por evento e
    // o cliente receberia respostas repetidas em sequência.
    const cooldown = Number(config.cooldown_ms ?? 0);
    if (cooldown > 0) {
      const ultimaIA = ordered.filter((m) => m.is_from_ai).at(-1);
      if (ultimaIA?.sent_at) {
        const desde = Date.now() - new Date(ultimaIA.sent_at as string).getTime();
        if (desde < cooldown) {
          return json({ skipped: "em cooldown", aguardando_ms: cooldown - desde });
        }
      }
    }

    // Regras de escalonamento para humano.
    const rules = (config.human_trigger_rules ?? {}) as TriggerRules;
    if (
      lastInbound?.content &&
      shouldEscalate(lastInbound.content, rules, aiTurns, config.max_ai_turns_before_human ?? 0)
    ) {
      await admin
        .from("conversations")
        .update({ status: "human_takeover", updated_at: new Date().toISOString() })
        .eq("id", conversation_id);

      // Avisa o cliente que um humano vai assumir. Sem isso a conversa some do
      // lado dele: a IA para de responder e nada explica o silêncio.
      const fallback = (config.fallback_message as string | null)?.trim();
      if (fallback) {
        // Aviso de escalonamento vai sempre em texto: é uma mensagem de sistema.
        const { providerMessageId: fallbackMessageId } = await deliver(admin, conversation, fallback);
        await admin.from("conversation_messages").insert({
          conversation_id,
          org_id: conversation.org_id,
          direction: "outbound",
          content: fallback,
          is_from_ai: true,
          provider_message_id: fallbackMessageId,
          type: "text",
          status: fallbackMessageId ? "sent" : "failed",
        });
        await admin
          .from("conversations")
          .update({
            last_message_at: new Date().toISOString(),
            last_message_preview: fallback.slice(0, 120),
          })
          .eq("id", conversation_id);
      }

      return json({ escalated: true, fallback_enviado: !!fallback });
    }

    // Intenção de compra: escalonamento tem precedência (acima retorna); aqui a
    // IA segue na conversa, mas o time é avisado e o deal pode avançar de etapa.
    const intentRules = rules.purchase_intent;
    const purchaseIntent =
      !!lastInbound?.content && detectPurchaseIntent(lastInbound.content, intentRules);

    if (purchaseIntent && intentRules) {
      const quem = conversation.channel_contact_name || conversation.phone_number;

      // Notifica com janela de dedupe: o cliente repetindo "quero comprar" em
      // mensagens seguidas dispararia um aviso por webhook sem esta guarda.
      if (intentRules.notify !== false) {
        const { data: recente } = await admin
          .from("notifications")
          .select("id")
          .eq("org_id", conversation.org_id)
          .eq("type", "intencao_compra")
          .eq("entity_id", conversation.id)
          .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
          .limit(1);

        if (!recente || recente.length === 0) {
          const titulo = "Intenção de compra detectada";
          const corpo = `${quem} demonstrou intenção de compra na conversa: "${lastInbound!.content!.slice(0, 120)}"`;
          if (conversation.assigned_to) {
            await admin.rpc("create_notification", {
              p_org: conversation.org_id,
              p_user: conversation.assigned_to,
              p_event_type: "intencao_compra",
              p_title: titulo,
              p_body: corpo,
              p_entity_type: "conversation",
              p_entity_id: conversation.id,
            });
          } else {
            // Sem dono, o aviso vai para os admins — intenção de compra sem
            // ninguém sabendo é exatamente o que esta regra existe para evitar.
            await admin.rpc("notify_org_admins", {
              p_org: conversation.org_id,
              p_event_type: "intencao_compra",
              p_title: titulo,
              p_body: corpo,
              p_entity_type: "conversation",
              p_entity_id: conversation.id,
            });
          }
        }
      }

      // Move o deal aberto para a etapa configurada. Preferência: o deal já
      // vinculado à conversa; senão, o deal aberto mais recente do contato.
      if (intentRules.move_to_stage_id) {
        let dealAlvo: { id: string; stage_id: string | null } | null = null;
        if (conversation.deal_id) {
          const { data } = await admin
            .from("deals")
            .select("id, stage_id, status")
            .eq("id", conversation.deal_id)
            .eq("org_id", conversation.org_id)
            .maybeSingle();
          if (data && data.status === "open") dealAlvo = data;
        }
        if (!dealAlvo && conversation.contact_id) {
          const { data } = await admin
            .from("deals")
            .select("id, stage_id")
            .eq("org_id", conversation.org_id)
            .eq("contact_id", conversation.contact_id)
            .eq("status", "open")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          dealAlvo = data;
        }

        if (dealAlvo && dealAlvo.stage_id !== intentRules.move_to_stage_id) {
          // A etapa precisa ser da mesma org — a config pode ter ficado órfã
          // após uma reconstrução de pipeline.
          const { data: stage } = await admin
            .from("pipeline_stages")
            .select("id, win_probability")
            .eq("id", intentRules.move_to_stage_id)
            .eq("org_id", conversation.org_id)
            .maybeSingle();
          if (stage) {
            await admin
              .from("deals")
              .update({
                stage_id: stage.id,
                probability: stage.win_probability,
                updated_at: new Date().toISOString(),
              })
              .eq("id", dealAlvo.id);
          }
        }
      }

      // Assumir a conversa: tira a IA e devolve sem resposta automática. O
      // agente notificado acima é quem continua o papo.
      if (intentRules.take_over) {
        await admin
          .from("conversations")
          .update({ status: "human_takeover", updated_at: new Date().toISOString() })
          .eq("id", conversation_id);
        return json({ purchase_intent: true, taken_over: true });
      }
    }

    // Base de conhecimento. Produtos NÃO entram mais no prompt (Parte 12):
    // o modelo consulta o catálogo pela ferramenta buscar_produtos quando
    // precisa — prompt menor e catálogo de qualquer tamanho.
    const [faqs, objections, calcom] = await Promise.all([
      admin.from("ai_knowledge_faqs").select("question, answer").eq("org_id", conversation.org_id).order("order"),
      admin.from("ai_knowledge_objections").select("objection, response").eq("org_id", conversation.org_id).order("order"),
      admin.from("integration_configs").select("config, is_active").eq("org_id", conversation.org_id).eq("provider", "calcom").maybeSingle(),
    ]);

    // Link de agendamento (Parte 11): entra como conhecimento — a IA oferece
    // quando o cliente quer marcar uma reunião.
    const schedulingLink = calcom.data?.is_active
      ? ((calcom.data.config as { scheduling_link?: string } | null)?.scheduling_link ?? "").trim()
      : "";

    const knowledge = [
      config.system_prompt?.trim() || "",
      "",
      `Você é ${config.agent_name}, atendente virtual. Tom: ${config.agent_tone}. Objetivo: ${config.agent_objective}.`,
      "Responda em português do Brasil, de forma direta e útil. Não invente informações que não estejam na base abaixo.",
      "",
      (faqs.data ?? []).length ? "FAQs:\n" + (faqs.data ?? []).map((f) => `P: ${f.question}\nR: ${f.answer}`).join("\n\n") : "",
      (objections.data ?? []).length ? "\nComo contornar objeções:\n" + (objections.data ?? []).map((o) => `Objeção: ${o.objection}\nResposta: ${o.response}`).join("\n\n") : "",
      "\nQuando o cliente perguntar sobre produtos, preços ou o que vendemos, use a ferramenta buscar_produtos para consultar o catálogo antes de responder. Não invente produtos nem preços.",
      schedulingLink ? `\nPara agendar uma reunião, envie este link ao cliente: ${schedulingLink}` : "",
      "",
      "Responda apenas com a mensagem final ao cliente, sem raciocínio nem meta-comentário.",
    ]
      .filter(Boolean)
      .join("\n");

    const messages: MensagemIA[] = ordered
      .filter((m) => m.content)
      .map((m) => ({
        role: m.direction === "inbound" ? "user" as const : "assistant" as const,
        content: m.content as string,
      }));
    if (messages.length === 0 || messages[0].role !== "user") {
      // A Messages API da Anthropic exige começar com user.
      messages.unshift({ role: "user", content: lastInbound?.content ?? "Olá" });
    }

    // Ferramenta de catálogo (Parte 12): o modelo busca produtos sob demanda
    // em vez de receber o catálogo inteiro no prompt.
    const tools: FerramentaIA[] = [
      {
        name: "buscar_produtos",
        description:
          "Busca produtos do catálogo por nome, categoria ou características. Use sempre que o cliente perguntar sobre produtos, preços ou o que a empresa vende.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "O que o cliente está procurando" },
            limit: { type: "number", description: "Máximo de resultados (padrão: 5)" },
          },
          required: ["query"],
        },
      },
    ];

    const executarFerramenta = async (nome: string, args: Record<string, unknown>): Promise<string> => {
      if (nome !== "buscar_produtos") return "Ferramenta desconhecida.";
      // Vírgulas e parênteses quebrariam a sintaxe do filtro `or` do PostgREST.
      const query = String(args.query ?? "").replace(/[,()]/g, " ").trim();
      const limit = Math.min(10, Math.max(1, Number(args.limit) || 5));

      let q = admin
        .from("products")
        .select("name, description, price, currency, custom_fields")
        .eq("org_id", conversation.org_id)
        .eq("is_active", true)
        .limit(limit);
      if (query) q = q.or(`name.ilike.%${query}%,description.ilike.%${query}%`);

      const { data: encontrados, error } = await q;
      if (error) return "Não foi possível consultar o catálogo agora.";
      if (!encontrados || encontrados.length === 0) {
        return query
          ? `Nenhum produto encontrado para "${query}". Diga ao cliente que vai verificar com a equipe.`
          : "Nenhum produto ativo no catálogo.";
      }
      return JSON.stringify(
        encontrados.map((p) => ({
          nome: p.name,
          descricao: p.description ?? undefined,
          preco: new Intl.NumberFormat("pt-BR", { style: "currency", currency: (p.currency as string) ?? "BRL" }).format(Number(p.price ?? 0)),
        })),
      );
    };

    const { texto } = await chamarIA({
      tarefa: "chat",
      maxTokens: 1024,
      system: knowledge,
      messages,
      tools,
      executarFerramenta,
    });
    const reply = texto.trim();

    if (!reply) return json({ skipped: "IA não gerou resposta" });

    // Respeita o delay configurado antes de responder (parecer mais humano).
    const delay = Number(config.response_delay_ms ?? 0);
    if (delay > 0) await new Promise((r) => setTimeout(r, Math.min(delay, 8000)));

    const providerMessageId = await deliver(
      admin,
      conversation.provider,
      conversation.org_id,
      conversation.phone_number,
      reply,
    );

    await admin.from("conversation_messages").insert({
      conversation_id,
      org_id: conversation.org_id,
      direction: "outbound",
      content: reply,
      is_from_ai: true,
      provider_message_id: providerMessageId,
      type: "text",
      status: providerMessageId ? "sent" : "failed",
    });

    await admin
      .from("conversations")
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: reply.slice(0, 120),
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversation_id);

    return json({ ok: true, replied: reply, purchase_intent: purchaseIntent });
  } catch (err) {
    if (err instanceof ErroIA) return json({ error: err.publico }, err.status);
    return json({ error: err instanceof Error ? err.message : "Erro inesperado" }, 500);
  }
});

// Gera e envia a resposta da IA para uma conversa de WhatsApp.
//
// Chamada pelos webhooks (evolution-webhook / meta-webhook) após uma mensagem
// inbound, quando a conversa está com a IA ativa. Monta o contexto (personalidade,
// base de conhecimento, produtos, janela de mensagens), chama a Claude Messages
// API, grava a resposta e entrega pelo provedor.
//
// Requer o secret ANTHROPIC_API_KEY. O modelo é claude-opus-4-8 (o mais capaz);
// thinking fica desligado para manter a latência baixa num chat, e o system prompt
// pede resposta direta (sem raciocínio no corpo).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ANTHROPIC_MODEL = "claude-opus-4-8";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface TriggerRules {
  keywords?: string[];
  max_ai_turns?: number;
}

/** Decide se a mensagem do cliente deve escalar para humano. */
function shouldEscalate(text: string, rules: TriggerRules, aiTurns: number, maxTurns: number): boolean {
  const lower = text.toLowerCase();
  for (const kw of rules.keywords ?? []) {
    if (kw && lower.includes(kw.toLowerCase())) return true;
  }
  if (maxTurns > 0 && aiTurns >= maxTurns) return true;
  return false;
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

async function deliver(
  admin: ReturnType<typeof createClient>,
  provider: string,
  orgId: string,
  phone: string,
  content: string,
): Promise<string | null> {
  if (provider === "evolution") {
    const { data: instance } = await admin
      .from("evolution_configs")
      .select("server_url, api_key, instance_name")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!instance) return null;
    const resp = await fetch(`${instance.server_url}/message/sendText/${instance.instance_name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: instance.api_key as string },
      body: JSON.stringify({ number: phone, text: content }),
    });
    if (!resp.ok) return null;
    const result = await resp.json().catch(() => ({}));
    return result?.key?.id ?? null;
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
  if (!instance) return null;
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
  if (!resp.ok) return null;
  const result = await resp.json().catch(() => ({}));
  return result?.messages?.[0]?.id ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "ANTHROPIC_API_KEY não configurada" }, 500);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { conversation_id } = await req.json().catch(() => ({}));
    if (!conversation_id) return json({ error: "Informe conversation_id." }, 400);

    const { data: conversation } = await admin
      .from("conversations")
      .select("id, org_id, phone_number, provider, status")
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
      .select("direction, content, is_from_ai, sent_at, is_internal_note")
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
        const fallbackMessageId = await deliver(
          admin,
          conversation.provider,
          conversation.org_id,
          conversation.phone_number,
          fallback,
        );
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

    // Base de conhecimento.
    const [faqs, objections, products] = await Promise.all([
      admin.from("ai_knowledge_faqs").select("question, answer").eq("org_id", conversation.org_id).order("order"),
      admin.from("ai_knowledge_objections").select("objection, response").eq("org_id", conversation.org_id).order("order"),
      admin.from("products").select("name, description, price, currency").eq("org_id", conversation.org_id).eq("is_active", true),
    ]);

    const knowledge = [
      config.system_prompt?.trim() || "",
      "",
      `Você é ${config.agent_name}, atendente virtual. Tom: ${config.agent_tone}. Objetivo: ${config.agent_objective}.`,
      "Responda em português do Brasil, de forma direta e útil. Não invente informações que não estejam na base abaixo.",
      "",
      (faqs.data ?? []).length ? "FAQs:\n" + (faqs.data ?? []).map((f) => `P: ${f.question}\nR: ${f.answer}`).join("\n\n") : "",
      (objections.data ?? []).length ? "\nComo contornar objeções:\n" + (objections.data ?? []).map((o) => `Objeção: ${o.objection}\nResposta: ${o.response}`).join("\n\n") : "",
      (products.data ?? []).length ? "\nProdutos:\n" + (products.data ?? []).map((p) => `- ${p.name}${p.description ? `: ${p.description}` : ""} (${new Intl.NumberFormat("pt-BR", { style: "currency", currency: p.currency ?? "BRL" }).format(Number(p.price ?? 0))})`).join("\n") : "",
      "",
      "Responda apenas com a mensagem final ao cliente, sem raciocínio nem meta-comentário.",
    ]
      .filter(Boolean)
      .join("\n");

    const messages = ordered
      .filter((m) => m.content)
      .map((m) => ({
        role: m.direction === "inbound" ? "user" : "assistant",
        content: m.content as string,
      }));
    if (messages.length === 0 || messages[0].role !== "user") {
      // A Messages API exige começar com user.
      messages.unshift({ role: "user", content: lastInbound?.content ?? "Olá" });
    }

    const aiResp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 1024,
        system: knowledge,
        messages,
      }),
    });

    if (!aiResp.ok) {
      const err = await aiResp.text();
      return json({ error: `Claude API: ${err.slice(0, 200)}` }, 502);
    }

    const payload = await aiResp.json();
    const reply: string = (payload.content ?? [])
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("")
      .trim();

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

    return json({ ok: true, replied: reply });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Erro inesperado" }, 500);
  }
});

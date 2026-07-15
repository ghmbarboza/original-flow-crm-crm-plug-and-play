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

async function deliver(
  admin: ReturnType<typeof createClient>,
  provider: string,
  orgId: string,
  phone: string,
  content: string,
): Promise<string | null> {
  if (provider === "evolution") {
    const { data: instance } = await admin
      .from("evolution_instances")
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
    .from("meta_instances")
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
      .from("whatsapp_conversations")
      .select("id, org_id, phone_number, provider, status")
      .eq("id", conversation_id)
      .maybeSingle();
    if (!conversation) return json({ error: "Conversa não encontrada" }, 404);

    // A IA só responde quando está ativa na conversa.
    if (conversation.status !== "ai_active") return json({ skipped: "IA não está ativa nesta conversa" });

    const { data: config } = await admin
      .from("whatsapp_ai_config")
      .select("*")
      .eq("org_id", conversation.org_id)
      .maybeSingle();
    if (!config || !config.is_active) return json({ skipped: "IA desativada para a organização" });

    // Janela de contexto: últimas N mensagens (não notas internas), em ordem.
    const windowSize = config.context_window_size ?? 20;
    const { data: history } = await admin
      .from("whatsapp_messages")
      .select("direction, content, is_from_ai, sent_at, is_internal_note")
      .eq("conversation_id", conversation_id)
      .eq("is_internal_note", false)
      .order("sent_at", { ascending: false })
      .limit(windowSize);

    const ordered = (history ?? []).slice().reverse();
    const lastInbound = ordered.filter((m) => m.direction === "inbound").at(-1);
    const aiTurns = ordered.filter((m) => m.is_from_ai).length;

    // Regras de escalonamento para humano.
    const rules = (config.human_trigger_rules ?? {}) as TriggerRules;
    if (
      lastInbound?.content &&
      shouldEscalate(lastInbound.content, rules, aiTurns, config.max_ai_turns_before_human ?? 0)
    ) {
      await admin
        .from("whatsapp_conversations")
        .update({ status: "human_takeover", updated_at: new Date().toISOString() })
        .eq("id", conversation_id);
      return json({ escalated: true });
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

    await admin.from("whatsapp_messages").insert({
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
      .from("whatsapp_conversations")
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

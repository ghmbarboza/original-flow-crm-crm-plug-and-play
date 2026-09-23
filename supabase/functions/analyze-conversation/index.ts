// Análise pós-conversa (Sprint 12 B12). Chamada interna (service role) pela
// ai-reply depois de responder, na 1ª mensagem do lead e a cada N (config
// ai_messaging_config.analysis). Lê a conversa, extrai o que sabe do cliente e:
//   1. funde em contacts.client_memory (confirmado pela equipe nunca é sobrescrito);
//   2. preenche o BANT do negócio aberto só onde está vazio;
//   3. pontua o lead (regra ai_qualified) na primeira vez que o score chega a 70;
//   4. compara com os critérios escritos em cada etapa do funil e move
//      (funnel_actions.mode = auto) ou sugere (notificação sugestao_etapa).

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { chamadaInterna, naoAutorizado } from "../_shared/seguranca.ts";
import { chamarIA, extrairJson } from "../_shared/ai.ts";
import { fundirAnalise, lerMemoria, type AnaliseDaIA } from "../_shared/leadState.ts";
import { moverNegocio } from "../_shared/negocio.ts";

const MAX_MENSAGENS = 40;
const MAX_CHARS_MENSAGEM = 600;
const SCORE_QUALIFICADO = 70;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

interface ConfigAnalise { enabled: boolean; every_messages: number; min_confidence: number }

function configDe(bruta: unknown): ConfigAnalise {
  const c = (bruta ?? {}) as Partial<ConfigAnalise>;
  return {
    enabled: c.enabled !== false,
    every_messages: Math.max(1, Math.min(50, Number(c.every_messages) || 5)),
    min_confidence: Math.max(0, Math.min(100, Number(c.min_confidence) || 70)),
  };
}

async function preencherBant(admin: SupabaseClient, dealId: string, analise: AnaliseDaIA) {
  const { data: deal } = await admin.from("deals").select("qualification").eq("id", dealId).maybeSingle();
  const q = { ...((deal?.qualification as Record<string, string | null>) ?? {}) };
  const sugerido: Record<string, string | undefined> = { budget: analise.budget, authority: analise.role, need: analise.primary_pain, timeline: analise.decision_timeline };
  let mudou = false;
  for (const [k, v] of Object.entries(sugerido)) {
    const valor = typeof v === "string" ? v.trim().slice(0, 200) : "";
    if (valor && !q[k]) { q[k] = `${valor} (inferido pela IA)`; mudou = true; }
  }
  if (mudou) await admin.from("deals").update({ qualification: q }).eq("id", dealId);
  return mudou;
}

Deno.serve(async (req) => {
  if (!chamadaInterna(req)) return naoAutorizado();
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const body = await req.json().catch(() => ({}));
    const conversationId = typeof body.conversation_id === "string" ? body.conversation_id : "";
    if (!conversationId) return json({ error: "Informe conversation_id." }, 400);

    const { data: conv } = await admin.from("conversations").select("id, org_id, contact_id, deal_id, assigned_to, channel_contact_name, is_demo").eq("id", conversationId).maybeSingle();
    if (!conv?.contact_id) return json({ skipped: "conversa sem contato" });

    const { data: config } = await admin.from("ai_messaging_config").select("analysis, funnel_actions").eq("org_id", conv.org_id).maybeSingle();
    const analiseCfg = configDe(config?.analysis);
    if (!analiseCfg.enabled) return json({ skipped: "análise desligada" });

    const { data: contato } = await admin.from("contacts").select("id, first_name, last_name, client_memory, lead_score").eq("id", conv.contact_id).maybeSingle();
    if (!contato) return json({ skipped: "contato não encontrado" });
    const memoria = lerMemoria(contato.client_memory);

    const { data: mensagens } = await admin.from("conversation_messages").select("direction, content, created_at").eq("conversation_id", conv.id)
      .eq("is_internal_note", false).not("content", "is", null).order("created_at", { ascending: false }).limit(MAX_MENSAGENS);
    const historico = (mensagens ?? []).slice().reverse();
    const inbound = historico.filter((m) => m.direction === "inbound").length;
    const forcar = body.force === true;
    if (!forcar && !(inbound === 1 || (inbound > 0 && inbound % analiseCfg.every_messages === 0))) {
      return json({ skipped: `aguardando múltiplo de ${analiseCfg.every_messages}`, inbound });
    }
    if (inbound === 0) return json({ skipped: "sem mensagens do lead" });

    // Negócio: o da conversa, senão o aberto mais recente do contato.
    let dealId = conv.deal_id as string | null;
    let stageId: string | null = null;
    if (dealId) {
      const { data: d } = await admin.from("deals").select("id, stage_id, status").eq("id", dealId).maybeSingle();
      if (d?.status !== "open") dealId = null; else stageId = d.stage_id;
    }
    if (!dealId) {
      const { data: d } = await admin.from("deals").select("id, stage_id").eq("org_id", conv.org_id).eq("contact_id", conv.contact_id).eq("status", "open").order("created_at", { ascending: false }).limit(1).maybeSingle();
      dealId = d?.id ?? null;
      stageId = d?.stage_id ?? null;
    }
    const { data: etapas } = await admin.from("pipeline_stages").select("id, name, ai_trigger_criteria, pipeline_id, \"order\"").eq("org_id", conv.org_id).order("order");
    const comCriterio = (etapas ?? []).filter((e) => typeof e.ai_trigger_criteria === "string" && e.ai_trigger_criteria.trim());
    const etapaAtual = (etapas ?? []).find((e) => e.id === stageId) ?? null;

    const transcricao = historico.map((m) => `${m.direction === "inbound" ? "CLIENTE" : "ATENDENTE"}: ${String(m.content).slice(0, MAX_CHARS_MENSAGEM)}`).join("\n");
    const conhecido = Object.entries(memoria.lead_state).filter(([, c]) => c?.value && c.status !== "unknown").map(([k, c]) => `${k}=${c!.value} (${c!.status})`).join("; ") || "nada";
    const prompt = [
      "Você é um analista de vendas. Leia a conversa entre CLIENTE e ATENDENTE e extraia, em JSON, o que dá para saber do cliente. Não invente: campo sem evidência fica vazio (\"\").",
      "",
      "CONVERSA:",
      transcricao,
      "",
      `JÁ SABEMOS: ${conhecido}`,
      comCriterio.length
        ? `ETAPAS DO FUNIL COM CRITÉRIO (id: critério):\n${comCriterio.map((e) => `- ${e.id} | ${e.name}: ${e.ai_trigger_criteria}`).join("\n")}\nETAPA ATUAL: ${etapaAtual?.name ?? "sem negócio"}`
        : "",
      "",
      "Responda SOMENTE com este JSON:",
      JSON.stringify({
        company: "empresa do cliente ou \"\"", role: "cargo/papel ou \"\"", primary_pain: "dor principal ou \"\"", desired_outcome: "resultado desejado ou \"\"",
        urgency: "urgência (ex.: imediata, este mês, sem pressa) ou \"\"", budget: "orçamento citado ou \"\"", decision_timeline: "prazo de decisão ou \"\"",
        offering_interest: "produto/plano de interesse ou \"\"", next_best_action: "uma de: qualificar, demonstrar, enviar proposta, follow-up, fechar, nutrir",
        interests: ["até 5 interesses"], pains: ["até 5 dores"], objections: ["até 5 objeções"],
        score: "0 a 100 (interesse, orçamento implícito, urgência, fit)", summary: "resumo factual em até 2 frases",
        stage_suggestion: comCriterio.length ? { stage_id: "id da etapa que melhor casa com os critérios ou \"\"", confidence: "0 a 100", reason: "uma frase" } : null,
      }),
    ].filter((l) => l !== "").join("\n");

    const { texto } = await chamarIA({
      tarefa: "estruturado", maxTokens: 1200,
      system: "Você responde somente com JSON válido, sem comentários nem cercas de código. Português do Brasil.",
      messages: [{ role: "user", content: prompt }],
    });
    const parsed = extrairJson(texto);
    if (!parsed) return json({ error: "A IA não devolveu JSON." }, 502);

    const analise = parsed as AnaliseDaIA & { stage_suggestion?: { stage_id?: string; confidence?: number | string; reason?: string } | null };
    const nova = fundirAnalise(memoria, analise);
    nova.interaction_summary.inbound_messages = inbound;

    // Pontuação: a primeira vez que a IA qualifica (score >= 70).
    let pontuou = false;
    if ((nova.sales_intelligence.score ?? 0) >= SCORE_QUALIFICADO && !nova.interaction_summary.qualified_at) {
      const { data: pontos } = await admin.rpc("apply_lead_score", { p_org: conv.org_id, p_contact: conv.contact_id, p_event: "ai_qualified", p_channel: null, p_reason: `IA qualificou na conversa (score ${nova.sales_intelligence.score})` });
      nova.interaction_summary.qualified_at = new Date().toISOString();
      pontuou = Number(pontos) > 0;
    }
    await admin.from("contacts").update({ client_memory: nova }).eq("id", conv.contact_id);

    let bant = false;
    if (dealId) bant = await preencherBant(admin, dealId, analise);

    // Etapa pelos critérios: move ou sugere conforme o modo do funil.
    let etapa: { acao: "moveu" | "sugeriu" | "nenhuma"; stage?: string } = { acao: "nenhuma" };
    const sug = analise.stage_suggestion;
    const confianca = Number(sug?.confidence) || 0;
    const destino = sug?.stage_id ? comCriterio.find((e) => e.id === sug.stage_id) : null;
    if (dealId && destino && destino.id !== stageId && confianca >= analiseCfg.min_confidence) {
      const modo = ((config?.funnel_actions ?? {}) as { mode?: string; enabled?: boolean });
      const motivo = `Análise da IA (confiança ${confianca}): ${String(sug?.reason ?? "").slice(0, 200)}`;
      if (modo.enabled !== false && modo.mode !== "suggest") {
        const moveu = await moverNegocio(admin, dealId, destino.id, "ia", motivo);
        etapa = { acao: moveu ? "moveu" : "nenhuma", stage: destino.name };
      } else {
        const aviso = { p_event_type: "sugestao_etapa", p_title: `IA sugere mover para ${destino.name}`, p_body: `${conv.channel_contact_name || contato.first_name}: ${motivo}`.slice(0, 200), p_entity_type: "deal", p_entity_id: dealId };
        if (conv.assigned_to) await admin.rpc("create_notification", { p_org: conv.org_id, p_user: conv.assigned_to, ...aviso });
        else await admin.rpc("notify_org_admins", { p_org: conv.org_id, ...aviso });
        etapa = { acao: "sugeriu", stage: destino.name };
      }
    }
    return json({ ok: true, inbound, score: nova.sales_intelligence.score, pontuou, bant, etapa });
  } catch (err) {
    console.error("[analyze-conversation]", err);
    return json({ error: err instanceof Error ? err.message : "Erro inesperado" }, 500);
  }
});

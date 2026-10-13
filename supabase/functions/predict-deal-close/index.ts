// Previsão de fechamento de deal por IA (Parte 3 do Sprint 10B).
//
// Recebe { deal_id }, junta os sinais (tempo em pipeline, engajamento nas
// conversas, lead score, BANT, histórico de fechamento da org) e pede ao LLM
// um percentual com os fatores que mais pesaram. O resultado fica gravado no
// deal (ai_close_probability/_factors/_updated_at) — o kanban e os relatórios
// leem do banco, sem recalcular a cada render.
//
// Guarda de frescor: se o valor tem menos de 1h e não veio force=true, retorna
// o gravado sem chamar o LLM — o cálculo dispara ao abrir o deal, e abrir três
// vezes seguidas não pode custar três chamadas de IA.
//
// Fallback: se o LLM falhar, uma heurística determinística assume — a tela
// nunca fica sem número por instabilidade de provedor.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { chamarIA, extrairJson } from "../_shared/ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface Fator {
  factor: string;
  impact: "positivo" | "negativo";
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Quem chama é o app com o JWT do usuário: valida sessão e org.
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData } = await admin.auth.getUser(jwt);
    const userId = userData?.user?.id;
    if (!userId) return json({ error: "Não autorizado." }, 401);
    const { data: profile } = await admin.from("profiles").select("org_id").eq("id", userId).maybeSingle();
    if (!profile?.org_id) return json({ error: "Perfil sem organização." }, 403);

    const { deal_id, force } = await req.json().catch(() => ({}));
    if (!deal_id) return json({ error: "Informe deal_id." }, 400);

    const { data: deal } = await admin
      .from("deals")
      .select("*, stage:pipeline_stages(name, win_probability, \"order\"), contact:contacts(id, lead_score, first_name)")
      .eq("id", deal_id)
      .eq("org_id", profile.org_id)
      .maybeSingle();
    if (!deal) return json({ error: "Deal não encontrado." }, 404);
    if (deal.status !== "open") return json({ error: "Só deals abertos têm previsão." }, 400);

    // Frescor: menos de 1h e sem force → devolve o que está gravado.
    if (!force && deal.ai_close_probability !== null && deal.ai_close_probability_updated_at) {
      const idade = Date.now() - new Date(deal.ai_close_probability_updated_at).getTime();
      if (idade < 60 * 60 * 1000) {
        return json({
          probability: Number(deal.ai_close_probability),
          factors: deal.ai_close_factors ?? [],
          updated_at: deal.ai_close_probability_updated_at,
          cached: true,
        });
      }
    }

    // --- Sinais -----------------------------------------------------------
    const diasNoPipeline = Math.floor((Date.now() - new Date(deal.created_at).getTime()) / 86_400_000);

    // Engajamento: mensagens e último contato nas conversas do contato.
    let totalMensagens = 0;
    let diasSemContato: number | null = null;
    if (deal.contact?.id) {
      const { data: convs } = await admin
        .from("conversations")
        .select("id, last_message_at")
        .eq("org_id", profile.org_id)
        .eq("contact_id", deal.contact.id);
      const ids = (convs ?? []).map((c) => c.id);
      if (ids.length > 0) {
        const { count } = await admin
          .from("conversation_messages")
          .select("id", { count: "exact", head: true })
          .in("conversation_id", ids)
          .eq("is_internal_note", false);
        totalMensagens = count ?? 0;
        const ultima = (convs ?? [])
          .map((c) => c.last_message_at)
          .filter(Boolean)
          .sort()
          .at(-1);
        if (ultima) diasSemContato = Math.floor((Date.now() - new Date(ultima).getTime()) / 86_400_000);
      }
    }

    const qualification = (deal.qualification ?? {}) as Record<string, unknown>;
    const bantPreenchidos = ["budget", "authority", "need", "timeline"].filter(
      (k) => typeof qualification[k] === "string" && (qualification[k] as string).trim(),
    ).length;

    // Histórico da org: taxa de ganho entre deals fechados na mesma faixa de valor.
    const valor = Number(deal.value ?? 0);
    const { data: fechados } = await admin
      .from("deals")
      .select("status, value")
      .eq("org_id", profile.org_id)
      .in("status", ["won", "lost"])
      .limit(500);
    const similares = (fechados ?? []).filter((d) => {
      const v = Number(d.value ?? 0);
      return valor === 0 || (v >= valor * 0.3 && v <= valor * 3);
    });
    const ganhos = similares.filter((d) => d.status === "won").length;
    const taxaHistorica = similares.length >= 5 ? Math.round((ganhos / similares.length) * 100) : null;

    const sinais = {
      etapa: deal.stage?.name ?? "sem etapa",
      probabilidade_da_etapa: deal.stage?.win_probability ?? null,
      valor,
      dias_no_pipeline: diasNoPipeline,
      mensagens_trocadas: totalMensagens,
      dias_sem_contato: diasSemContato,
      lead_score: deal.contact?.lead_score ?? null,
      campos_bant_preenchidos: bantPreenchidos,
      taxa_historica_fechamento_similar: taxaHistorica,
    };

    // --- IA com fallback heurístico --------------------------------------
    let probability: number | null = null;
    let factors: Fator[] = [];

    try {
      const { texto } = await chamarIA({
        organizacao: { admin, orgId: profile.org_id },
        tarefa: "estruturado",
        maxTokens: 400,
        system:
          "Você avalia a probabilidade de fechamento de negócios num CRM B2B brasileiro. " +
          "Responda APENAS JSON válido no formato " +
          '{"probability": <0-100>, "factors": [{"factor": "<frase curta>", "impact": "positivo"|"negativo"}]} ' +
          "com no máximo 4 fatores, os mais decisivos primeiro.",
        messages: [{ role: "user", content: `Sinais do negócio:\n${JSON.stringify(sinais, null, 2)}` }],
      });
      const parsed = extrairJson(texto);
      const p = Number(parsed?.probability);
      if (!Number.isNaN(p)) {
        probability = clamp(Math.round(p), 0, 99);
        factors = Array.isArray(parsed?.factors)
          ? (parsed!.factors as Fator[]).slice(0, 4).filter((f) => f?.factor)
          : [];
      }
    } catch {
      // LLM indisponível: heurística assume abaixo.
    }

    if (probability === null) {
      let p = Number(deal.stage?.win_probability ?? 30);
      factors = [];
      if (taxaHistorica !== null) {
        p = (p + taxaHistorica) / 2;
        factors.push({ factor: `Histórico de deals similares fecha em ${taxaHistorica}%`, impact: taxaHistorica >= 50 ? "positivo" : "negativo" });
      }
      if (bantPreenchidos >= 3) {
        p += 8;
        factors.push({ factor: "Qualificação BANT quase completa", impact: "positivo" });
      } else if (bantPreenchidos <= 1) {
        p -= 8;
        factors.push({ factor: "Qualificação BANT incompleta", impact: "negativo" });
      }
      if (diasSemContato !== null && diasSemContato > 7) {
        p -= 12;
        factors.push({ factor: `${diasSemContato} dias sem contato`, impact: "negativo" });
      } else if (totalMensagens >= 10) {
        p += 6;
        factors.push({ factor: "Engajamento alto nas conversas", impact: "positivo" });
      }
      if (diasNoPipeline > 60) {
        p -= 8;
        factors.push({ factor: `${diasNoPipeline} dias no pipeline`, impact: "negativo" });
      }
      probability = clamp(Math.round(p), 1, 95);
    }

    const updatedAt = new Date().toISOString();
    await admin
      .from("deals")
      .update({
        ai_close_probability: probability,
        ai_close_factors: factors,
        ai_close_probability_updated_at: updatedAt,
      })
      .eq("id", deal.id);

    return json({ probability, factors, updated_at: updatedAt, cached: false });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Erro inesperado" }, 500);
  }
});

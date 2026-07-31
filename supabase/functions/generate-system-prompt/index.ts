// Gera o system prompt da IA a partir do contexto da organização.
//
// Usada na etapa 3 do wizard de setup e pelo botão "Regenerar prompt" em
// Configurações > IA. Devolve o prompt em blocos XML, mais FAQs e objeções
// específicas do setor — tudo numa chamada só, porque três chamadas separadas
// triplicariam a espera bem no meio do onboarding.
//
// NÃO PERSISTE NADA. O usuário revisa e edita antes de salvar; gravar aqui
// tiraria dele essa chance e deixaria estado meio-salvo se ele desistir.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { NINA_REFERENCE } from "./nina-reference.ts";
import { chamarIA, ErroIA, extrairJson } from "../_shared/ai.ts";

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

const TOM_LABEL: Record<string, string> = {
  profissional: "profissional",
  consultivo: "consultivo",
  amigavel: "amigável",
  tecnico: "técnico",
  descontraido: "descontraído",
};

const SETOR_LABEL: Record<string, string> = {
  imobiliario: "imobiliário",
  saude: "saúde",
  educacao: "educação",
  varejo: "varejo",
  servicos: "serviços",
  tecnologia: "tecnologia",
  juridico: "jurídico",
  financeiro: "financeiro",
  alimentacao: "alimentação",
  beleza: "beleza",
  outro: "outro",
};

interface OrgContexto {
  name: string;
  business_sector: string | null;
  business_description: string | null;
  target_audience: string | null;
  main_problem_solved: string | null;
  brand_tone: string | null;
  ai_prohibitions: string | null;
  good_response_example: string | null;
}

/**
 * Setor legível para o prompt. "outro:<descrição>" (setor customizado do
 * onboarding) usa a descrição do usuário — "pet shop" gera conhecimento de pet
 * shop, não o genérico de "outro".
 */
function setorLegivel(sector: string | null): string {
  if (!sector) return "outro";
  if (sector.startsWith("outro:")) {
    const descricao = sector.slice("outro:".length).trim();
    if (descricao) return descricao;
  }
  return SETOR_LABEL[sector] ?? "outro";
}

/** Monta o prompt do gerador. A Nina entra como exemplo de formato, não de conteúdo. */
function promptDoGerador(org: OrgContexto, agentName: string): string {
  const setor = setorLegivel(org.business_sector);
  const tom = TOM_LABEL[org.brand_tone ?? "profissional"] ?? "profissional";

  return `Você é especialista em configurar assistentes de IA para vendas e atendimento.
Com base no contexto abaixo, gere um system prompt estruturado em XML para uma IA
que vai atender clientes desta empresa via WhatsApp.

CONTEXTO DA EMPRESA
- Nome: ${org.name}
- Setor: ${setor}
- O que vende: ${org.business_description || "não informado"}
- Para quem: ${org.target_audience || "não informado"}
- Problema que resolve: ${org.main_problem_solved || "não informado"}
- Tom de comunicação: ${tom}
- Nome do agente: ${agentName}
- Proibições definidas pela empresa: ${org.ai_prohibitions || "nenhuma especificada"}
- Exemplo de boa resposta fornecido: ${org.good_response_example || "nenhum fornecido"}

ESTRUTURA OBRIGATÓRIA — use exatamente estes blocos XML, nesta ordem:
<role> persona, nome do agente, especialidade, forma de atender </role>
<company> nome, tagline, missão </company>
<core_philosophy> 5 a 7 princípios numerados, específicos do setor ${setor} </core_philosophy>
<sector_context> conhecimento concreto do setor ${setor}: vocabulário, tipos de produto/serviço, etapas típicas de negociação, particularidades do mercado brasileiro </sector_context>
<guidelines> formatação, tom, emojis, proibições e fluxo de conversa em 5 etapas </guidelines>
<cognitive_process> processo mental por mensagem, em 5 passos </cognitive_process>
<output_format> como responder </output_format>
<examples> 2 bons exemplos e 1 mau exemplo marcado com ❌ </examples>

REGRAS
- Use o tom ${tom} em todo o prompt.
- Os princípios e o contexto de setor devem ser ESPECÍFICOS de ${setor}. Nada genérico.
- As proibições da empresa entram em <guidelines>, numa seção "Proibições".
- Se houver exemplo de boa resposta, use-o em <examples>.
- Escreva em português brasileiro. Nunca use jargão técnico de IA dentro do prompt.
- Não invente fatos sobre a empresa além do contexto informado.

EXEMPLO DE FORMATO (setor imobiliário — copie a ESTRUTURA, nunca o conteúdo):
${NINA_REFERENCE}

Além do prompt, gere para o setor ${setor}:
- 4 perguntas frequentes com resposta, no tom ${tom}
- 3 objeções comuns com a resposta para contorná-las

Responda SOMENTE com um JSON válido, sem cercas de código, neste formato:
{"system_prompt":"<system_instruction>...</system_instruction>","faqs":[{"question":"","answer":""}],"objections":[{"objection":"","response":""}]}`;
}

const BLOCOS_OBRIGATORIOS = [
  "role", "company", "core_philosophy", "sector_context",
  "guidelines", "cognitive_process", "output_format", "examples",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Ação de admin: exige sessão. A org vem do profile, nunca do corpo da
    // requisição — aceitar org_id do cliente deixaria gerar prompt para outra org.
    const authHeader = req.headers.get("Authorization");
    const { data: userData } = authHeader
      ? await admin.auth.getUser(authHeader.replace("Bearer ", ""))
      : { data: { user: null } };
    const user = userData?.user;
    if (!user) return json({ error: "Não autorizado" }, 401);

    const { data: profile } = await admin
      .from("profiles").select("org_id").eq("id", user.id).maybeSingle();
    const orgId = profile?.org_id as string | undefined;
    if (!orgId) return json({ error: "Usuário sem organização" }, 403);

    const { data: org } = await admin
      .from("organizations")
      .select("name, business_sector, business_description, target_audience, main_problem_solved, brand_tone, ai_prohibitions, good_response_example")
      .eq("id", orgId)
      .maybeSingle();
    if (!org) return json({ error: "Organização não encontrada" }, 404);

    // Sem contexto o resultado seria um prompt genérico com cara de personalizado
    // — pior que não gerar, porque o usuário confiaria nele.
    if (!org.business_description?.trim() && !org.business_sector) {
      return json({
        error: "Contexto insuficiente. Preencha setor e o que a empresa vende antes de gerar.",
      }, 400);
    }

    const { agent_name } = await req.json().catch(() => ({}));
    const agentName = String(agent_name ?? "").trim() || "Assistente";

    const { texto } = await chamarIA({
      tarefa: "estruturado",
      maxTokens: 8000,
      messages: [{ role: "user", content: promptDoGerador(org as OrgContexto, agentName) }],
    });

    const parsed = extrairJson(texto);
    if (!parsed || typeof parsed.system_prompt !== "string") {
      return json({ error: "A IA não devolveu um prompt no formato esperado. Tente novamente." }, 502);
    }

    const systemPrompt = parsed.system_prompt as string;

    // Valida a estrutura antes de devolver: prompt sem os blocos não serve, e
    // deixar passar aqui esconderia o defeito até a IA responder mal em produção.
    const faltando = BLOCOS_OBRIGATORIOS.filter((b) => !systemPrompt.includes(`<${b}>`));
    if (faltando.length > 0) {
      return json({
        error: `O prompt gerado veio sem os blocos: ${faltando.join(", ")}. Tente novamente.`,
        blocos_faltando: faltando,
      }, 502);
    }

    const faqs = Array.isArray(parsed.faqs)
      ? (parsed.faqs as { question?: string; answer?: string }[])
        .filter((f) => f?.question && f?.answer)
        .map((f) => ({ question: String(f.question), answer: String(f.answer) }))
      : [];
    const objections = Array.isArray(parsed.objections)
      ? (parsed.objections as { objection?: string; response?: string }[])
        .filter((o) => o?.objection && o?.response)
        .map((o) => ({ objection: String(o.objection), response: String(o.response) }))
      : [];

    return json({ ok: true, system_prompt: systemPrompt, faqs, objections });
  } catch (err) {
    // ErroIA já traz status e um texto pensado para o usuário final (sem
    // créditos, rate limit, credencial recusada). Achatar tudo em 500 faria a
    // tela dizer "erro inesperado" para causas que têm ação clara.
    if (err instanceof ErroIA) return json({ error: err.publico }, err.status);
    return json({ error: err instanceof Error ? err.message : "Erro inesperado" }, 500);
  }
});

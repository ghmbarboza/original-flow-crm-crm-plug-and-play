// Kit inicial do wizard (Sprint 12 B7): automações, follow-up, sequências,
// modelos de e-mail, templates de WhatsApp (formato da Meta) e respostas
// rápidas gerados pela IA a partir do perfil da empresa. Devolve o kit
// normalizado; quem grava é o front, item a item, depois da revisão do usuário.
//
// Chamada pelo front com a sessão do usuário; a org vem do perfil.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { chamarIA, ErroIA, extrairJson } from "../_shared/ai.ts";
import { kitVazio, normalizarKit } from "../_shared/starterKit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const SETOR_LABEL: Record<string, string> = {
  imobiliario: "imobiliário", saude: "saúde", educacao: "educação", varejo: "varejo", servicos: "serviços",
  tecnologia: "tecnologia", juridico: "jurídico", financeiro: "financeiro", alimentacao: "alimentação", beleza: "beleza e estética",
};

function setorLegivel(sector: string | null): string {
  if (!sector) return "outro";
  if (sector.startsWith("outro:")) return sector.slice("outro:".length).trim() || "outro";
  return SETOR_LABEL[sector] ?? sector;
}

interface Contexto {
  name: string;
  business_sector: string | null;
  business_description: string | null;
  target_audience: string | null;
  main_problem_solved: string | null;
  brand_tone: string | null;
  business_model: string | null;
  sells: string | null;
}

function prompt(org: Contexto, agente: string, produtos: string[], etapas: string[]): string {
  return `Você configura CRMs para pequenas e médias empresas brasileiras. Gere um kit inicial de automações e mensagens para a empresa abaixo. Tudo em português do Brasil, no tom "${org.brand_tone ?? "profissional"}", específico do negócio, sem placeholders entre colchetes: use as variáveis {{contact.first_name}}, {{company.name}} e {{user.first_name}} quando precisar de dados do contato.

EMPRESA
- Nome: ${org.name}
- Setor: ${setorLegivel(org.business_sector)}
- O que vende: ${org.business_description || "não informado"} (${org.sells === "services" ? "serviços" : org.sells === "products" ? "produtos" : "produtos e serviços"})
- Para quem: ${org.target_audience || "não informado"} (modelo ${org.business_model ?? "misto"})
- Problema que resolve: ${org.main_problem_solved || "não informado"}
- Itens do catálogo: ${produtos.length ? produtos.join(", ") : "nenhum cadastrado"}
- Etapas do funil: ${etapas.length ? etapas.join(" > ") : "padrão"}
- Nome da agente de IA: ${agente}

GERE, neste JSON exato e sem cercas de código:
{
 "automations": [ 3 itens. Tipos de gatilho permitidos: contact_created, form_submitted, deal_stage_changed, tag_added, message_received. Tipos de ação: ai_outreach (params.instruction = instrução para a IA abordar pelo WhatsApp), create_activity (params.title), notify_agent (params.message). Cada item: {"name","description","trigger":{"type"},"conditions":[{"field":"source","op":"eq","value":"capture_form"}] ou [],"actions":[{"type","params":{}}]}. Inclua: boas-vindas ao lead do formulário com ai_outreach; tarefa de contato após 1 dia sem resposta; aviso ao responsável quando o negócio entra na etapa de proposta (use deal_stage_changed com conditions vazio e a etapa no texto). ],
 "followup": { "max_attempts": 3, "on_limit_reached": "notify_agent", "steps": [ 3 passos {"delay_hours","message"} para retomar quem parou de responder no WhatsApp, cada um diferente e curto ] },
 "sequences": [ 1 sequência de e-mail de nutrição {"name","steps":[3 passos {"delay_days","subject","body_html"}]} com HTML simples (<p>) ],
 "email_templates": [ 3 modelos {"name","subject","body_html"}: apresentação, envio de proposta, pós-venda ],
 "whatsapp_templates": [ 4 templates no formato da Meta {"name" em snake_case,"category":"UTILITY" ou "MARKETING","language":"pt_BR","body_text" com variáveis numeradas {{1}} {{2}},"example_params":[um exemplo por variável]}: primeiro contato do formulário, retomada após silêncio, lembrete de reunião, proposta enviada. Sem link encurtado, sem emoji no início, sem terminar com variável ],
 "quick_replies": [ 5 respostas rápidas {"shortcut","title","content"} para a equipe usar no inbox ]
}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const authHeader = req.headers.get("Authorization");
    const { data: userData } = authHeader ? await admin.auth.getUser(authHeader.replace("Bearer ", "")) : { data: { user: null } };
    const user = userData?.user;
    if (!user) return json({ error: "Não autorizado" }, 401);
    const { data: perfil } = await admin.from("profiles").select("org_id").eq("id", user.id).maybeSingle();
    const orgId = perfil?.org_id as string | undefined;
    if (!orgId) return json({ error: "Usuário sem organização" }, 403);

    const [{ data: org }, { data: config }, { data: produtos }, { data: etapas }] = await Promise.all([
      admin.from("organizations").select("name, business_sector, business_description, target_audience, main_problem_solved, brand_tone, business_model, sells").eq("id", orgId).maybeSingle(),
      admin.from("ai_messaging_config").select("agent_name").eq("org_id", orgId).maybeSingle(),
      admin.from("products").select("name").eq("org_id", orgId).eq("is_active", true).order("created_at").limit(12),
      admin.from("pipeline_stages").select("name").eq("org_id", orgId).order("order").limit(12),
    ]);
    if (!org) return json({ error: "Organização não encontrada" }, 404);

    const texto = prompt(org as Contexto, (config?.agent_name as string) || "Assistente", (produtos ?? []).map((p) => p.name as string), (etapas ?? []).map((e) => e.name as string));
    let kit = null;
    let ultimoErro = "A IA não devolveu um kit válido.";
    for (let tentativa = 0; tentativa < 2 && !kit; tentativa++) {
      const { texto: resposta } = await chamarIA({
        tarefa: "estruturado",
        maxTokens: 6000,
        system: "Você responde somente com JSON válido, sem comentários nem cercas de código.",
        messages: [{ role: "user", content: texto }],
      });
      const parsed = extrairJson(resposta);
      if (!parsed) { ultimoErro = "A IA respondeu fora do formato."; continue; }
      const candidato = normalizarKit(parsed);
      if (kitVazio(candidato)) { ultimoErro = "A IA devolveu um kit vazio."; continue; }
      kit = candidato;
    }
    if (!kit) return json({ error: ultimoErro }, 502);
    return json({ ok: true, kit });
  } catch (err) {
    if (err instanceof ErroIA) return json({ error: err.publico }, err.status);
    return json({ error: err instanceof Error ? err.message : "Erro inesperado" }, 500);
  }
});

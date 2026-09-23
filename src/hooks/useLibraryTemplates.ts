import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrgId } from "@/hooks/useOrgId";
import { BRAND_TONES, BUSINESS_SECTORS } from "@/hooks/useSetup";
import type { Database } from "@/integrations/supabase/types";

export type LibraryTemplate = Database["public"]["Tables"]["library_templates"]["Row"];
export type LibraryCategory = LibraryTemplate["category"];

/**
 * Biblioteca de Modelos: catálogo global de templates de mercado que o usuário
 * ativa com um clique, gerando uma cópia editável para a organização dele.
 *
 * "Ativar, não copiar": o modelo original nunca é alterado. Toda cópia carrega
 * `from_template_id`, o que permite saber depois se um registro nasceu de modelo
 * ou foi escrito do zero.
 */

/** Categorias na ordem em que aparecem nos filtros da página. */
export const LIBRARY_CATEGORIES = [
  { value: "email_sequence", label: "Sequências de Email", icon: "📧" },
  { value: "email_template", label: "Templates", icon: "✉️" },
  { value: "followup", label: "WhatsApp", icon: "💬" },
  { value: "automation", label: "Automações", icon: "⚡" },
  { value: "ai_faq", label: "IA — FAQs", icon: "🤖" },
  { value: "ai_objection", label: "IA — Objeções", icon: "🛡️" },
] as const;

/** Rótulos dos objetivos, usados no cabeçalho do card e do modal. */
export const LIBRARY_SUBCATEGORIES: Record<string, string> = {
  prospeccao: "Prospecção",
  nutricao: "Nutrição",
  retencao: "Retenção",
  reengajamento: "Reengajamento",
  pos_venda: "Pós-venda",
  boas_vindas: "Boas-vindas",
  geral: "Geral",
};

export function rotuloCategoria(c: string): string {
  return LIBRARY_CATEGORIES.find((x) => x.value === c)?.label ?? c;
}

export function rotuloSubcategoria(s: string): string {
  return LIBRARY_SUBCATEGORIES[s] ?? s;
}

// --- Contexto da organização nas variáveis dos modelos ----------------------
// Os modelos da biblioteca usam {{company}}, {{sector}}, {{product}} e
// {{tone}}. Ao visualizar e ao ativar, essas variáveis são preenchidas com o
// contexto real da org — o usuário vê o modelo já com os dados da empresa.

export interface OrgTemplateContext {
  company: string;
  sector: string;
  product: string;
  tone: string;
  audience: string;
  problem: string;
}

/**
 * Os modelos do seed também usam marcadores entre colchetes ([empresa],
 * [produto/serviço], [problema]...). Cada um vira a chave de contexto
 * correspondente; o que não tem valor fica visível para o usuário preencher.
 */
const MARCADORES: Record<string, keyof OrgTemplateContext> = {
  "[empresa]": "company",
  "[Empresa]": "company",
  "[setor]": "sector",
  "[produto/serviço]": "product",
  "[solução]": "product",
  "[problema]": "problem",
  "[público]": "audience",
};

/** Setor legível: rótulo do catálogo, ou o texto livre de "outro:<descrição>". */
export function rotuloSetor(sector: string | null | undefined): string {
  if (!sector) return "";
  if (sector.startsWith("outro:")) return sector.slice("outro:".length).trim();
  return BUSINESS_SECTORS.find((s) => s.value === sector)?.label ?? sector;
}

function rotuloTom(tone: string | null | undefined): string {
  if (!tone) return "";
  return BRAND_TONES.find((t) => t.value === tone)?.label.toLowerCase() ?? tone;
}

/**
 * Substitui as variáveis conhecidas pelo contexto. Variável sem valor na org
 * (ex.: {{product}} sem produto cadastrado) fica intacta — visível para o
 * usuário preencher, em vez de sumir silenciosamente.
 */
export function aplicarContexto(texto: string, ctx: Partial<OrgTemplateContext>): string {
  let out = texto;
  for (const chave of ["company", "sector", "product", "tone", "audience", "problem"] as const) {
    const valor = ctx[chave];
    if (valor) out = out.replace(new RegExp(`\\{\\{\\s*${chave}\\s*\\}\\}`, "gi"), valor);
  }
  for (const [marcador, chave] of Object.entries(MARCADORES)) {
    const valor = ctx[chave];
    if (valor) out = out.split(marcador).join(valor);
  }
  return out;
}

async function contextoDaOrg(orgId: string): Promise<Partial<OrgTemplateContext>> {
  const [{ data: org }, { data: produto }] = await Promise.all([
    supabase
      .from("organizations")
      .select("name, business_sector, brand_tone, target_audience, main_problem_solved")
      .eq("id", orgId)
      .maybeSingle(),
    supabase
      .from("products")
      .select("name")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .order("created_at")
      .limit(1)
      .maybeSingle(),
  ]);
  return {
    company: org?.name ?? "",
    sector: rotuloSetor(org?.business_sector),
    product: produto?.name ?? "",
    tone: rotuloTom(org?.brand_tone),
    audience: org?.target_audience ?? "",
    problem: org?.main_problem_solved ?? "",
  };
}

/** Contexto da org para o preview dos modelos. */
export function useOrgTemplateContext() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: ["org-template-context", orgId],
    enabled: !!orgId,
    queryFn: () => contextoDaOrg(orgId!),
  });
}

// --- Formas de `content` por categoria -------------------------------------
// O JSONB da tabela varia por categoria. Estes tipos descrevem o que o seed
// grava; `lerConteudo` valida antes de qualquer escrita, para uma linha
// malformada da biblioteca não virar registro quebrado na org do usuário.

export interface PassoSequencia {
  order: number;
  delay_days: number;
  subject: string;
  body: string;
}
export interface PassoFollowup {
  order: number;
  delay_hours: number;
  message: string;
}
export interface FaqModelo { question: string; answer: string }
export interface ObjecaoModelo { objection: string; response: string }

export interface ConteudoSequencia { steps: PassoSequencia[] }
export interface ConteudoTemplate { subject: string; body: string }
export interface ConteudoFollowup {
  steps: PassoFollowup[];
  max_attempts?: number;
  on_limit_reached?: string;
}
export interface ConteudoAutomacao {
  trigger: unknown;
  conditions?: unknown;
  actions: unknown;
}
export interface ConteudoFaqs { faqs: FaqModelo[] }
export interface ConteudoObjecoes { objections: ObjecaoModelo[] }

/**
 * Lê o `content` do modelo com validação mínima por categoria.
 *
 * Lança com o título do modelo no texto: se a biblioteca vier malformada, quem
 * lê o erro precisa saber qual modelo olhar.
 */
export function lerConteudo(t: Pick<LibraryTemplate, "category" | "content" | "title">) {
  const c = (t.content ?? {}) as Record<string, unknown>;
  const falha = (o: string) => new Error(`Modelo "${t.title}" está incompleto: ${o}.`);

  switch (t.category) {
    case "email_sequence": {
      const steps = c.steps as PassoSequencia[] | undefined;
      if (!Array.isArray(steps) || !steps.length) throw falha("nenhuma etapa de email");
      return { tipo: "email_sequence" as const, steps };
    }
    case "email_template": {
      if (typeof c.subject !== "string" || typeof c.body !== "string") throw falha("assunto ou corpo ausente");
      return { tipo: "email_template" as const, subject: c.subject, body: c.body };
    }
    case "followup": {
      const steps = c.steps as PassoFollowup[] | undefined;
      if (!Array.isArray(steps) || !steps.length) throw falha("nenhuma tentativa de follow-up");
      return {
        tipo: "followup" as const,
        steps,
        max_attempts: typeof c.max_attempts === "number" ? c.max_attempts : steps.length,
        on_limit_reached: typeof c.on_limit_reached === "string" ? c.on_limit_reached : "notify_agent",
      };
    }
    case "automation": {
      if (!c.trigger || !c.actions) throw falha("gatilho ou ações ausentes");
      return { tipo: "automation" as const, trigger: c.trigger, conditions: c.conditions ?? {}, actions: c.actions };
    }
    case "ai_faq": {
      const faqs = c.faqs as FaqModelo[] | undefined;
      if (!Array.isArray(faqs) || !faqs.length) throw falha("nenhuma pergunta");
      return { tipo: "ai_faq" as const, faqs };
    }
    case "ai_objection": {
      const objections = c.objections as ObjecaoModelo[] | undefined;
      if (!Array.isArray(objections) || !objections.length) throw falha("nenhuma objeção");
      return { tipo: "ai_objection" as const, objections };
    }
    default:
      throw new Error(`Categoria de modelo desconhecida: ${t.category}`);
  }
}

/** Para onde levar o usuário depois de ativar, por categoria. */
export const DESTINO_POR_CATEGORIA: Record<LibraryCategory, string> = {
  email_sequence: "/email-sequences",
  email_template: "/email-templates",
  followup: "/settings",
  automation: "/automations",
  ai_faq: "/settings",
  ai_objection: "/settings",
};

// --- Listagem --------------------------------------------------------------

export function useLibraryTemplates(category?: string) {
  return useQuery({
    queryKey: ["library-templates", category ?? "todos"],
    queryFn: async (): Promise<LibraryTemplate[]> => {
      let query = supabase
        .from("library_templates")
        .select("*")
        .eq("is_active", true)
        .order("category")
        .order("sort_order");

      if (category) query = query.eq("category", category);

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });
}

// --- Ativação --------------------------------------------------------------

/**
 * Cria a cópia do modelo para a organização.
 *
 * DESVIOS DO RASCUNHO DA SPEC, resolvidos pelo schema real:
 *
 * 1. Sequência de email. O `content.steps[]` traz `subject` e `body` inline, mas
 *    `email_sequence_steps` não guarda texto — ele referencia `template_id`. Cada
 *    etapa gera então um `email_templates` nomeado "<sequência> — etapa N", e o
 *    passo aponta para ele. É o mesmo formato que o editor de sequências já
 *    espera, então a sequência ativada é editável pelos caminhos normais.
 *
 * 2. Follow-up. `followup_configs` é único por org (upsert por `org_id` no
 *    useFollowup), então não há "criar novo": a config é atualizada e os passos
 *    antigos são substituídos. Isso é destrutivo por natureza — a tela avisa
 *    antes de confirmar.
 *
 * 3. FAQs e objeções entram como lote, respeitando `order` sequencial a partir do
 *    que já existe, para não colidir com o que o usuário já cadastrou.
 */
async function ativarPorCategoria(
  t: LibraryTemplate,
  orgId: string,
  ctx: Partial<OrgTemplateContext>,
): Promise<void> {
  const conteudo = lerConteudo(t);
  // As variáveis do modelo entram já preenchidas com o contexto da org — a
  // cópia nasce personalizada, não genérica.
  const cx = (texto: string) => aplicarContexto(texto, ctx);

  switch (conteudo.tipo) {
    case "email_sequence": {
      const { data: seq, error: errSeq } = await supabase
        .from("email_sequences")
        .insert({ org_id: orgId, name: t.title, is_active: false, from_template_id: t.id })
        .select("id")
        .single();
      if (errSeq) throw errSeq;

      const passos = [...conteudo.steps].sort((a, b) => a.order - b.order);
      for (const [i, passo] of passos.entries()) {
        const { data: tpl, error: errTpl } = await supabase
          .from("email_templates")
          .insert({
            org_id: orgId,
            name: `${t.title} — etapa ${i + 1}`,
            subject: cx(passo.subject),
            body_html: cx(passo.body),
            from_template_id: t.id,
          })
          .select("id")
          .single();
        if (errTpl) throw errTpl;

        const { error: errPasso } = await supabase.from("email_sequence_steps").insert({
          org_id: orgId,
          sequence_id: seq.id,
          template_id: tpl.id,
          delay_days: passo.delay_days,
          order: i,
        });
        if (errPasso) throw errPasso;
      }
      return;
    }

    case "email_template": {
      const { error } = await supabase.from("email_templates").insert({
        org_id: orgId,
        name: t.title,
        subject: cx(conteudo.subject),
        body_html: cx(conteudo.body),
        from_template_id: t.id,
      });
      if (error) throw error;
      return;
    }

    case "followup": {
      const { error: errCfg } = await supabase.from("followup_configs").upsert(
        {
          org_id: orgId,
          is_active: false,
          max_attempts: conteudo.max_attempts,
          on_limit_reached: conteudo.on_limit_reached,
          from_template_id: t.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "org_id" },
      );
      if (errCfg) throw errCfg;

      // Substitui os passos: a sequência de tentativas do modelo só faz sentido
      // inteira. Manter os antigos misturaria dois roteiros de cadência.
      const { error: errDel } = await supabase.from("followup_steps").delete().eq("org_id", orgId);
      if (errDel) throw errDel;

      const passos = [...conteudo.steps].sort((a, b) => a.order - b.order);
      const { error: errIns } = await supabase.from("followup_steps").insert(
        passos.map((p, i) => ({
          org_id: orgId,
          order: i,
          delay_hours: p.delay_hours,
          message_template: cx(p.message),
        })),
      );
      if (errIns) throw errIns;
      return;
    }

    case "automation": {
      const { error } = await supabase.from("automations").insert({
        org_id: orgId,
        name: t.title,
        description: t.description,
        is_active: false,
        trigger: conteudo.trigger as never,
        conditions: conteudo.conditions as never,
        actions: conteudo.actions as never,
        from_template_id: t.id,
      });
      if (error) throw error;
      return;
    }

    case "ai_faq": {
      const { data: existentes } = await supabase
        .from("ai_knowledge_faqs").select("order").eq("org_id", orgId);
      const base = Math.max(0, ...(existentes ?? []).map((r) => (r.order ?? 0) + 1));
      const { error } = await supabase.from("ai_knowledge_faqs").insert(
        conteudo.faqs.map((f, i) => ({
          org_id: orgId,
          question: cx(f.question),
          answer: cx(f.answer),
          order: base + i,
          from_template_id: t.id,
        })),
      );
      if (error) throw error;
      return;
    }

    case "ai_objection": {
      const { data: existentes } = await supabase
        .from("ai_knowledge_objections").select("order").eq("org_id", orgId);
      const base = Math.max(0, ...(existentes ?? []).map((r) => (r.order ?? 0) + 1));
      const { error } = await supabase.from("ai_knowledge_objections").insert(
        conteudo.objections.map((o, i) => ({
          org_id: orgId,
          objection: cx(o.objection),
          response: cx(o.response),
          order: base + i,
          from_template_id: t.id,
        })),
      );
      if (error) throw error;
      return;
    }
  }
}

export function useActivateTemplate() {
  const orgId = useOrgId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (template: LibraryTemplate): Promise<{ destino: string }> => {
      if (!orgId) throw new Error("Organização não carregada. Recarregue a página.");
      const ctx = await contextoDaOrg(orgId);
      await ativarPorCategoria(template, orgId, ctx);
      return { destino: DESTINO_POR_CATEGORIA[template.category] ?? "/dashboard" };
    },
    onSuccess: () => {
      // As chaves são as que os hooks de cada domínio realmente usam. O rascunho
      // da spec listava `email_sequences`/`ai_knowledge_faqs`, que não existem
      // neste código — invalidar por elas não atualizaria tela nenhuma.
      for (const key of [
        ["email-sequences", orgId],
        ["email-templates", orgId],
        ["automations", orgId],
        ["followup-config", orgId],
        ["followup-steps", orgId],
        ["ai-faqs", orgId],
        ["ai-objections", orgId],
      ]) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });
}

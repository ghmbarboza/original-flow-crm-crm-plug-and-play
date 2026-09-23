// Memória do lead (Sprint 12 B12): o que a IA sabe de cada contato, campo a
// campo, com status unknown|inferred|confirmed. Porte de lead-state.ts e do
// merge do analyze-conversation da Nina Zernio. Regra central: o que a equipe
// confirmou a IA nunca sobrescreve; o que a IA inferiu é pista, não fato.

export type StatusCampo = "unknown" | "inferred" | "confirmed";

export interface CampoMemoria {
  value: string | null;
  status: StatusCampo;
  /** Quem preencheu por último: 'ia' ou 'equipe'. */
  source?: "ia" | "equipe";
  updated_at?: string;
}

export const CAMPOS_LEAD = [
  "company", "role", "primary_pain", "desired_outcome", "urgency", "budget", "decision_timeline", "offering_interest", "next_best_action",
] as const;
export type ChaveCampo = (typeof CAMPOS_LEAD)[number];

export const ROTULO_CAMPO: Record<ChaveCampo, string> = {
  company: "Empresa",
  role: "Cargo ou papel",
  primary_pain: "Dor principal",
  desired_outcome: "Resultado desejado",
  urgency: "Urgência",
  budget: "Orçamento",
  decision_timeline: "Prazo de decisão",
  offering_interest: "Oferta de interesse",
  next_best_action: "Próxima melhor ação",
};

export interface MemoriaDoLead {
  lead_state: Partial<Record<ChaveCampo, CampoMemoria>>;
  sales_intelligence: {
    interests: string[];
    pains: string[];
    objections: string[];
    score: number | null;
    summary: string | null;
  };
  interaction_summary: {
    analyses: number;
    inbound_messages: number;
    last_analyzed_at: string | null;
    qualified_at: string | null;
  };
}

export function memoriaVazia(): MemoriaDoLead {
  return {
    lead_state: {},
    sales_intelligence: { interests: [], pains: [], objections: [], score: null, summary: null },
    interaction_summary: { analyses: 0, inbound_messages: 0, last_analyzed_at: null, qualified_at: null },
  };
}

/** Lê o JSON do banco tolerando forma parcial ou antiga. */
export function lerMemoria(bruto: unknown): MemoriaDoLead {
  const base = memoriaVazia();
  if (!bruto || typeof bruto !== "object") return base;
  const b = bruto as Partial<MemoriaDoLead>;
  const lead_state: MemoriaDoLead["lead_state"] = {};
  for (const k of CAMPOS_LEAD) {
    const c = b.lead_state?.[k];
    if (c && typeof c === "object" && ("value" in c)) lead_state[k] = { value: typeof c.value === "string" ? c.value : null, status: c.status ?? "unknown", source: c.source, updated_at: c.updated_at };
  }
  const si = (b.sales_intelligence ?? {}) as Partial<Record<"interests" | "pains" | "objections" | "score" | "summary", unknown>>;
  const lista = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()).slice(0, 10) : []);
  return {
    lead_state,
    sales_intelligence: {
      interests: lista(si.interests), pains: lista(si.pains), objections: lista(si.objections),
      score: typeof si.score === "number" ? Math.max(0, Math.min(100, Math.round(si.score))) : null,
      summary: typeof si.summary === "string" && si.summary.trim() ? si.summary.trim().slice(0, 600) : null,
    },
    interaction_summary: { ...base.interaction_summary, ...(b.interaction_summary ?? {}) },
  };
}

export interface AnaliseDaIA {
  company?: string; role?: string; primary_pain?: string; desired_outcome?: string; urgency?: string; budget?: string; decision_timeline?: string;
  offering_interest?: string; next_best_action?: string;
  interests?: string[]; pains?: string[]; objections?: string[]; score?: number; summary?: string;
}

function uniao(atual: string[], novos: unknown, max = 10): string[] {
  const out = [...atual];
  for (const n of Array.isArray(novos) ? novos : []) {
    const s = typeof n === "string" ? n.trim().slice(0, 120) : "";
    if (s && !out.some((x) => x.toLowerCase() === s.toLowerCase())) out.push(s);
  }
  return out.slice(-max);
}

/** Funde a análise na memória: confirmado fica, vazio não apaga, inferido atualiza. */
export function fundirAnalise(atual: MemoriaDoLead, analise: AnaliseDaIA, agora = new Date()): MemoriaDoLead {
  const quando = agora.toISOString();
  const lead_state: MemoriaDoLead["lead_state"] = { ...atual.lead_state };
  for (const k of CAMPOS_LEAD) {
    const existente = lead_state[k];
    if (existente?.status === "confirmed") continue;
    const valor = typeof analise[k] === "string" ? (analise[k] as string).trim().slice(0, 200) : "";
    if (valor) lead_state[k] = { value: valor, status: "inferred", source: "ia", updated_at: quando };
    else if (!existente) lead_state[k] = { value: null, status: "unknown" };
  }
  const score = typeof analise.score === "number" && Number.isFinite(analise.score) ? Math.max(0, Math.min(100, Math.round(analise.score))) : atual.sales_intelligence.score;
  return {
    lead_state,
    sales_intelligence: {
      interests: uniao(atual.sales_intelligence.interests, analise.interests),
      pains: uniao(atual.sales_intelligence.pains, analise.pains),
      objections: uniao(atual.sales_intelligence.objections, analise.objections),
      score,
      summary: typeof analise.summary === "string" && analise.summary.trim() ? analise.summary.trim().slice(0, 600) : atual.sales_intelligence.summary,
    },
    interaction_summary: { ...atual.interaction_summary, analyses: atual.interaction_summary.analyses + 1, last_analyzed_at: quando },
  };
}

function escapar(t: string): string {
  return t.replace(/[<>]/g, (c) => (c === "<" ? "‹" : "›")).replace(/\s+/g, " ").trim();
}

/**
 * Bloco do system prompt com o que já se sabe do lead. Dado não confiável por
 * definição (veio da conversa): inferido é pista, confirmado é fato da equipe.
 */
export function blocoDoLead(memoria: MemoriaDoLead, nome: string | null): string {
  const linhas: string[] = [];
  if (nome) linhas.push(`- Nome: ${escapar(nome)}`);
  for (const k of CAMPOS_LEAD) {
    const c = memoria.lead_state[k];
    if (!c || c.status === "unknown" || !c.value) continue;
    const marca = c.status === "confirmed" ? "[confirmado pela equipe]" : "[inferido: use como pista e confirme antes de tratar como fato]";
    linhas.push(`- ${ROTULO_CAMPO[k]}: ${escapar(c.value)} ${marca}`);
  }
  const si = memoria.sales_intelligence;
  if (si.interests.length) linhas.push(`- Interesses: ${si.interests.map(escapar).join(", ")} [inferido]`);
  if (si.pains.length) linhas.push(`- Dores percebidas: ${si.pains.map(escapar).join(", ")} [inferido]`);
  if (si.objections.length) linhas.push(`- Objeções já levantadas: ${si.objections.map(escapar).join(", ")} [inferido]`);
  if (si.summary) linhas.push(`- Resumo factual: ${escapar(si.summary)}`);
  if (linhas.length === 0) return "";
  return [
    "",
    '<contexto_do_lead confianca="dado_da_conversa" regra="inferido_nao_e_confirmado">',
    ...linhas,
    "</contexto_do_lead>",
    "Use o contexto acima para não repetir perguntas já respondidas. Nunca cite valores inferidos como certos; confirme com naturalidade.",
  ].join("\n");
}

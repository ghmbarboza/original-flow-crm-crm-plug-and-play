/**
 * Memória do lead na tela (Sprint 12 B12). Espelha _shared/leadState.ts das
 * functions: campos com status unknown|inferred|confirmed. Aqui só leitura,
 * normalização e a edição feita pela equipe (que vira "confirmed").
 */

export type StatusCampo = "unknown" | "inferred" | "confirmed";

export interface CampoMemoria {
  value: string | null;
  status: StatusCampo;
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

export const STATUS_LABEL: Record<StatusCampo, string> = { unknown: "não sabemos", inferred: "inferido pela IA", confirmed: "confirmado" };

export interface MemoriaDoLead {
  lead_state: Partial<Record<ChaveCampo, CampoMemoria>>;
  sales_intelligence: { interests: string[]; pains: string[]; objections: string[]; score: number | null; summary: string | null };
  interaction_summary: { analyses: number; inbound_messages: number; last_analyzed_at: string | null; qualified_at: string | null };
}

export function memoriaVazia(): MemoriaDoLead {
  return {
    lead_state: {},
    sales_intelligence: { interests: [], pains: [], objections: [], score: null, summary: null },
    interaction_summary: { analyses: 0, inbound_messages: 0, last_analyzed_at: null, qualified_at: null },
  };
}

export function lerMemoria(bruto: unknown): MemoriaDoLead {
  const base = memoriaVazia();
  if (!bruto || typeof bruto !== "object") return base;
  const b = bruto as Partial<MemoriaDoLead>;
  const lead_state: MemoriaDoLead["lead_state"] = {};
  for (const k of CAMPOS_LEAD) {
    const c = b.lead_state?.[k];
    if (c && typeof c === "object" && "value" in c) lead_state[k] = { value: typeof c.value === "string" ? c.value : null, status: c.status ?? "unknown", source: c.source, updated_at: c.updated_at };
  }
  const si = (b.sales_intelligence ?? {}) as Partial<Record<"interests" | "pains" | "objections" | "score" | "summary", unknown>>;
  const lista = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()) : []);
  return {
    lead_state,
    sales_intelligence: {
      interests: lista(si.interests), pains: lista(si.pains), objections: lista(si.objections),
      score: typeof si.score === "number" ? si.score : null,
      summary: typeof si.summary === "string" ? si.summary : null,
    },
    interaction_summary: { ...base.interaction_summary, ...(b.interaction_summary ?? {}) },
  };
}

/** A equipe editou um campo: vira confirmado (ou volta a "não sabemos" quando esvazia). */
export function confirmarCampo(memoria: MemoriaDoLead, chave: ChaveCampo, valor: string): MemoriaDoLead {
  const v = valor.trim();
  return {
    ...memoria,
    lead_state: {
      ...memoria.lead_state,
      [chave]: v ? { value: v, status: "confirmed", source: "equipe", updated_at: new Date().toISOString() } : { value: null, status: "unknown" },
    },
  };
}

export function temAlgo(memoria: MemoriaDoLead): boolean {
  return Object.values(memoria.lead_state).some((c) => c?.value) || memoria.sales_intelligence.interests.length > 0 || memoria.sales_intelligence.pains.length > 0 || memoria.sales_intelligence.score !== null;
}

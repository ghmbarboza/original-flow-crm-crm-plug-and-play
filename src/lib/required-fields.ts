import type { Json } from "@/integrations/supabase/types";

/**
 * Campos obrigatórios por etapa do pipeline (Parte 5 do Sprint 10A).
 *
 * A regra vive em `pipeline_stages.required_fields` (JSONB) no formato
 * `[{"field": "contact.email"}, {"field": "deal.value", "min": 1}]`.
 * A validação roda no cliente ao mover o deal (drag no Kanban ou troca manual
 * na ficha); o banco só guarda a regra.
 */

// Type alias (não interface) para ser atribuível a Json nos updates do Supabase.
export type RequiredFieldRule = {
  field: string;
  /** Para campos numéricos: valor mínimo para contar como preenchido. */
  min?: number;
};

export interface RequiredFieldOption {
  field: string;
  label: string;
  /** `min` gravado na regra quando o campo é marcado (ex.: valor > 0). */
  min?: number;
}

/**
 * Catálogo dos campos que o admin pode exigir. Sem registro de campos
 * customizados de contato na org, o catálogo fica nos campos nativos.
 */
export const REQUIRED_FIELD_OPTIONS: RequiredFieldOption[] = [
  { field: "contact.email", label: "Email do contato" },
  { field: "contact.phone", label: "Telefone do contato" },
  { field: "deal.value", label: "Valor do negócio (maior que zero)", min: 1 },
  { field: "deal.company", label: "Empresa vinculada" },
  { field: "deal.close_date", label: "Data de fechamento" },
];

export function requiredFieldLabel(field: string): string {
  return REQUIRED_FIELD_OPTIONS.find((o) => o.field === field)?.label ?? field;
}

/** Lê o JSONB da etapa com tolerância a formatos inesperados. */
export function parseRequiredFields(json: Json | null | undefined): RequiredFieldRule[] {
  if (!Array.isArray(json)) return [];
  const rules: RequiredFieldRule[] = [];
  for (const item of json) {
    if (item && typeof item === "object" && !Array.isArray(item) && typeof item.field === "string") {
      const min = typeof item.min === "number" ? item.min : undefined;
      rules.push({ field: item.field, ...(min !== undefined ? { min } : {}) });
    }
  }
  return rules;
}

/** Recorte do deal que a validação precisa (subconjunto do `Deal` do useDeals). */
export interface DealForValidation {
  value: number | null;
  company_id: string | null;
  close_date: string | null;
  contact: {
    email?: string | null;
    phone?: string | null;
    whatsapp_phone?: string | null;
  } | null;
}

function filled(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Retorna os rótulos dos campos que ainda faltam para o deal entrar na etapa.
 * Lista vazia = movimentação liberada.
 */
export function missingRequiredFields(
  rules: RequiredFieldRule[],
  deal: DealForValidation,
): string[] {
  const missing: string[] = [];
  for (const rule of rules) {
    switch (rule.field) {
      case "contact.email":
        if (!filled(deal.contact?.email)) missing.push(requiredFieldLabel(rule.field));
        break;
      case "contact.phone":
        // Telefone fixo ou WhatsApp contam como telefone do contato.
        if (!filled(deal.contact?.phone) && !filled(deal.contact?.whatsapp_phone)) {
          missing.push(requiredFieldLabel(rule.field));
        }
        break;
      case "deal.value": {
        const min = rule.min ?? 1;
        if (Number(deal.value ?? 0) < min) missing.push(requiredFieldLabel(rule.field));
        break;
      }
      case "deal.company":
        if (!deal.company_id) missing.push(requiredFieldLabel(rule.field));
        break;
      case "deal.close_date":
        if (!filled(deal.close_date)) missing.push(requiredFieldLabel(rule.field));
        break;
      default:
        // Regra desconhecida (ex.: gravada por versão futura): não bloqueia.
        break;
    }
  }
  return missing;
}

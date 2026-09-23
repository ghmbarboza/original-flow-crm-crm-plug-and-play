/**
 * Regras dos formulários de captura, compartilhadas entre a página pública, o
 * construtor e a edge function submit-capture-form (cópia em
 * supabase/functions/_shared/formRules.ts: mantenha as duas iguais).
 */

export type CaptureFieldType =
  | "text" | "email" | "phone" | "textarea" | "select" | "radio" | "checkbox" | "number" | "date" | "hidden";

export type ShowWhenOp = "eq" | "neq" | "contains" | "not_empty";

export interface ShowWhen {
  field: string;
  op: ShowWhenOp;
  value?: string;
}

export interface CaptureField {
  key: string;
  label: string;
  type: CaptureFieldType;
  required: boolean;
  /** select e radio */
  options?: string[];
  /** Texto de apoio abaixo do campo. */
  help?: string;
  /** hidden: valor fixo gravado no envio. */
  value?: string;
  /** Mostrar só quando outro campo satisfizer a regra. */
  show_when?: ShowWhen | null;
}

export const FIELD_TYPE_LABELS: Record<CaptureFieldType, string> = {
  text: "Texto",
  email: "E-mail",
  phone: "Telefone",
  textarea: "Texto longo",
  select: "Lista de opções",
  radio: "Escolha única",
  checkbox: "Caixa de marcação",
  number: "Número",
  date: "Data",
  hidden: "Oculto (valor fixo)",
};

export const SHOW_WHEN_LABELS: Record<ShowWhenOp, string> = {
  eq: "for igual a",
  neq: "for diferente de",
  contains: "contiver",
  not_empty: "estiver preenchido",
};

/** Chaves de rastreamento aceitas do navegador e gravadas em custom_fields. */
export const TRACKING_KEYS = [
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid", "referrer", "page_url",
] as const;
export type TrackingKey = (typeof TRACKING_KEYS)[number];
export type Tracking = Partial<Record<TrackingKey, string>>;

const TAMANHO_MAX = 500;

/** Só as chaves conhecidas, como texto curto. */
export function normalizarTracking(bruto: unknown): Tracking {
  const saida: Tracking = {};
  if (!bruto || typeof bruto !== "object") return saida;
  for (const k of TRACKING_KEYS) {
    const v = (bruto as Record<string, unknown>)[k];
    if (typeof v === "string" && v.trim()) saida[k] = v.trim().slice(0, TAMANHO_MAX);
  }
  return saida;
}

/** Rastreamento a partir da URL da página e do referrer (lado do navegador). */
export function lerTrackingDaPagina(url: string, referrer: string): Tracking {
  const t: Tracking = {};
  try {
    const u = new URL(url);
    for (const k of TRACKING_KEYS) {
      if (k === "referrer" || k === "page_url") continue;
      const v = u.searchParams.get(k);
      if (v) t[k] = v;
    }
    t.page_url = `${u.origin}${u.pathname}`;
  } catch {
    // URL inválida: sem rastreamento de página.
  }
  if (referrer) t.referrer = referrer.slice(0, TAMANHO_MAX);
  return t;
}

/** Origem do contato: utm_source limpo, senão o padrão do formulário. */
export function origemDoTracking(t: Tracking, padrao: string | null | undefined): string {
  const bruto = (t.utm_source ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const limpo = bruto.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
  return limpo || (padrao ?? "").trim() || "capture_form";
}

export function campoVisivel(field: CaptureField, values: Record<string, unknown>): boolean {
  const regra = field.show_when;
  if (!regra || !regra.field) return true;
  const atual = values[regra.field];
  const texto = atual === undefined || atual === null ? "" : String(atual).trim();
  const esperado = (regra.value ?? "").trim();
  switch (regra.op) {
    case "eq": return texto.toLowerCase() === esperado.toLowerCase();
    case "neq": return texto.toLowerCase() !== esperado.toLowerCase();
    case "contains": return texto.toLowerCase().includes(esperado.toLowerCase());
    case "not_empty": return texto !== "" && texto !== "false";
    default: return true;
  }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Primeiro erro de validação, ou null. Campo oculto pela regra não é exigido.
 * Checkbox obrigatório precisa estar marcado.
 */
export function validarValores(fields: CaptureField[], values: Record<string, unknown>): string | null {
  for (const f of fields) {
    if (f.type === "hidden" || !campoVisivel(f, values)) continue;
    const bruto = values[f.key];
    const texto = bruto === undefined || bruto === null ? "" : String(bruto).trim();
    if (f.required && (texto === "" || (f.type === "checkbox" && texto !== "true"))) {
      return f.type === "checkbox" ? `Marque "${f.label}".` : `Preencha o campo "${f.label}".`;
    }
    if (texto === "") continue;
    if (f.type === "email" && !EMAIL.test(texto)) return `Informe um e-mail válido em "${f.label}".`;
    if (f.type === "number" && Number.isNaN(Number(texto.replace(",", ".")))) return `Informe um número em "${f.label}".`;
    if ((f.type === "select" || f.type === "radio") && f.options?.length && !f.options.includes(texto)) {
      return `Escolha uma opção válida em "${f.label}".`;
    }
  }
  return null;
}

/** Só os campos válidos, no formato esperado. Tolera dados legados (sem type/options). */
export function parseCaptureFields(raw: unknown): CaptureField[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((f): f is CaptureField =>
      !!f && typeof f === "object" && typeof (f as CaptureField).key === "string" && typeof (f as CaptureField).label === "string")
    .map((f) => ({
      key: f.key,
      label: f.label,
      type: (f.type in FIELD_TYPE_LABELS ? f.type : "text") as CaptureFieldType,
      required: !!f.required,
      options: Array.isArray(f.options) ? f.options.map(String).filter(Boolean) : undefined,
      help: typeof f.help === "string" ? f.help : undefined,
      value: typeof f.value === "string" ? f.value : undefined,
      show_when: f.show_when && typeof f.show_when === "object" && typeof f.show_when.field === "string" ? f.show_when : null,
    }));
}

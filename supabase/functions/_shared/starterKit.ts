// Kit inicial gerado pela IA no wizard (Sprint 12 B7): formato e normalização.
//
// O modelo devolve JSON livre; aqui cada bloco é validado contra o que o CRM
// aceita (tipos de gatilho, ação, cobrança...). O que não bate é descartado,
// nunca gravado quebrado.

export interface KitAutomacao {
  name: string;
  description: string;
  trigger: { type: string };
  conditions: { field: string; op: "eq" | "neq" | "contains"; value: string }[];
  actions: { type: string; params: Record<string, string> }[];
}

export interface KitFollowup {
  max_attempts: number;
  on_limit_reached: "mark_inactive" | "notify_agent" | "both";
  steps: { delay_hours: number; message: string }[];
}

export interface KitSequencia {
  name: string;
  steps: { delay_days: number; subject: string; body_html: string }[];
}

export interface KitModeloEmail {
  name: string;
  subject: string;
  body_html: string;
}

export interface KitTemplateWhatsapp {
  name: string;
  category: "MARKETING" | "UTILITY";
  language: string;
  body_text: string;
  example_params: string[];
}

export interface KitRespostaRapida {
  shortcut: string;
  title: string;
  content: string;
}

export interface KitInicial {
  automations: KitAutomacao[];
  followup: KitFollowup | null;
  sequences: KitSequencia[];
  email_templates: KitModeloEmail[];
  whatsapp_templates: KitTemplateWhatsapp[];
  quick_replies: KitRespostaRapida[];
}

const GATILHOS = new Set(["contact_created", "deal_stage_changed", "form_submitted", "tag_added", "message_received"]);
const ACOES = new Set(["send_email", "create_activity", "notify_agent", "ai_outreach", "add_tag", "move_deal", "start_sequence"]);
const OPS = new Set(["eq", "neq", "contains"]);
const LIMITE_FOLLOWUP = new Set(["mark_inactive", "notify_agent", "both"]);

function str(v: unknown, max = 2000): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function inteiro(v: unknown, min: number, max: number, padrao: number): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao;
}

function lista(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** Nome de template da Meta: minúsculas, números e underscore, começando por letra. */
export function nomeDeTemplate(bruto: string): string {
  const base = bruto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return (/^[a-z]/.test(base) ? base : `t_${base}`).slice(0, 60);
}

/** Quantas variáveis {{1}}, {{2}}... o corpo do template usa. */
export function contarVariaveis(corpo: string): number {
  const nums = [...corpo.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  return nums.length ? Math.max(...nums) : 0;
}

export function normalizarKit(bruto: unknown): KitInicial {
  const d = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;

  const automations: KitAutomacao[] = lista(d.automations).flatMap((a) => {
    const o = (a ?? {}) as Record<string, unknown>;
    const trigger = ((o.trigger ?? {}) as Record<string, unknown>).type;
    const nome = str(o.name, 120);
    if (!nome || typeof trigger !== "string" || !GATILHOS.has(trigger)) return [];
    const actions = lista(o.actions).flatMap((x) => {
      const ac = (x ?? {}) as Record<string, unknown>;
      const tipo = str(ac.type, 40);
      if (!ACOES.has(tipo)) return [];
      const params: Record<string, string> = {};
      for (const [k, v] of Object.entries((ac.params ?? {}) as Record<string, unknown>)) {
        if (typeof v === "string" || typeof v === "number") params[k] = String(v).slice(0, 500);
      }
      return [{ type: tipo, params }];
    });
    if (!actions.length) return [];
    const conditions = lista(o.conditions).flatMap((x) => {
      const c = (x ?? {}) as Record<string, unknown>;
      const op = str(c.op, 10);
      const field = str(c.field, 60);
      if (!field || !OPS.has(op)) return [];
      return [{ field, op: op as "eq" | "neq" | "contains", value: str(c.value, 200) }];
    });
    return [{ name: nome, description: str(o.description, 300), trigger: { type: trigger }, conditions, actions }];
  }).slice(0, 5);

  let followup: KitFollowup | null = null;
  if (d.followup && typeof d.followup === "object") {
    const f = d.followup as Record<string, unknown>;
    const steps = lista(f.steps).flatMap((x) => {
      const s = (x ?? {}) as Record<string, unknown>;
      const message = str(s.message, 1000);
      return message ? [{ delay_hours: inteiro(s.delay_hours, 1, 24 * 30, 24), message }] : [];
    }).slice(0, 6);
    if (steps.length) {
      const limite = str(f.on_limit_reached, 10);
      followup = {
        max_attempts: inteiro(f.max_attempts, 1, 10, steps.length),
        on_limit_reached: (LIMITE_FOLLOWUP.has(limite) ? limite : "notify_agent") as KitFollowup["on_limit_reached"],
        steps,
      };
    }
  }

  const sequences: KitSequencia[] = lista(d.sequences).flatMap((x) => {
    const s = (x ?? {}) as Record<string, unknown>;
    const name = str(s.name, 120);
    const steps = lista(s.steps).flatMap((y) => {
      const p = (y ?? {}) as Record<string, unknown>;
      const subject = str(p.subject, 200);
      const body = str(p.body_html ?? p.body, 6000);
      return subject && body ? [{ delay_days: inteiro(p.delay_days, 0, 90, 2), subject, body_html: body }] : [];
    }).slice(0, 6);
    return name && steps.length ? [{ name, steps }] : [];
  }).slice(0, 3);

  const email_templates: KitModeloEmail[] = lista(d.email_templates).flatMap((x) => {
    const t = (x ?? {}) as Record<string, unknown>;
    const name = str(t.name, 120);
    const subject = str(t.subject, 200);
    const body = str(t.body_html ?? t.body, 6000);
    return name && subject && body ? [{ name, subject, body_html: body }] : [];
  }).slice(0, 6);

  const whatsapp_templates: KitTemplateWhatsapp[] = lista(d.whatsapp_templates).flatMap((x) => {
    const t = (x ?? {}) as Record<string, unknown>;
    const body = str(t.body_text ?? t.body, 1024);
    const nome = nomeDeTemplate(str(t.name, 80));
    if (!body || !nome) return [];
    const esperadas = contarVariaveis(body);
    const exemplos = lista(t.example_params).map((v) => String(v).slice(0, 100)).filter(Boolean);
    while (exemplos.length < esperadas) exemplos.push(`exemplo ${exemplos.length + 1}`);
    const categoria = str(t.category, 20).toUpperCase() === "MARKETING" ? "MARKETING" : "UTILITY";
    return [{ name: nome, category: categoria as "MARKETING" | "UTILITY", language: str(t.language, 10) || "pt_BR", body_text: body, example_params: exemplos.slice(0, esperadas) }];
  }).slice(0, 8);

  const quick_replies: KitRespostaRapida[] = lista(d.quick_replies).flatMap((x) => {
    const q = (x ?? {}) as Record<string, unknown>;
    const shortcut = str(q.shortcut, 30).replace(/^\/+/, "").replace(/\s+/g, "-").toLowerCase();
    const content = str(q.content, 1000);
    return shortcut && content ? [{ shortcut, title: str(q.title, 80) || shortcut, content }] : [];
  }).slice(0, 8);

  return { automations, followup, sequences, email_templates, whatsapp_templates, quick_replies };
}

export function kitVazio(k: KitInicial): boolean {
  return !k.automations.length && !k.followup && !k.sequences.length && !k.email_templates.length && !k.whatsapp_templates.length && !k.quick_replies.length;
}

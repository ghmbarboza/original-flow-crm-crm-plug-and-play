/**
 * Renderização de variáveis nos templates de email ({{contact.first_name}} etc).
 *
 * O contexto é um objeto aninhado (contact/deal/company); a chave usa ponto.
 * Variável sem valor vira string vazia — nunca deixa o `{{...}}` cru no email.
 */

export interface TemplateContext {
  contact?: Record<string, unknown> | null;
  deal?: Record<string, unknown> | null;
  company?: Record<string, unknown> | null;
}

/** Variáveis oferecidas ao usuário no editor, com um exemplo para o preview. */
export const TEMPLATE_VARIABLES: { token: string; label: string; sample: string }[] = [
  { token: "{{contact.first_name}}", label: "Nome do contato", sample: "Maria" },
  { token: "{{contact.last_name}}", label: "Sobrenome do contato", sample: "Souza" },
  { token: "{{contact.email}}", label: "Email do contato", sample: "maria@empresa.com" },
  { token: "{{contact.title}}", label: "Cargo do contato", sample: "Diretora" },
  { token: "{{company.name}}", label: "Empresa", sample: "Empresa Exemplo" },
  { token: "{{deal.title}}", label: "Título do negócio", sample: "Plano Anual" },
];

function resolve(path: string, context: TemplateContext): string {
  const [root, field] = path.split(".");
  const obj = (context as Record<string, Record<string, unknown> | null | undefined>)[root];
  const value = obj?.[field];
  return value == null ? "" : String(value);
}

export function renderTemplate(template: string, context: TemplateContext): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, path) => resolve(path, context));
}

/** Contexto de exemplo para o preview no editor. */
export function sampleContext(): TemplateContext {
  const contact: Record<string, unknown> = {};
  const company: Record<string, unknown> = {};
  const deal: Record<string, unknown> = {};
  for (const v of TEMPLATE_VARIABLES) {
    const [root, field] = v.token.replace(/\{\{|\}\}/g, "").split(".");
    if (root === "contact") contact[field] = v.sample;
    if (root === "company") company[field] = v.sample;
    if (root === "deal") deal[field] = v.sample;
  }
  return { contact, company, deal };
}

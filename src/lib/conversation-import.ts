/**
 * Parsing da importação de histórico de conversas (Parte 6 do Sprint 10B).
 *
 * Lógica pura: recebe linhas de CSV já parseadas (lib/csv) e o mapeamento de
 * colunas, normaliza cada linha em uma mensagem e agrupa por telefone em
 * conversas. Quem grava no banco é o hook; aqui só se decide o que é válido.
 */

export interface ImportMapping {
  phone: number;
  date: number;
  direction: number;
  content: number;
  /** Nome do contato (opcional). */
  name?: number;
}

export interface ImportedMessage {
  sent_at: string;
  direction: "inbound" | "outbound";
  content: string;
}

export interface ImportedConversation {
  phone: string;
  name: string | null;
  messages: ImportedMessage[];
}

export interface ImportParseResult {
  conversations: ImportedConversation[];
  totalMessages: number;
  errors: { line: number; reason: string }[];
}

const INBOUND_TOKENS = new Set([
  "inbound", "in", "received", "receive", "incoming", "recebida", "recebido",
  "cliente", "contact", "contato", "customer", "user",
]);
const OUTBOUND_TOKENS = new Set([
  "outbound", "out", "sent", "send", "outgoing", "enviada", "enviado",
  "agente", "agent", "empresa", "operator", "atendente",
]);

export function normalizeDirection(raw: string): "inbound" | "outbound" | null {
  const token = raw.trim().toLowerCase();
  if (INBOUND_TOKENS.has(token)) return "inbound";
  if (OUTBOUND_TOKENS.has(token)) return "outbound";
  return null;
}

/** Aceita ISO e o formato brasileiro dd/mm/aaaa [hh:mm[:ss]]. */
export function parseImportDate(raw: string): Date | null {
  const value = raw.trim();
  if (!value) return null;

  const br = value.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (br) {
    const [, d, m, y, hh = "0", mm = "0", ss = "0"] = br;
    const date = new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Telefone normalizado: só dígitos, mínimo 8. */
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 8 ? digits : null;
}

/**
 * Chave de agrupamento: últimos 11 dígitos (DDD + celular). "5511999998888" e
 * "(11) 99999-8888" são a mesma conversa; a variante mais completa vira o
 * telefone gravado.
 */
function phoneKey(digits: string): string {
  return digits.length > 11 ? digits.slice(-11) : digits;
}

export function parseImportRows(
  rows: string[][],
  lineNumbers: number[],
  mapping: ImportMapping,
): ImportParseResult {
  const byPhone = new Map<string, ImportedConversation>();
  const errors: ImportParseResult["errors"] = [];
  let totalMessages = 0;

  rows.forEach((row, index) => {
    const line = lineNumbers[index] ?? index + 2;
    const phone = normalizePhone(row[mapping.phone] ?? "");
    if (!phone) {
      errors.push({ line, reason: "Telefone ausente ou inválido." });
      return;
    }
    const date = parseImportDate(row[mapping.date] ?? "");
    if (!date) {
      errors.push({ line, reason: `Data inválida: "${row[mapping.date] ?? ""}".` });
      return;
    }
    const direction = normalizeDirection(row[mapping.direction] ?? "");
    if (!direction) {
      errors.push({ line, reason: `Direção não reconhecida: "${row[mapping.direction] ?? ""}". Use inbound/outbound.` });
      return;
    }
    const content = (row[mapping.content] ?? "").trim();
    if (!content) {
      errors.push({ line, reason: "Mensagem vazia." });
      return;
    }

    const key = phoneKey(phone);
    let conversation = byPhone.get(key);
    if (!conversation) {
      conversation = { phone, name: null, messages: [] };
      byPhone.set(key, conversation);
    } else if (phone.length > conversation.phone.length) {
      conversation.phone = phone;
    }
    if (mapping.name !== undefined && !conversation.name) {
      const name = (row[mapping.name] ?? "").trim();
      if (name) conversation.name = name;
    }
    conversation.messages.push({
      sent_at: date.toISOString(),
      direction,
      content,
    });
    totalMessages++;
  });

  const conversations = [...byPhone.values()].map((c) => ({
    ...c,
    messages: c.messages.slice().sort((a, b) => a.sent_at.localeCompare(b.sent_at)),
  }));

  return { conversations, totalMessages, errors };
}

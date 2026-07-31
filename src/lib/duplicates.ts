/**
 * Detecção de contatos duplicados (Parte 7 do Sprint 10A).
 *
 * Lógica pura, sem I/O: recebe a lista de contatos já carregada e aponta pares
 * com alta chance de serem a mesma pessoa — mesmo email, mesmo telefone (fixo
 * ou WhatsApp, com tolerância a código do país) ou mesmo nome normalizado.
 */

export interface DuplicateCandidate {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  whatsapp_phone: string | null;
}

export interface DuplicatePair<T extends DuplicateCandidate = DuplicateCandidate> {
  a: T;
  b: T;
  reasons: string[];
}

export function normalizeEmail(email: string | null | undefined): string | null {
  const e = (email ?? "").trim().toLowerCase();
  return e || null;
}

/** Só dígitos. "(11) 99999-8888" e "11999998888" viram a mesma coisa. */
export function normalizePhone(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.length >= 8 ? digits : null;
}

/**
 * Dois telefones são o mesmo número quando são iguais ou quando um termina no
 * outro e o mais curto tem ao menos 10 dígitos (DDD + número) — cobre o par
 * comum "5511999998888" × "11999998888" sem casar números de DDDs diferentes.
 */
export function phonesMatch(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const [longer, shorter] = a.length >= b.length ? [a, b] : [b, a];
  return shorter.length >= 10 && longer.endsWith(shorter);
}

/** Nome completo sem acentos, caixa ou espaços repetidos. */
export function normalizeName(first: string, last: string | null | undefined): string | null {
  const name = [first, last]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  // Nome de uma palavra só ("Maria") casa gente demais para sugerir merge.
  return name.includes(" ") ? name : null;
}

function contactPhones(c: DuplicateCandidate): string[] {
  return [normalizePhone(c.phone), normalizePhone(c.whatsapp_phone)].filter(
    (p): p is string => !!p,
  );
}

/** Motivos pelos quais A e B parecem duplicatas; vazio = não parecem. */
export function duplicateReasons(a: DuplicateCandidate, b: DuplicateCandidate): string[] {
  const reasons: string[] = [];

  const emailA = normalizeEmail(a.email);
  if (emailA && emailA === normalizeEmail(b.email)) reasons.push("Mesmo email");

  const phonesA = contactPhones(a);
  const phonesB = contactPhones(b);
  if (phonesA.some((pa) => phonesB.some((pb) => phonesMatch(pa, pb)))) {
    reasons.push("Mesmo telefone");
  }

  const nameA = normalizeName(a.first_name, a.last_name);
  if (nameA && nameA === normalizeName(b.first_name, b.last_name)) {
    reasons.push("Mesmo nome");
  }

  return reasons;
}

/** Chave de bucket de um telefone: últimos 10 dígitos (DDD + número). */
function phoneKey(digits: string): string {
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

/**
 * Varre a lista e devolve os pares suspeitos, cada par uma única vez,
 * ordenados pelos mais fortes (mais motivos) primeiro.
 *
 * Indexado por email/telefone/nome em vez de comparar todo mundo com todo
 * mundo — uma base com milhares de contatos não pode custar O(n²) completo;
 * só contatos que caem no mesmo bucket são comparados de fato.
 */
export function findDuplicatePairs<T extends DuplicateCandidate>(contacts: T[]): DuplicatePair<T>[] {
  const buckets = new Map<string, T[]>();
  const add = (key: string | null, prefix: string, contact: T) => {
    if (!key) return;
    const full = `${prefix}:${key}`;
    const list = buckets.get(full) ?? [];
    list.push(contact);
    buckets.set(full, list);
  };

  for (const c of contacts) {
    add(normalizeEmail(c.email), "email", c);
    for (const p of new Set(contactPhones(c).map(phoneKey))) add(p, "phone", c);
    add(normalizeName(c.first_name, c.last_name), "name", c);
  }

  const seen = new Set<string>();
  const pairs: DuplicatePair<T>[] = [];
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const [a, b] = list[i].id < list[j].id ? [list[i], list[j]] : [list[j], list[i]];
        const key = `${a.id}|${b.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        // duplicateReasons reavalia o par completo: um par que caiu no bucket
        // de telefone também ganha o motivo de email/nome quando se aplica.
        const reasons = duplicateReasons(a, b);
        if (reasons.length > 0) pairs.push({ a, b, reasons });
      }
    }
  }
  return pairs.sort((x, y) => y.reasons.length - x.reasons.length);
}

// Horário de atendimento da IA, compartilhado entre ai-reply (responder) e
// ai-outreach (abordar). Os dois formatos de `working_hours` convivem no banco:
// por dia ({"mon": {enabled, start, end}}) e legado ({"days": [1..5], start, end}).

export interface WorkingDay {
  enabled?: boolean;
  start?: string;
  end?: string;
}
/** Formato novo, gravado pela tela de IA: uma entrada por dia da semana. */
type WorkingHoursPorDia = Record<string, WorkingDay>;
/** Formato legado, que é o DEFAULT da coluna no banco. */
interface WorkingHoursLegado {
  days?: number[];
  start?: string;
  end?: string;
}

/** Ordem ISO: 1 = segunda ... 7 = domingo, casando com o formato legado. */
const DIAS_ISO = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/** Uma janela HH:MM contém o horário atual? Trata janela que vira o dia. */
function dentroDaJanela(agora: string, inicio: string, fim: string): boolean {
  if (inicio <= fim) return agora >= inicio && agora <= fim;
  // Ex.: 22:00 às 02:00 é contínua, não vazia.
  return agora >= inicio || agora <= fim;
}

/**
 * A IA só responde dentro do horário de atendimento configurado.
 *
 * Fuso: usa organizations.timezone, não o do servidor. A edge function roda em
 * UTC e comparar contra ele responderia no horário errado para qualquer org
 * fora de Greenwich.
 *
 * DOIS FORMATOS convivem na coluna e ambos precisam funcionar:
 *  - por dia   {"mon": {enabled, start, end}, ...} — o que a tela de IA grava
 *  - legado    {"days": [1..5], "start", "end"}    — o DEFAULT da coluna
 * Uma org que nunca abriu a tela tem o legado. Entender só o formato novo faria
 * a IA responder 24h justamente para quem nunca configurou nada.
 *
 * Sem configuração reconhecível, atende: silenciar quem não configurou seria
 * pior que o excesso.
 */
export function dentroDoHorario(workingHours: unknown, timezone: string, instante = new Date()): boolean {
  if (!workingHours || typeof workingHours !== "object") return true;

  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(instante);

  const diaKey = partes.find((p) => p.type === "weekday")?.value.toLowerCase() ?? "";
  const hora = partes.find((p) => p.type === "hour")?.value ?? "00";
  const minuto = partes.find((p) => p.type === "minute")?.value ?? "00";
  const agora = `${hora}:${minuto}`;

  // O formato por dia vence quando existe. A tela mesclava o default legado com
  // o que o usuário editava e gravava os dois juntos; lendo o legado primeiro,
  // a IA ignorava o horário configurado na tela (achado de 14/09: org com
  // "days" 08-18 e segunda a sexta 09-18 na tela).
  const temPorDia = DIAS_ISO.some((d) => typeof (workingHours as Record<string, unknown>)[d] === "object");
  const legado = workingHours as WorkingHoursLegado;
  if (!temPorDia && Array.isArray(legado.days)) {
    const isoHoje = DIAS_ISO.indexOf(diaKey) + 1; // 0 vira -1+1 = 0, nunca casa
    if (!legado.days.includes(isoHoje)) return false;
    return dentroDaJanela(agora, legado.start ?? "00:00", legado.end ?? "23:59");
  }

  const porDia = workingHours as WorkingHoursPorDia;
  if (Object.keys(porDia).length === 0) return true;

  const dia = porDia[diaKey];
  // Dia ausente é tratado como não configurado, não como fechado.
  if (!dia) return true;
  if (dia.enabled === false) return false;
  return dentroDaJanela(agora, dia.start ?? "00:00", dia.end ?? "23:59");
}

/** Janela do dia no formato por dia; null quando o dia não atende. */
function janelaDoDia(workingHours: unknown, diaKey: string): { inicio: string; fim: string } | null {
  if (!workingHours || typeof workingHours !== "object") return { inicio: "00:00", fim: "23:59" };
  const temPorDia = DIAS_ISO.some((d) => typeof (workingHours as Record<string, unknown>)[d] === "object");
  if (!temPorDia) {
    const legado = workingHours as WorkingHoursLegado;
    if (!Array.isArray(legado.days)) return { inicio: "00:00", fim: "23:59" };
    const iso = DIAS_ISO.indexOf(diaKey) + 1;
    if (!legado.days.includes(iso)) return null;
    return { inicio: legado.start ?? "00:00", fim: legado.end ?? "23:59" };
  }
  const dia = (workingHours as WorkingHoursPorDia)[diaKey];
  if (!dia) return { inicio: "00:00", fim: "23:59" };
  if (dia.enabled === false) return null;
  return { inicio: dia.start ?? "00:00", fim: dia.end ?? "23:59" };
}

/**
 * Próximo instante em que a IA atende, a partir de agora, no fuso da org.
 * Dentro do horário devolve `agora`. Varre até 8 dias; se nada abre, devolve
 * `agora` também: silenciar quem configurou tudo fechado seria pior.
 */
export function proximaAbertura(workingHours: unknown, timezone: string, agora = new Date()): Date {
  if (dentroDoHorario(workingHours, timezone, agora)) return agora;
  const DIA_MS = 24 * 60 * 60 * 1000;
  for (let dias = 0; dias <= 8; dias++) {
    const candidato = new Date(agora.getTime() + dias * DIA_MS);
    const partes = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(candidato);
    const v = (t: string) => partes.find((p) => p.type === t)?.value ?? "";
    const janela = janelaDoDia(workingHours, v("weekday").toLowerCase());
    if (!janela) continue;
    const hora = Number(v("hour")) % 24;
    const minuto = Number(v("minute"));
    if (dias === 0 && `${String(hora).padStart(2, "0")}:${v("minute")}` >= janela.inicio) continue;
    // Deslocamento do fuso nesse instante: (hora local lida como UTC) menos o instante real.
    const localComoUtc = Date.UTC(Number(v("year")), Number(v("month")) - 1, Number(v("day")), hora, minuto);
    const deslocamento = localComoUtc - Math.floor(candidato.getTime() / 60000) * 60000;
    const [hAbre, mAbre] = janela.inicio.split(":").map(Number);
    const aberturaComoUtc = Date.UTC(Number(v("year")), Number(v("month")) - 1, Number(v("day")), hAbre, mAbre);
    return new Date(aberturaComoUtc - deslocamento);
  }
  return agora;
}

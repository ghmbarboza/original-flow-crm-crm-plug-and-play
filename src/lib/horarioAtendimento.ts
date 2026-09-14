import { WEEK_DAYS, type WorkingHours } from "@/hooks/useAIConfig";

/** Ordem ISO do formato legado: 1 = segunda ... 7 = domingo. */
const DIAS_ISO = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export function horarioPadrao(): WorkingHours {
  const hours: WorkingHours = {};
  for (const day of WEEK_DAYS) {
    const weekend = day.key === "sat" || day.key === "sun";
    hours[day.key] = { enabled: !weekend, start: "09:00", end: "18:00" };
  }
  return hours;
}

/**
 * Converte o que está em `ai_messaging_config.working_hours` para o formato por
 * dia que a tela edita, SEM carregar as chaves do formato legado.
 *
 * A coluna tem default legado `{days, start, end}`. A tela mesclava esse objeto
 * com o por dia e gravava os dois juntos, e a ai-reply lia o legado primeiro:
 * o horário editado na tela era ignorado (achado de 14/09). Aqui:
 *  - com dias configurados: usa só eles (completando dias ausentes com o padrão);
 *  - só legado: traduz para por dia, para a tela mostrar o que a IA de fato usa;
 *  - vazio ou inválido: padrão.
 */
export function horarioParaTela(bruto: unknown): WorkingHours {
  const padrao = horarioPadrao();
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return padrao;
  const obj = bruto as Record<string, unknown>;

  const porDia = DIAS_ISO.filter((d) => obj[d] && typeof obj[d] === "object");
  if (porDia.length > 0) {
    const resultado = { ...padrao };
    for (const d of porDia) resultado[d] = { ...padrao[d], ...(obj[d] as object) };
    return resultado;
  }

  if (Array.isArray(obj.days)) {
    const dias = obj.days as number[];
    const inicio = typeof obj.start === "string" ? obj.start : "09:00";
    const fim = typeof obj.end === "string" ? obj.end : "18:00";
    const resultado: WorkingHours = {};
    DIAS_ISO.forEach((d, i) => {
      resultado[d] = { enabled: dias.includes(i + 1), start: inicio, end: fim };
    });
    return resultado;
  }

  return padrao;
}

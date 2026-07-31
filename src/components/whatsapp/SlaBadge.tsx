import { useEffect, useState } from "react";
import { Timer } from "lucide-react";
import { formatWaitingTime, slaStatus, type ConversationForSla, type SlaConfigLite } from "@/lib/sla";

/**
 * Cores por nível: verde dentro do SLA, âmbar em alerta, vermelho estourado.
 * Os textos são mais escuros que os tokens da marca de propósito: sobre a
 * tinta de 15% os tokens davam ~3,6:1 e o axe reprovou (auditoria de
 * 2026-07-31); estes rendem ≥ 5,5:1 sobre as respectivas tintas.
 */
const LEVEL_STYLE = {
  ok: { background: "color-mix(in srgb, #10603D 15%, transparent)", color: "#10603D" },
  warning: { background: "color-mix(in srgb, #7A3B06 15%, transparent)", color: "#7A3B06" },
  breached: { background: "color-mix(in srgb, #8F3535 15%, transparent)", color: "#8F3535" },
} as const;

const LEVEL_LABEL = {
  ok: "dentro do SLA",
  warning: "perto do limite do SLA",
  breached: "SLA estourado",
} as const;

/** Relógio compartilhado do minuto atual — um tick por minuto para todos os badges. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

interface Props {
  conversation: ConversationForSla;
  config: SlaConfigLite | null | undefined;
}

/**
 * Badge de SLA na lista do inbox (Parte 8 do Sprint 10A): timer desde a
 * mensagem do cliente que está sem resposta, colorido pelo limite de primeira
 * resposta. Some quando não há nada aguardando ou o SLA não cobre o canal.
 */
export function SlaBadge({ conversation, config }: Props) {
  const now = useNow();
  const status = slaStatus(conversation, config, now);
  if (!status) return null;

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-medium tabular-nums"
      style={LEVEL_STYLE[status.level]}
      aria-label={`Aguardando resposta há ${formatWaitingTime(status.waitingMinutes)} — ${LEVEL_LABEL[status.level]}`}
      data-testid={`sla-badge-${status.level}`}
    >
      <Timer className="h-3 w-3" strokeWidth={1.5} aria-hidden />
      {formatWaitingTime(status.waitingMinutes)}
    </span>
  );
}

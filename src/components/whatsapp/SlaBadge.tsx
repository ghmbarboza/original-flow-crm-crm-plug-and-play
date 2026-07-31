import { useEffect, useState } from "react";
import { Timer } from "lucide-react";
import { formatWaitingTime, slaStatus, type ConversationForSla, type SlaConfigLite } from "@/lib/sla";

/** Cores por nível: verde dentro do SLA, amarelo em alerta, vermelho estourado. */
const LEVEL_STYLE = {
  ok: { background: "color-mix(in srgb, var(--via-success) 15%, transparent)", color: "var(--via-success)" },
  warning: { background: "color-mix(in srgb, #b45309 15%, transparent)", color: "#b45309" },
  breached: { background: "color-mix(in srgb, var(--via-coral) 15%, transparent)", color: "var(--via-coral)" },
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

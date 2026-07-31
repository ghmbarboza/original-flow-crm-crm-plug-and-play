/**
 * Cálculo do status de SLA de uma conversa (Parte 8 do Sprint 10A).
 *
 * Lógica pura, sem I/O. O banco grava o log (first_response_at, sla_breached,
 * resolved_at — triggers da migration 10A-8); aqui vive o que o inbox mostra:
 * o timer da conversa que está esperando resposta agora, colorido pelo limite
 * de primeira resposta configurado.
 */

export interface SlaConfigLite {
  first_response_minutes: number;
  resolution_hours: number;
  alert_threshold_percent: number;
  active_channels: string[] | null;
  is_active: boolean | null;
}

export interface ConversationForSla {
  status: string;
  channel: string | null;
  created_at: string;
  last_message_at: string | null;
  first_response_at: string | null;
  unread_count: number;
  sla_breached: boolean;
}

export type SlaLevel = "ok" | "warning" | "breached";

export interface SlaStatus {
  level: SlaLevel;
  /** Minutos desde a mensagem do cliente que está aguardando resposta. */
  waitingMinutes: number;
}

/** O SLA vale para esta conversa? (config ativa e canal habilitado) */
export function slaApplies(config: SlaConfigLite | null | undefined, channel: string | null): boolean {
  if (!config || config.is_active === false) return false;
  const channels = config.active_channels ?? ["whatsapp"];
  return channels.includes(channel ?? "whatsapp");
}

/**
 * Status de SLA exibível para a conversa, ou null quando não há o que mostrar
 * (conversa fechada, SLA não se aplica, ou ninguém aguardando resposta).
 *
 * "Aguardando resposta" = tem não lidas (o cliente falou por último) ou a
 * conversa ainda não teve nenhuma resposta nossa. O relógio conta desde a
 * última mensagem — que nesses casos é do cliente.
 */
export function slaStatus(
  conversation: ConversationForSla,
  config: SlaConfigLite | null | undefined,
  now: Date,
): SlaStatus | null {
  if (conversation.status === "closed") return null;
  if (!slaApplies(config, conversation.channel)) return null;

  const waitingSince =
    conversation.unread_count > 0
      ? conversation.last_message_at
      : !conversation.first_response_at
        ? conversation.last_message_at ?? conversation.created_at
        : null;
  if (!waitingSince) return null;

  const waitingMinutes = Math.max(0, Math.floor((now.getTime() - new Date(waitingSince).getTime()) / 60_000));
  const limit = config!.first_response_minutes;
  if (limit <= 0) return null;

  const percent = (waitingMinutes / limit) * 100;
  const threshold = config!.alert_threshold_percent ?? 80;

  const level: SlaLevel = percent >= 100 ? "breached" : percent >= threshold ? "warning" : "ok";
  return { level, waitingMinutes };
}

/** "7min", "1h05", "26h" — compacto o bastante para caber na lista do inbox. */
export function formatWaitingTime(minutes: number): string {
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours >= 24) return `${hours}h`;
  const rest = minutes % 60;
  return rest > 0 ? `${hours}h${String(rest).padStart(2, "0")}` : `${hours}h`;
}

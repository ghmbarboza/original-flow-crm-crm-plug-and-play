import { toast } from "sonner";
import { CalendarClock, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  SCHEDULED_STATUS_LABEL, useCancelScheduledMessage, useScheduledMessages,
} from "@/hooks/useScheduledMessages";
import { formatDateTime } from "@/lib/format";

/**
 * Mensagens programadas do contato, na ficha. Só aparece quando há alguma —
 * uma ficha sem agendamentos não precisa de um card vazio.
 *
 * Pendentes vêm primeiro (ordem do hook: scheduled_at asc) e são canceláveis;
 * enviadas/falhas/canceladas ficam como histórico curto.
 */
export function ScheduledMessagesCard({ contactId }: { contactId: string }) {
  const { data: mensagens } = useScheduledMessages(contactId);
  const cancelar = useCancelScheduledMessage();

  if (!mensagens || mensagens.length === 0) return null;

  const handleCancel = async (id: string) => {
    try {
      await cancelar.mutateAsync({ id, contactId });
      toast.success("Agendamento cancelado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível cancelar.");
    }
  };

  return (
    <div className="via-card p-5" data-testid="scheduled-messages-card">
      <div className="mb-3 flex items-center gap-2">
        <CalendarClock className="h-5 w-5" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
        <h2 className="text-base font-medium" style={{ color: "var(--via-text-primary)" }}>
          Mensagens programadas
        </h2>
      </div>
      <ul className="space-y-2">
        {mensagens.map((m) => (
          <li key={m.id} className="flex items-start gap-3 text-sm" data-testid="scheduled-message-row">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span style={{ color: "var(--via-text-primary)" }}>{formatDateTime(m.scheduled_at)}</span>
                <Badge variant={m.status === "pending" ? "default" : m.status === "failed" ? "destructive" : "secondary"}>
                  {SCHEDULED_STATUS_LABEL[m.status] ?? m.status}
                </Badge>
                {m.pipeline_stage && (
                  <span className="text-xs" style={{ color: "var(--via-text-muted)" }}>
                    automática · etapa {m.pipeline_stage.name}
                  </span>
                )}
              </div>
              <p className="mt-0.5 line-clamp-2" style={{ color: "var(--via-text-body)" }}>{m.message}</p>
              {m.status === "failed" && m.error_msg && (
                <p className="mt-0.5 text-xs" style={{ color: "var(--via-coral)" }}>{m.error_msg}</p>
              )}
            </div>
            {m.status === "pending" && (
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 shrink-0"
                aria-label="Cancelar agendamento"
                onClick={() => handleCancel(m.id)}
              >
                <X className="h-4 w-4" strokeWidth={1.5} />
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

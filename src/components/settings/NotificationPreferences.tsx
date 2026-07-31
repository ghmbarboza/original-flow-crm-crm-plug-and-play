import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ErrorState } from "@/components/ErrorState";
import {
  useNotificationPreferences,
  useSaveNotificationPreference,
  type ChannelPrefs,
} from "@/hooks/useNotifications";

/** Eventos que geram notificação, na ordem exibida. */
const EVENTS: { type: string; label: string; description: string }[] = [
  { type: "novo_lead", label: "Novo lead", description: "Um formulário de captura gerou um lead." },
  { type: "deal_ganho", label: "Negócio ganho", description: "Um negócio foi marcado como ganho." },
  { type: "deal_perdido", label: "Negócio perdido", description: "Um negócio foi marcado como perdido." },
  { type: "tarefa_atribuida", label: "Tarefa atribuída", description: "Uma tarefa foi atribuída a você." },
  { type: "tarefa_vencendo", label: "Tarefa vencendo", description: "Uma tarefa sua está próxima do prazo." },
  { type: "ia_acionou_humano", label: "IA acionou humano", description: "A IA transferiu uma conversa de WhatsApp para atendimento humano." },
  { type: "mensagem_whatsapp", label: "Mensagem no WhatsApp", description: "Nova mensagem numa conversa de WhatsApp." },
  { type: "email_recebido", label: "E-mail recebido", description: "Um novo e-mail chegou na caixa de entrada." },
  // Eventos operacionais de atendimento multicanal (Sprint 8).
  {
    type: "conversa_sem_agente",
    label: "Conversa sem agente",
    description: "Uma conversa nova entrou e nenhum agente do canal estava disponível.",
  },
  {
    type: "conversa_sem_resposta",
    label: "Conversa sem resposta",
    description: "Uma conversa passou do tempo tolerado sem resposta da equipe.",
  },
  {
    type: "agente_no_limite",
    label: "Agente no limite",
    description: "Um agente atingiu o máximo de conversas configurado para o canal.",
  },
  // Sprint 10A — detecção de intenção de compra.
  {
    type: "intencao_compra",
    label: "Intenção de compra",
    description: "Um cliente usou palavras que indicam intenção de compra numa conversa.",
  },
  // Sprint 10A — agendamento via Cal.com.
  {
    type: "agendamento_confirmado",
    label: "Reunião agendada",
    description: "Um contato confirmou uma reunião pelo link de agendamento.",
  },
  // Sprint 10B — controle de estoque.
  {
    type: "estoque_baixo",
    label: "Estoque baixo",
    description: "Um produto ficou abaixo do estoque mínimo após uma venda.",
  },
];

const CHANNELS: { key: keyof ChannelPrefs; label: string }[] = [
  { key: "channel_in_app", label: "No app" },
  { key: "channel_email", label: "E-mail" },
  { key: "channel_whatsapp", label: "WhatsApp" },
];

const DEFAULTS: ChannelPrefs = {
  channel_in_app: true,
  channel_email: false,
  channel_whatsapp: false,
};

export default function NotificationPreferences() {
  const { data: prefs, isLoading, error } = useNotificationPreferences();
  const save = useSaveNotificationPreference();

  const currentFor = (eventType: string): ChannelPrefs => {
    const row = (prefs ?? []).find((p) => p.event_type === eventType);
    if (!row) return DEFAULTS;
    return {
      channel_in_app: row.channel_in_app,
      channel_email: row.channel_email,
      channel_whatsapp: row.channel_whatsapp,
    };
  };

  const toggle = async (eventType: string, channel: keyof ChannelPrefs, value: boolean) => {
    const next = { ...currentFor(eventType), [channel]: value };
    try {
      await save.mutateAsync({ eventType, ...next });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível salvar a preferência.");
    }
  };

  if (error) return <ErrorState title="Não foi possível carregar as preferências" error={error} />;

  return (
    <div className="via-card overflow-hidden p-0">
      <div className="hidden grid-cols-[1fr_auto] items-center gap-6 border-b px-5 py-2.5 sm:grid">
        <span className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--via-text-muted)" }}>
          Evento
        </span>
        <div className="flex gap-6">
          {CHANNELS.map((c) => (
            <span
              key={c.key}
              className="w-14 text-center text-xs font-medium uppercase tracking-wide"
              style={{ color: "var(--via-text-muted)" }}
            >
              {c.label}
            </span>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3 p-5">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <ul className="divide-y">
          {EVENTS.map((ev) => {
            const cur = currentFor(ev.type);
            return (
              <li
                key={ev.type}
                className="grid grid-cols-1 gap-3 px-5 py-3.5 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-6"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
                    {ev.label}
                  </p>
                  <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
                    {ev.description}
                  </p>
                </div>
                <div className="flex gap-6">
                  {CHANNELS.map((c) => (
                    <div key={c.key} className="flex w-14 justify-center">
                      <Switch
                        checked={cur[c.key]}
                        onCheckedChange={(v) => toggle(ev.type, c.key, v)}
                        aria-label={`${ev.label} — ${c.label}`}
                      />
                    </div>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

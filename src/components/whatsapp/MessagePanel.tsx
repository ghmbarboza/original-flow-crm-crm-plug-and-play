import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowRightLeft, Bot, CalendarClock, CheckCheck, Flag, Link2, MessageCircle, Send, StickyNote, UserCheck, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { WhatsAppStatusBadge } from "@/components/whatsapp/WhatsAppStatusBadge";
import { ChannelBadge } from "@/components/whatsapp/ChannelBadge";
import { LinkContactDialog } from "@/components/whatsapp/LinkContactDialog";
import { ReportAIResponseDialog } from "@/components/whatsapp/ReportAIResponseDialog";
import { TransferDialog } from "@/components/whatsapp/TransferDialog";
import { QuickReplyPicker, type QuickReplyPickerHandle } from "@/components/whatsapp/QuickReplyPicker";
import { AudioMessage } from "@/components/whatsapp/AudioMessage";
import { ScheduleMessageDialog } from "@/components/contacts/ScheduleMessageDialog";
import { aplicarVariaveis, type QuickReply } from "@/hooks/useQuickReplies";
import {
  conversationName, useMarkRead, useMessages, useSendMessage,
  useUpdateConversation, type Conversation, type Message,
} from "@/hooks/useConversations";
import type { WhatsAppProvider } from "@/hooks/useWhatsAppConfig";
import { useAuth } from "@/hooks/useAuth";
import { formatDateTime } from "@/lib/format";
import {
  useCancelScheduledMessage, useScheduledMessages,
} from "@/hooks/useScheduledMessages";

function MessageBubble({
  message,
  onReport,
}: {
  message: Message;
  /** Ausente quando o usuário não pode reportar (não é admin nem gestor). */
  onReport?: (messageId: string) => void;
}) {
  const outbound = message.direction === "outbound";
  const audio = message.type === "audio";

  if (message.is_internal_note) {
    return (
      <div className="flex justify-center">
        <div
          className="max-w-[80%] rounded-lg px-3 py-2 text-sm"
          style={{ background: "var(--via-surface)", color: "var(--via-text-body)" }}
        >
          <p className="mb-0.5 flex items-center gap-1 text-xs font-medium" style={{ color: "var(--via-text-muted)" }}>
            <StickyNote className="h-3 w-3" strokeWidth={1.5} />
            Nota interna
          </p>
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className={`group flex items-center gap-1.5 ${outbound ? "justify-end" : "justify-start"}`}>
      {/* Reportar fica antes da bolha em mensagem outbound, para não empurrar o
          texto. Aparece no hover: presente o tempo todo viraria ruído visual. */}
      {message.is_from_ai && onReport && (
        <button
          type="button"
          data-testid="report-ai-message"
          onClick={() => onReport(message.id)}
          title="Reportar esta resposta"
          aria-label="Reportar esta resposta da IA"
          className="shrink-0 opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100"
          style={{ color: "var(--via-text-muted)" }}
        >
          <Flag className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
      )}
      <div
        className="max-w-[75%] space-y-1 rounded-2xl px-3 py-2"
        style={
          outbound
            ? { background: "var(--via-navy)", color: "var(--via-white)" }
            : { background: "var(--via-surface)", color: "var(--via-text-primary)" }
        }
      >
        {message.is_from_ai && (
          <p
            className="flex items-center gap-1 text-xs font-medium"
            style={{ color: outbound ? "rgba(255,255,255,0.75)" : "var(--via-text-muted)" }}
          >
            <Bot className="h-3 w-3" strokeWidth={1.5} />
            IA
          </p>
        )}
        {audio && (message.media_url
          ? <AudioMessage path={message.media_url} escuro={outbound} />
          : (
            // Áudio sem arquivo: acontece na conversa de demonstração quando não
            // há chave do ElevenLabs para gerar o exemplo, e em falha de download
            // do provedor. A transcrição abaixo é o que a IA de fato leu.
            <p
              className="text-xs"
              style={{ color: outbound ? "rgba(255,255,255,0.75)" : "var(--via-text-muted)" }}
            >
              Áudio indisponível
            </p>
          ))}
        {message.content && (
          <div>
            {/* Em áudio, o texto é a transcrição (recebido) ou o roteiro falado
                (enviado pela IA) — rotulado para não passar por mensagem escrita. */}
            {audio && (
              <p
                className="text-[10px] font-medium uppercase tracking-wide"
                style={{ color: outbound ? "rgba(255,255,255,0.7)" : "var(--via-text-muted)" }}
              >
                Transcrição
              </p>
            )}
            <p
              className="whitespace-pre-wrap text-sm"
              style={audio ? { opacity: 0.8, fontSize: "0.8125rem" } : undefined}
            >
              {message.content}
            </p>
          </div>
        )}
        {audio && !message.content && (
          <p
            className="text-xs italic"
            style={{ color: outbound ? "rgba(255,255,255,0.75)" : "var(--via-text-muted)" }}
          >
            Sem transcrição
          </p>
        )}
        <p
          className="flex items-center justify-end gap-1 text-[10px]"
          style={{ color: outbound ? "rgba(255,255,255,0.7)" : "var(--via-text-muted)" }}
        >
          {formatDateTime(message.sent_at)}
          {outbound && message.status === "read" && <CheckCheck className="h-3 w-3" strokeWidth={1.5} />}
        </p>
      </div>
    </div>
  );
}

interface Props {
  conversation: Conversation;
  provider: WhatsAppProvider;
}

export function MessagePanel({ conversation, provider }: Props) {
  const { data: messages, isLoading } = useMessages(conversation.id);

  // Só as pendentes: enviada já aparece como mensagem normal no fio, e repetir
  // aqui mostraria a mesma coisa duas vezes.
  const { data: agendadas } = useScheduledMessages(conversation.contact?.id ?? null);
  const agendadasPendentes = (agendadas ?? []).filter((a) => a.status === "pending");
  const cancelarAgendamento = useCancelScheduledMessage();

  const cancelarAgendada = async (id: string) => {
    const contactId = conversation.contact?.id;
    if (!contactId) return;
    try {
      await cancelarAgendamento.mutateAsync({ id, contactId });
      toast.success("Envio cancelado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível cancelar.");
    }
  };
  const sendMessage = useSendMessage();
  const updateConversation = useUpdateConversation();
  const markRead = useMarkRead();

  const [text, setText] = useState("");
  const [isNote, setIsNote] = useState(false);
  // Respostas rápidas: "/..." no início do composer abre a lista; o handler de
  // teclado vem do picker via ref para as setas/Enter não enviarem a mensagem.
  const [pickerFechado, setPickerFechado] = useState(false);
  const pickerRef = useRef<QuickReplyPickerHandle | null>(null);
  const pickerAberto = !isNote && !pickerFechado && text.startsWith("/") && !text.includes("\n");
  const [transferOpen, setTransferOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [agendarOpen, setAgendarOpen] = useState(false);
  const [reportando, setReportando] = useState<string | null>(null);

  // Reportar é ação de quem cuida da qualidade do atendimento, não do agente
  // que está na conversa.
  const { isAdmin, profile } = useAuth();
  const podeReportar = isAdmin || profile?.crm_role === "gerente" || profile?.crm_role === "diretor";
  const bottomRef = useRef<HTMLDivElement>(null);

  // Ao abrir/atualizar, zera não lidas e rola para o fim.
  useEffect(() => {
    if (conversation.unread_count > 0) markRead.mutate(conversation.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id]);

  useEffect(() => {
    // block:"nearest" mantém o auto-scroll dentro do histórico. Sem ele o
    // navegador rola o ancestral rolável mais próximo — que antes era a página.
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages]);

  const usarResposta = (r: QuickReply) => {
    // O texto substitui o campo inteiro, com as variáveis do contato resolvidas.
    // O agente ainda revisa antes de enviar — nada vai automático.
    setText(aplicarVariaveis(r.message, {
      "contact.first_name": conversation.contact?.first_name,
      "contact.last_name": conversation.contact?.last_name,
      "contact.name": conversation.contact
        ? [conversation.contact.first_name, conversation.contact.last_name].filter(Boolean).join(" ")
        : conversation.channel_contact_name,
    }));
    setPickerFechado(true);
  };

  const handleSend = async () => {
    const content = text.trim();
    if (!content) return;
    try {
      await sendMessage.mutateAsync({
        conversationId: conversation.id,
        content,
        provider,
        internalNote: isNote,
      });
      setText("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar a mensagem.");
    }
  };

  const changeStatus = async (status: Conversation["status"]) => {
    try {
      await updateConversation.mutateAsync({ id: conversation.id, status });
      toast.success(
        status === "human_takeover"
          ? "Você assumiu a conversa."
          : status === "ai_active"
            ? "Conversa devolvida para a IA."
            : "Conversa encerrada.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível atualizar a conversa.");
    }
  };

  const name = conversationName(conversation);
  const tags = Array.isArray(conversation.tags) ? (conversation.tags as string[]) : [];

  return (
    <div className="flex h-full flex-col">
      {/* Cabeçalho com status sempre visível + ações */}
      <div className="shrink-0 border-b p-3" style={{ borderColor: "var(--via-border)" }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate font-medium" style={{ color: "var(--via-text-primary)" }}>{name}</p>
              <ChannelBadge channel={conversation.channel} showLabel />
              <WhatsAppStatusBadge status={conversation.status} />
            </div>
            <div className="flex items-center gap-2 text-xs" style={{ color: "var(--via-text-muted)" }}>
              <span className="truncate">{conversation.phone_number}</span>
              {!conversation.contact && (
                <button
                  type="button"
                  onClick={() => setLinkOpen(true)}
                  className="inline-flex shrink-0 items-center gap-1 underline hover:no-underline"
                >
                  <Link2 className="h-3 w-3" strokeWidth={1.5} />
                  Vincular contato
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {conversation.status === "ai_active" && (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => changeStatus("human_takeover")}>
                <UserCheck className="h-3.5 w-3.5" strokeWidth={1.5} />
                Assumir
              </Button>
            )}
            {conversation.status === "human_takeover" && (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => changeStatus("ai_active")}>
                <Bot className="h-3.5 w-3.5" strokeWidth={1.5} />
                Devolver para IA
              </Button>
            )}
            {conversation.status !== "closed" && (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setTransferOpen(true)}>
                <ArrowRightLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
                Transferir
              </Button>
            )}
            {conversation.status !== "closed" && (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => changeStatus("closed")}>
                <X className="h-3.5 w-3.5" strokeWidth={1.5} />
                Encerrar
              </Button>
            )}
          </div>
        </div>

        {tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded-full px-2 py-0.5 text-xs"
                style={{ background: "var(--via-surface)", color: "var(--via-text-body)" }}
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Histórico: única parte que rola. Cabeçalho e composer ficam fixos. */}
      <div className="via-scroll min-h-0 flex-1 space-y-2 p-4">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-1/2" />
            <Skeleton className="ml-auto h-12 w-1/2" />
          </div>
        ) : (messages ?? []).length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <MessageCircle className="mb-2 h-6 w-6" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
            <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>
              Nenhuma mensagem nesta conversa ainda.
            </p>
          </div>
        ) : (
          (messages ?? []).map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              onReport={podeReportar ? setReportando : undefined}
            />
          ))
        )}

        {/* Mensagens programadas ainda por enviar.
            Depois de agendar, o único sinal era um toast que sumia em segundos:
            a pessoa não tinha como saber se já havia algo na fila para aquele
            contato, e reagendava. Ficam no fim do fio, no mesmo formato da nota
            interna, porque também não são mensagem trocada — são combinado
            interno, e ainda dá para desfazer. */}
        {agendadasPendentes.map((agendada) => (
          <div key={agendada.id} className="flex justify-center" data-testid="mensagem-agendada">
            <div
              className="max-w-[80%] rounded-lg border border-dashed px-3 py-2 text-sm"
              style={{ borderColor: "var(--via-border)", color: "var(--via-text-body)" }}
            >
              <p className="mb-0.5 flex flex-wrap items-center gap-1 text-xs font-medium" style={{ color: "var(--via-text-muted)" }}>
                <CalendarClock className="h-3 w-3" strokeWidth={1.5} />
                Agendada para {formatDateTime(agendada.scheduled_at)}
              </p>
              <p className="whitespace-pre-wrap">{agendada.message}</p>
              <button
                type="button"
                className="mt-1 text-xs underline underline-offset-2"
                style={{ color: "var(--via-text-muted)" }}
                onClick={() => cancelarAgendada(agendada.id)}
                disabled={cancelarAgendamento.isPending}
              >
                Cancelar envio
              </button>
            </div>
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      {/* Aviso de demonstração: o composer parece igual ao real, então sem este
          aviso a pessoa acredita que mandou mensagem para o cliente. */}
      {conversation.is_demo && (
        <div
          className="shrink-0 border-t px-4 py-2 text-center text-xs"
          data-testid="inbox-aviso-demo"
          style={{
            borderColor: "var(--via-border)",
            background: "var(--via-surface)",
            color: "var(--via-text-muted)",
          }}
        >
          Conversa de demonstração — envios são simulados e nada sai para o cliente.
        </div>
      )}

      {/* Composer */}
      {conversation.status === "closed" ? (
        <div className="shrink-0 border-t p-4 text-center" style={{ borderColor: "var(--via-border)" }}>
          <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>
            Conversa encerrada.{" "}
            <button
              type="button"
              className="underline"
              onClick={() => changeStatus("human_takeover")}
            >
              Reabrir para responder
            </button>
          </p>
        </div>
      ) : (
        <div className="shrink-0 border-t p-3" style={{ borderColor: "var(--via-border)" }}>
          <div className="mb-2 flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={isNote ? "default" : "outline"}
              className="gap-1.5"
              onClick={() => setIsNote((v) => !v)}
            >
              <StickyNote className="h-3.5 w-3.5" strokeWidth={1.5} />
              Nota interna
            </Button>
            {/* Agendar exige contato do CRM: a mensagem programada pertence ao
                contato, e conversa sem vínculo não tem onde pendurá-la. */}
            {conversation.contact && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => setAgendarOpen(true)}
                data-testid="inbox-agendar-mensagem"
              >
                <CalendarClock className="h-3.5 w-3.5" strokeWidth={1.5} />
                Agendar
              </Button>
            )}
            {isNote && (
              <span className="text-xs" style={{ color: "var(--via-text-muted)" }}>
                Visível só para a equipe — não vai ao cliente.
              </span>
            )}
          </div>
          <div className="relative flex items-end gap-2">
            {pickerAberto && (
              <QuickReplyPicker
                busca={text.slice(1)}
                onSelect={usarResposta}
                onRegister={(h) => { pickerRef.current = h; }}
              />
            )}
            <Textarea
              rows={2}
              placeholder={isNote ? "Escreva uma nota interna…" : "Escreva uma mensagem… ( / para respostas rápidas )"}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                // Reabrir a lista ao digitar de novo depois de um Esc.
                if (!e.target.value.startsWith("/")) setPickerFechado(false);
              }}
              onKeyDown={(e) => {
                if (pickerAberto) {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setPickerFechado(true);
                    return;
                  }
                  if (pickerRef.current?.handleKey(e)) {
                    e.preventDefault();
                    return;
                  }
                }
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              className="flex-1 resize-none"
            />
            <Button
              onClick={handleSend}
              disabled={sendMessage.isPending || !text.trim()}
              className="gap-1.5"
            >
              <Send className="h-4 w-4" strokeWidth={1.5} />
              {isNote ? "Anotar" : "Enviar"}
            </Button>
          </div>
        </div>
      )}

      <TransferDialog
        conversationId={transferOpen ? conversation.id : null}
        onOpenChange={setTransferOpen}
      />
      <LinkContactDialog
        conversation={linkOpen ? conversation : null}
        onOpenChange={setLinkOpen}
      />
      {conversation.contact && (
        <ScheduleMessageDialog
          open={agendarOpen}
          onOpenChange={setAgendarOpen}
          contactId={conversation.contact.id}
          conversationId={conversation.id}
        />
      )}
    </div>
  );
}

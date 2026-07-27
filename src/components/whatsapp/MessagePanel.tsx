import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowRightLeft, Bot, CheckCheck, Link2, MessageCircle, Send, StickyNote, UserCheck, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { WhatsAppStatusBadge } from "@/components/whatsapp/WhatsAppStatusBadge";
import { ChannelBadge } from "@/components/whatsapp/ChannelBadge";
import { LinkContactDialog } from "@/components/whatsapp/LinkContactDialog";
import { TransferDialog } from "@/components/whatsapp/TransferDialog";
import {
  conversationName, useMarkRead, useMessages, useSendMessage,
  useUpdateConversation, type Conversation, type Message,
} from "@/hooks/useConversations";
import type { WhatsAppProvider } from "@/hooks/useWhatsAppConfig";
import { formatDateTime } from "@/lib/format";

function MessageBubble({ message }: { message: Message }) {
  const outbound = message.direction === "outbound";

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
    <div className={outbound ? "flex justify-end" : "flex justify-start"}>
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
        <p className="whitespace-pre-wrap text-sm">{message.content}</p>
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
  const sendMessage = useSendMessage();
  const updateConversation = useUpdateConversation();
  const markRead = useMarkRead();

  const [text, setText] = useState("");
  const [isNote, setIsNote] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
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
          (messages ?? []).map((message) => <MessageBubble key={message.id} message={message} />)
        )}
        <div ref={bottomRef} />
      </div>

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
            {isNote && (
              <span className="text-xs" style={{ color: "var(--via-text-muted)" }}>
                Visível só para a equipe — não vai ao cliente.
              </span>
            )}
          </div>
          <div className="flex items-end gap-2">
            <Textarea
              rows={2}
              placeholder={isNote ? "Escreva uma nota interna…" : "Escreva uma mensagem…"}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
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
    </div>
  );
}

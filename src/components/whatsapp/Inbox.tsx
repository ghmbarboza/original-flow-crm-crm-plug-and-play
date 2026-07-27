import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { ConversationList } from "@/components/whatsapp/ConversationList";
import { MessagePanel } from "@/components/whatsapp/MessagePanel";
import { useConversations, type Conversation } from "@/hooks/useConversations";
import type { WhatsAppProvider } from "@/hooks/useWhatsAppConfig";

/** Inbox unificado: lista à esquerda, painel de mensagens à direita. */
export function Inbox({ provider }: { provider: WhatsAppProvider }) {
  const { data: conversations, isLoading, error } = useConversations();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Reusa o objeto da lista (já traz contato/status atualizados via realtime).
  const selected = (conversations ?? []).find((c) => c.id === selectedId) ?? null;

  const handleSelect = (conversation: Conversation) => setSelectedId(conversation.id);

  if (error) {
    return (
      <div className="via-card p-4">
        <p className="text-sm font-medium text-via-coral">Não foi possível carregar as conversas</p>
        <p className="text-sm" style={{ color: "var(--via-text-body)" }}>
          {error instanceof Error ? error.message : "Erro desconhecido."} Recarregue a página.
        </p>
      </div>
    );
  }

  return (
    <div
      className="via-card grid overflow-hidden md:grid-cols-[minmax(280px,340px)_1fr]"
      style={{ height: "calc(100vh - 8rem)" }}
    >
      {/* min-h-0 nos filhos do grid: sem isso o min-height:auto impede que a
          coluna encolha abaixo do conteúdo, e o scroll interno nunca ativa. */}
      <div className="min-h-0 overflow-hidden border-r" style={{ borderColor: "var(--via-border)" }}>
        <ConversationList
          conversations={conversations ?? []}
          isLoading={isLoading}
          selectedId={selectedId}
          onSelect={handleSelect}
        />
      </div>

      <div className="hidden min-h-0 overflow-hidden md:block">
        {selected ? (
          <MessagePanel conversation={selected} provider={provider} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <MessageCircle className="mb-3 h-8 w-8" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
            <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
              Selecione uma conversa
            </p>
            <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>
              Escolha uma conversa à esquerda para ver o histórico e responder.
            </p>
          </div>
        )}
      </div>

      {/* Mobile: quando há seleção, o painel ocupa a tela toda. */}
      {selected && (
        <div className="min-h-0 overflow-hidden md:hidden">
          <MessagePanel conversation={selected} provider={provider} />
        </div>
      )}
    </div>
  );
}

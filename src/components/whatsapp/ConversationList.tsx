import { useMemo, useState } from "react";
import { MessageCircle, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { WhatsAppStatusBadge } from "@/components/whatsapp/WhatsAppStatusBadge";
import { conversationName, type Conversation } from "@/hooks/useConversations";
import { formatDateTime } from "@/lib/format";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
}

interface Props {
  conversations: Conversation[];
  isLoading: boolean;
  selectedId: string | null;
  onSelect: (conversation: Conversation) => void;
}

export function ConversationList({ conversations, isLoading, selectedId, onSelect }: Props) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return conversations;
    return conversations.filter((c) => {
      const haystack = [conversationName(c), c.phone_number, c.last_message_preview]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [conversations, search]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-3" style={{ borderColor: "var(--via-border)" }}>
        <div className="relative">
          <Search
            className="absolute left-2.5 top-2.5 h-4 w-4"
            strokeWidth={1.5}
            style={{ color: "var(--via-text-muted)" }}
          />
          <Input
            className="pl-8"
            placeholder="Buscar conversas"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="space-y-2 p-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center">
            <MessageCircle className="mx-auto mb-2 h-6 w-6" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
            <p className="text-sm" style={{ color: "var(--via-text-muted)" }}>
              {search.trim() ? "Nenhuma conversa encontrada." : "Nenhuma conversa ainda."}
            </p>
          </div>
        ) : (
          <ul>
            {filtered.map((conversation) => {
              const name = conversationName(conversation);
              const active = conversation.id === selectedId;
              return (
                <li key={conversation.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(conversation)}
                    className="flex w-full items-start gap-3 border-b p-3 text-left transition-colors"
                    style={{
                      borderColor: "var(--via-border)",
                      background: active ? "var(--via-surface)" : "transparent",
                    }}
                  >
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-medium"
                      style={{ background: "var(--via-navy)", color: "var(--via-white)" }}
                    >
                      {initials(name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
                          {name}
                        </p>
                        {conversation.last_message_at && (
                          <time className="shrink-0 text-xs" style={{ color: "var(--via-text-muted)" }}>
                            {formatDateTime(conversation.last_message_at)}
                          </time>
                        )}
                      </div>
                      <p className="truncate text-sm" style={{ color: "var(--via-text-muted)" }}>
                        {conversation.last_message_preview ?? "—"}
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        <WhatsAppStatusBadge status={conversation.status} />
                        {conversation.unread_count > 0 && (
                          <span
                            className="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-medium"
                            style={{ background: "var(--via-success)", color: "var(--via-white)" }}
                          >
                            {conversation.unread_count}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

import { useMemo, useState } from "react";
import { MessageCircle, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { WhatsAppStatusBadge } from "@/components/whatsapp/WhatsAppStatusBadge";
import { ChannelBadge, channelMeta } from "@/components/whatsapp/ChannelBadge";
import { SlaBadge } from "@/components/whatsapp/SlaBadge";
import { conversationName, type Conversation } from "@/hooks/useConversations";
import { rotuloDaConta, type ContaDeCanal } from "@/hooks/useChannelAccounts";
import { useSlaConfig } from "@/hooks/useSla";
import { formatDateTime } from "@/lib/format";
import { avatarAindaValido } from "@/lib/avatar";

const TODOS = "__all__";
/** Conversas anteriores às contas de canal (sem número gravado). */
const SEM_NUMERO = "__none__";

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
}

interface Chip {
  valor: string;
  label: string;
  icone?: string;
}

interface Props {
  conversations: Conversation[];
  /** Contas de canal da org: com mais de uma, os chips filtram por número. */
  contas?: ContaDeCanal[];
  isLoading: boolean;
  selectedId: string | null;
  onSelect: (conversation: Conversation) => void;
  /** Texto do estado vazio quando um recorte (ex.: modo foco) explica a ausência. */
  emptyHint?: string;
}

export function ConversationList({ conversations, contas = [], isLoading, selectedId, onSelect, emptyHint }: Props) {
  const [search, setSearch] = useState("");
  const [filtro, setFiltro] = useState<string>(TODOS);
  const { data: slaConfig } = useSlaConfig();

  /**
   * Chips de filtro. Com mais de uma conta, filtram por NÚMERO (é o que separa
   * "comercial" de "suporte" quando os dois são WhatsApp); senão, por canal,
   * como antes. Só aparecem quando há mais de uma opção.
   */
  const porConta = contas.length > 1;
  const chips = useMemo<Chip[]>(() => {
    if (porConta) {
      const usadas = new Set(conversations.map((c) => c.channel_account_id));
      const lista: Chip[] = contas
        .filter((conta) => usadas.has(conta.id))
        .map((conta) => ({ valor: conta.id, label: rotuloDaConta(conta), icone: conta.channel }));
      if (usadas.has(null)) lista.push({ valor: SEM_NUMERO, label: "Sem número" });
      return lista;
    }
    const canais = new Set<string>();
    conversations.forEach((c) => canais.add(c.channel ?? "whatsapp"));
    return [...canais].map((ch) => ({ valor: ch, label: channelMeta(ch).label, icone: ch }));
  }, [conversations, contas, porConta]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return conversations.filter((c) => {
      if (filtro !== TODOS) {
        if (porConta) {
          const alvo = filtro === SEM_NUMERO ? null : filtro;
          if (c.channel_account_id !== alvo) return false;
        } else if ((c.channel ?? "whatsapp") !== filtro) {
          return false;
        }
      }
      if (!term) return true;
      const haystack = [conversationName(c), c.phone_number, c.last_message_preview]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [conversations, search, filtro, porConta]);

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 space-y-2 border-b p-3" style={{ borderColor: "var(--via-border)" }}>
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

        {/* Chips rolam na horizontal em vez de quebrar linha: com muitos canais
            a quebra empurrava a lista de conversas para baixo. */}
        {chips.length > 1 && (
          <div
            className="via-scroll-x flex flex-nowrap gap-1.5 pb-1"
            data-testid={porConta ? "account-chips" : "channel-chips"}
          >
            {[{ valor: TODOS, label: "Todos" } as Chip, ...chips].map((chip) => {
              const activeChip = filtro === chip.valor;
              const Icon = chip.icone ? channelMeta(chip.icone).Icon : null;
              return (
                <button
                  key={chip.valor}
                  type="button"
                  onClick={() => setFiltro(chip.valor)}
                  className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs transition-colors"
                  style={
                    activeChip
                      ? { background: "var(--via-navy)", color: "var(--via-white)" }
                      : { background: "var(--via-surface)", color: "var(--via-text-body)" }
                  }
                >
                  {Icon && <Icon className="h-3 w-3" strokeWidth={1.5} />}
                  {chip.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="via-scroll min-h-0 flex-1">
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
              {search.trim() ? "Nenhuma conversa encontrada." : emptyHint ?? "Nenhuma conversa ainda."}
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
                    <span className="relative shrink-0">
                      {/* A foto vem do perfil do WhatsApp e pode faltar (contato
                          sem foto, ou URL do CDN já vencida). As iniciais são o
                          estado normal do avatar, não um fallback de erro — por
                          isso ficam por baixo, e a imagem só cobre quando carrega. */}
                      <span
                        className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-full text-xs font-medium"
                        style={{ background: "var(--via-navy)", color: "var(--via-white)" }}
                      >
                        {initials(name)}
                        {avatarAindaValido(conversation.contact?.avatar_url) && (
                          <img
                            src={conversation.contact!.avatar_url!}
                            alt=""
                            aria-hidden
                            loading="lazy"
                            className="absolute inset-0 h-full w-full object-cover"
                            onError={(e) => {
                              // URL vencida: some com a imagem e deixa as iniciais.
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        )}
                      </span>
                      {/* Badge do canal no canto do avatar. */}
                      <span className="absolute -bottom-1 -right-1 rounded-full border-2 border-white">
                        <ChannelBadge channel={conversation.channel} />
                      </span>
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
                        <SlaBadge conversation={conversation} config={slaConfig} />
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

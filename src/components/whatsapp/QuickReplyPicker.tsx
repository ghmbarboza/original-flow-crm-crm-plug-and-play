import { useEffect, useMemo, useRef, useState } from "react";
import { MessageSquareText } from "lucide-react";
import { filtrarRespostas, useQuickReplies, type QuickReply } from "@/hooks/useQuickReplies";

/**
 * Lista de respostas rápidas ancorada acima do composer.
 *
 * Aparece quando o texto do composer começa com `/`; o que vier depois filtra.
 * A navegação por teclado (setas + Enter + Esc) é tratada AQUI, mas o evento
 * nasce no Textarea do composer — o pai repassa via ref imperativa simples
 * (onKeyDown chama `handleKey` e usa o retorno para decidir se envia).
 */
export interface QuickReplyPickerHandle {
  /** Devolve true se o evento foi consumido pela lista (não enviar mensagem). */
  handleKey: (e: React.KeyboardEvent) => boolean;
}

export function QuickReplyPicker({
  busca,
  onSelect,
  onRegister,
}: {
  /** Texto do composer a partir da `/` (sem ela). */
  busca: string;
  onSelect: (r: QuickReply) => void;
  /** Registra o handler de teclado no pai a cada render relevante. */
  onRegister: (h: QuickReplyPickerHandle | null) => void;
}) {
  const { data: respostas } = useQuickReplies();
  const [ativo, setAtivo] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const visiveis = useMemo(
    () => filtrarRespostas((respostas ?? []).filter((r) => r.is_active), busca).slice(0, 8),
    [respostas, busca],
  );

  // O item ativo segue a lista filtrada; fora dela, volta ao topo.
  useEffect(() => {
    setAtivo((a) => Math.min(a, Math.max(0, visiveis.length - 1)));
  }, [visiveis.length]);

  useEffect(() => {
    listRef.current?.children[ativo]?.scrollIntoView({ block: "nearest" });
  }, [ativo]);

  useEffect(() => {
    onRegister({
      handleKey: (e) => {
        if (visiveis.length === 0) return false;
        if (e.key === "ArrowDown") {
          setAtivo((a) => (a + 1) % visiveis.length);
          return true;
        }
        if (e.key === "ArrowUp") {
          setAtivo((a) => (a - 1 + visiveis.length) % visiveis.length);
          return true;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          onSelect(visiveis[ativo]);
          return true;
        }
        return false;
      },
    });
    return () => onRegister(null);
  }, [visiveis, ativo, onSelect, onRegister]);

  if (visiveis.length === 0) return null;

  return (
    <div
      className="via-card absolute bottom-full left-0 z-20 mb-1 w-full max-w-md overflow-hidden p-0"
      data-testid="quick-reply-picker"
    >
      <p
        className="flex items-center gap-1.5 border-b px-3 py-2 text-xs font-medium"
        style={{ color: "var(--via-text-muted)", borderColor: "var(--via-border)" }}
      >
        <MessageSquareText className="h-3.5 w-3.5" strokeWidth={1.5} />
        Respostas rápidas — Enter usa, Esc fecha
      </p>
      <ul ref={listRef} className="max-h-56 overflow-y-auto" role="listbox" aria-label="Respostas rápidas">
        {visiveis.map((r, i) => (
          <li key={r.id} role="option" aria-selected={i === ativo}>
            <button
              type="button"
              className="flex w-full items-baseline gap-2 px-3 py-2 text-left text-sm"
              style={i === ativo ? { background: "var(--via-surface)" } : undefined}
              onMouseEnter={() => setAtivo(i)}
              onClick={() => onSelect(r)}
              data-testid={`quick-reply-${r.shortcut}`}
            >
              <span className="shrink-0 font-medium" style={{ color: "var(--via-text-primary)" }}>
                /{r.shortcut}
              </span>
              <span className="truncate" style={{ color: "var(--via-text-muted)" }}>
                {r.message}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

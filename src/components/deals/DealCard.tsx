import { Building2, GripVertical, User } from "lucide-react";
import { contactName, type Deal } from "@/hooks/useDeals";
import { formatCurrency } from "@/lib/format";

interface Props {
  deal: Deal;
  /** Abre o preview rápido (drawer). */
  onClick: (deal: Deal) => void;
  onDragStart: (deal: Deal) => void;
  onDragEnd: () => void;
  isDragging: boolean;
}

/** Card de deal no Kanban. Arrastável (HTML5 DnD nativo, sem dependência extra). */
export function DealCard({ deal, onClick, onDragStart, onDragEnd, isDragging }: Props) {
  const name = contactName(deal.contact);

  return (
    <div
      draggable
      data-testid="deal-card"
      data-deal-id={deal.id}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        // Alguns navegadores só iniciam o drag se houver payload.
        e.dataTransfer.setData("text/plain", deal.id);
        onDragStart(deal);
      }}
      onDragEnd={onDragEnd}
      onClick={() => onClick(deal)}
      className="via-card group cursor-pointer space-y-2 p-3 transition-opacity"
      style={{ opacity: isDragging ? 0.4 : 1 }}
    >
      <div className="flex items-start gap-1.5">
        <GripVertical
          className="mt-0.5 h-4 w-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
          strokeWidth={1.5}
          style={{ color: "var(--via-text-muted)" }}
          aria-hidden
        />
        <p className="min-w-0 flex-1 text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
          {deal.title}
        </p>
      </div>

      <p className="text-sm font-semibold tabular-nums" style={{ color: "var(--via-text-primary)" }}>
        {formatCurrency(deal.value, deal.currency)}
      </p>

      <div className="space-y-1">
        {name && (
          <p className="flex items-center gap-1.5 text-xs" style={{ color: "var(--via-text-muted)" }}>
            <User className="h-3 w-3" strokeWidth={1.5} />
            <span className="truncate">{name}</span>
          </p>
        )}
        {deal.company?.name && (
          <p className="flex items-center gap-1.5 text-xs" style={{ color: "var(--via-text-muted)" }}>
            <Building2 className="h-3 w-3" strokeWidth={1.5} />
            <span className="truncate">{deal.company.name}</span>
          </p>
        )}
      </div>
    </div>
  );
}

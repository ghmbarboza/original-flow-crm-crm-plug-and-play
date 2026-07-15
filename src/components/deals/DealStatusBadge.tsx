import { VIA_DEAL_STATUS } from "@/lib/via-colors";
import type { DealStatus } from "@/hooks/useDeals";

/** Badge de status do deal (Em aberto / Ganho / Perdido), cor canônica da paleta. */
export function DealStatusBadge({ status }: { status: DealStatus }) {
  const { bg, text, label } = VIA_DEAL_STATUS[status];
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ background: bg, color: text }}
    >
      {label}
    </span>
  );
}

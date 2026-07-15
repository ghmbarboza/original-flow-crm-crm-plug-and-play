import { Activity as ActivityIcon, Clock, Mail, MessageCircle, TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useDealTimeline } from "@/hooks/useDealTimeline";
import type { TimelineItem } from "@/hooks/useContactTimeline";
import { formatDateTime } from "@/lib/format";

const KIND_ICON = {
  activity: ActivityIcon,
  email: Mail,
  whatsapp: MessageCircle,
  deal: TrendingUp,
} as const;

function TimelineEntry({ item }: { item: TimelineItem }) {
  const Icon = KIND_ICON[item.kind];
  return (
    <li className="flex gap-3">
      <div
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
        style={{ background: "var(--via-surface)" }}
      >
        <Icon className="h-3.5 w-3.5" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
      </div>
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
            {item.title}
          </p>
          <time className="shrink-0 text-xs" style={{ color: "var(--via-text-muted)" }}>
            {formatDateTime(item.at)}
          </time>
        </div>
        {item.body && (
          <p className="line-clamp-2 text-sm" style={{ color: "var(--via-text-body)" }}>
            {item.body}
          </p>
        )}
        {item.meta && (
          <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>
            {item.meta}
          </p>
        )}
      </div>
    </li>
  );
}

interface Props {
  dealId: string;
  contactId?: string | null;
}

export function DealTimeline({ dealId, contactId }: Props) {
  const { data: timeline, isLoading } = useDealTimeline(dealId, contactId);

  return (
    <div className="via-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <Clock className="h-5 w-5" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
        <h2 className="text-base font-medium" style={{ color: "var(--via-text-primary)" }}>
          Timeline
        </h2>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : (timeline ?? []).length === 0 ? (
        <p className="py-4 text-center text-sm" style={{ color: "var(--via-text-muted)" }}>
          Nada registrado ainda. Emails, atividades, notas, tarefas e mensagens deste negócio aparecem aqui em ordem cronológica.
        </p>
      ) : (
        <ul className="space-y-4">
          {(timeline ?? []).map((item) => (
            <TimelineEntry key={item.id} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}

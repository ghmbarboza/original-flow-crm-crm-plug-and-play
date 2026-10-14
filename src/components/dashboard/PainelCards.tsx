import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/** Cartão de indicador (KPI) com rótulo, valor e, opcionalmente, ícone e detalhe. */
export function KPI({
  label, value, icon: Icon, accent, detalhe,
}: {
  label: string;
  value: string;
  icon?: LucideIcon;
  accent?: string;
  /** Linha pequena abaixo do valor (ex.: "3 negócios ganhos"). */
  detalhe?: string;
}) {
  return (
    <div className="via-card flex items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>{label}</p>
        <p className="truncate text-2xl font-semibold tabular-nums" style={{ color: "var(--via-text-primary)" }}>
          {value}
        </p>
        {detalhe && <p className="text-xs" style={{ color: "var(--via-text-muted)" }}>{detalhe}</p>}
      </div>
      {Icon && (
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
          style={{ background: "var(--via-surface)", color: accent ?? "var(--via-text-muted)" }}
        >
          <Icon className="h-5 w-5" strokeWidth={1.5} />
        </span>
      )}
    </div>
  );
}

/**
 * Card com título. h-full + flex-col: numa linha do grid, os cards ficam com a
 * mesma altura e o conteúdo ocupa o espaço, em vez de cada um parar onde acaba.
 */
export function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="via-card flex h-full flex-col p-5">
      <h2 className="mb-3 text-base font-medium" style={{ color: "var(--via-text-primary)" }}>{title}</h2>
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}

/** Linha de estatística simples (rótulo à esquerda, número à direita). */
export function StatRow({ label, value, icon: Icon }: { label: string; value: number; icon: LucideIcon }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="flex items-center gap-2 text-sm" style={{ color: "var(--via-text-body)" }}>
        <Icon className="h-4 w-4" strokeWidth={1.5} style={{ color: "var(--via-text-muted)" }} />
        {label}
      </span>
      <span className="text-sm font-semibold tabular-nums" style={{ color: "var(--via-text-primary)" }}>
        {value}
      </span>
    </div>
  );
}

/** Texto de "sem dados" dentro de um card. */
export function SemDados({ children }: { children: ReactNode }) {
  return (
    <p className="py-8 text-center text-sm" style={{ color: "var(--via-text-muted)" }}>{children}</p>
  );
}

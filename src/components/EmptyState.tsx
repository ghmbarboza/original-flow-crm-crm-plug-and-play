import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Estado vazio padrão do CRM: card centralizado com ícone, título, descrição
 * opcional e uma ação primária opcional. Extraído do padrão repetido nas
 * páginas de lista (ex.: EmailTemplatesPage) para manter consistência visual.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`via-card p-10 text-center ${className ?? ""}`}>
      {Icon && (
        <Icon
          className="mx-auto mb-3 h-7 w-7"
          strokeWidth={1.5}
          style={{ color: "var(--via-text-muted)" }}
        />
      )}
      <p className="text-sm font-medium" style={{ color: "var(--via-text-primary)" }}>
        {title}
      </p>
      {description && (
        <p className="mx-auto mb-4 mt-1 max-w-md text-sm" style={{ color: "var(--via-text-muted)" }}>
          {description}
        </p>
      )}
      {action && <div className="mt-1 flex justify-center">{action}</div>}
    </div>
  );
}

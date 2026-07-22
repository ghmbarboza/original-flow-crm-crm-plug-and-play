import type { ReactNode } from "react";

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Erro desconhecido.";
}

/**
 * Estado de erro padrão do CRM: card com título em coral + mensagem derivada
 * do erro. Extraído do padrão repetido nas páginas de lista para manter
 * consistência. Aceita `error` (Error | string | unknown) ou `message` direto.
 */
export function ErrorState({
  title = "Não foi possível carregar",
  error,
  message,
  action,
}: {
  title?: string;
  error?: unknown;
  message?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="via-card p-4">
      <p className="text-sm font-medium text-via-coral">{title}</p>
      <p className="text-sm" style={{ color: "var(--via-text-body)" }}>
        {message ?? messageOf(error)}
      </p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

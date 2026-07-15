/**
 * Formatação pt-BR compartilhada. Antes cada componente instanciava seu próprio
 * `Intl.NumberFormat`/`toLocaleDateString`; centralizar mantém moeda, data e hora
 * consistentes em todo o CRM (cards do Kanban, tabelas, drawers, timeline).
 */

export function formatCurrency(value: number | null | undefined, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: currency || "BRL",
  }).format(Number(value ?? 0));
}

export function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

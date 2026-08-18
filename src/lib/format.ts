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

/**
 * Prazo é DATA, não instante — e é aí que mora um erro de um dia.
 *
 * `new Date("2026-08-18")` é lido como meia-noite UTC. No Brasil (UTC-3) isso é
 * 17/08 às 21h, então a tarefa criada para o dia 18 aparecia como 17 em toda a
 * interface. O usuário escolhia uma data e o sistema mostrava outra.
 *
 * `dataParaISO` grava ao MEIO-DIA local: longe das duas bordas do dia, o valor
 * sobrevive a qualquer fuso entre -11 e +11 sem trocar de data.
 */
export function dataParaISO(data: string): string {
  // `${data}T12:00:00` sem sufixo Z é interpretado no fuso local, que é o que
  // se quer: o dia 18 escolhido pelo usuário é o dia 18 onde ele está.
  return new Date(`${data}T12:00:00`).toISOString();
}

/**
 * Formata prazo tratando o valor como data pura.
 *
 * Lê o dia direto do ISO em vez de converter por fuso. Sem isso, os registros
 * gravados antes de `dataParaISO` (meia-noite UTC) continuariam exibindo o dia
 * anterior para sempre.
 */
export function formatDueDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : formatDate(iso);
}

// Nylas v3 falso para o hard smoke da agenda (Sprint 12 B11).
// Caminho na sandbox: /nylas/<caminho real da API>. Devolve um grant fixo,
// aceita criar/atualizar/apagar eventos (com id previsível) e responde free/busy
// com um bloqueio fixo: 14:00 às 15:00 UTC de qualquer dia consultado fica ocupado.

type Resposta = { status: number; body: unknown } | null;

export const NYLAS_GRANT_FALSO = "grant-e2e-0001";
const EMAIL_CONTA = "agenda.e2e@exemplo.com.br";

export function respostaNylas(caminho: string, metodo: string, corpo: Record<string, unknown> | null): Resposta {
  if (!caminho.startsWith("/nylas/")) return null;
  const rota = caminho.slice("/nylas".length);

  if (rota === "/v3/connect/token" && metodo === "POST") {
    if (!corpo?.code || !corpo?.client_id) return { status: 400, body: { error: "invalid_request", error_description: "code e client_id são obrigatórios" } };
    return { status: 200, body: { grant_id: NYLAS_GRANT_FALSO, email: EMAIL_CONTA, provider: "google", scope: "calendar" } };
  }
  if (rota === "/v3/connectors") return { status: 200, body: { data: [{ provider: "google" }, { provider: "microsoft" }] } };

  const grant = rota.match(/^\/v3\/grants\/([^/]+)(\/.*)?$/);
  if (!grant) return { status: 404, body: { error: "not_found" } };
  if (grant[1] !== NYLAS_GRANT_FALSO) return { status: 404, body: { error: { type: "not_found", message: "grant desconhecido" } } };
  const resto = grant[2] ?? "";

  if (!resto && metodo === "GET") return { status: 200, body: { data: { id: NYLAS_GRANT_FALSO, provider: "google", email: EMAIL_CONTA } } };
  if (!resto && metodo === "DELETE") return { status: 200, body: { request_id: "sandbox" } };

  if (resto.startsWith("/calendars/free-busy") && metodo === "POST") {
    const inicio = Number(corpo?.start_time ?? 0);
    const fim = Number(corpo?.end_time ?? 0);
    const dia = new Date(inicio * 1000);
    const ocupadoInicio = Date.UTC(dia.getUTCFullYear(), dia.getUTCMonth(), dia.getUTCDate(), 14, 0) / 1000;
    const ocupadoFim = ocupadoInicio + 3600;
    const slots = ocupadoInicio < fim && ocupadoFim > inicio ? [{ start_time: ocupadoInicio, end_time: ocupadoFim, status: "busy" }] : [];
    return { status: 200, body: { data: [{ email: EMAIL_CONTA, time_slots: slots }] } };
  }

  if (resto.startsWith("/events")) {
    const id = resto.match(/^\/events\/([^/?]+)/)?.[1];
    if (metodo === "GET" && !id) return { status: 200, body: { data: [] } };
    if (metodo === "POST") {
      const key1 = (corpo?.metadata as { key1?: string } | undefined)?.key1 ?? crypto.randomUUID();
      return { status: 200, body: { data: { id: `evt-${key1}`, title: corpo?.title, conferencing: { provider: "Google Meet", details: { url: `https://meet.google.com/e2e-${key1.slice(0, 8)}` } } } } };
    }
    if (metodo === "PUT" && id) return { status: 200, body: { data: { id, title: corpo?.title, conferencing: { provider: "Google Meet", details: { url: `https://meet.google.com/e2e-${id.slice(4, 12)}` } } } } };
    if (metodo === "DELETE" && id) return { status: 200, body: { request_id: "sandbox" } };
  }
  return { status: 404, body: { error: `sandbox nylas: ${metodo} ${rota} não simulado` } };
}

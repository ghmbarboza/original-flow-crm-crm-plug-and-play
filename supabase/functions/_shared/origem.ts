// Módulo puro, sem import de Deno: as functions do Gmail usam e o vitest testa em
// src/lib/gmailOrigem.test.ts.

/**
 * Origem do app aceita para a volta do OAuth: só https, ou http em localhost.
 * Vem da tela que pediu a conexão, então cada remix e cada domínio funcionam sem
 * o secret APP_URL (que a Lovable pede para preencher em todo remix).
 */
export function origemDoApp(bruta: unknown): string | null {
  if (typeof bruta !== "string" || !bruta) return null;
  try {
    const u = new URL(bruta);
    const local = u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
    return u.protocol === "https:" || local ? u.origin : null;
  } catch {
    return null;
  }
}

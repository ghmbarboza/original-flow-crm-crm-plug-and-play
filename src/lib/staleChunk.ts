/**
 * Após um publish, abas abertas com a versão anterior falham ao carregar chunks
 * lazy que não existem mais no servidor. Um único reload busca o index novo e
 * resolve; a flag em sessionStorage evita loop quando o reload não resolve.
 */
const CHAVE_RELOAD = "via:stale-chunk-reload";

const SINAIS = [
  "Failed to fetch dynamically imported module",
  "Importing a module script failed",
] as const;

export function isStaleChunkError(error: unknown): boolean {
  const mensagem =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return SINAIS.some((sinal) => mensagem.includes(sinal));
}

/**
 * Recarrega a página uma única vez por sessão para um erro de chunk obsoleto.
 * Retorna `true` quando o reload foi disparado (o chamador não deve renderizar
 * o erro), `false` quando já houve uma tentativa e o erro deve ser exibido.
 */
export function recarregarUmaVezPorChunkObsoleto(
  storage: Pick<Storage, "getItem" | "setItem"> | undefined,
  recarregar: () => void,
): boolean {
  if (!storage) return false;
  if (storage.getItem(CHAVE_RELOAD)) return false;
  storage.setItem(CHAVE_RELOAD, "1");
  recarregar();
  return true;
}

/** Chamado quando o app renderiza com sucesso: libera uma futura tentativa. */
export function limparFlagDeChunkObsoleto(
  storage: Pick<Storage, "removeItem"> | undefined,
): void {
  storage?.removeItem(CHAVE_RELOAD);
}

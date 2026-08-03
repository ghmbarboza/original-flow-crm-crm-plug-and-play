/**
 * Após um publish, abas abertas com a versão anterior falham ao carregar chunks
 * lazy que não existem mais no servidor. Um único reload busca o index novo e
 * resolve; a janela de tempo evita loop quando o reload não resolve (index.html
 * preso em cache, CDN não propagado, offline).
 */
const CHAVE_RELOAD = "via:stale-chunk-reload";

/**
 * Janela mínima entre reloads automáticos. Um chunk que continua falhando logo
 * após o reload é erro real e deve aparecer na tela; um novo publish horas
 * depois pode voltar a recarregar sozinho.
 */
export const JANELA_ENTRE_RELOADS_MS = 60_000;

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
 * Recarrega a página para um erro de chunk obsoleto, no máximo uma vez por
 * janela de tempo. Retorna `true` quando o reload foi disparado (o chamador não
 * deve renderizar o erro), `false` quando houve tentativa recente e o erro deve
 * ser exibido.
 */
export function recarregarUmaVezPorChunkObsoleto(
  storage: Pick<Storage, "getItem" | "setItem"> | undefined,
  recarregar: () => void,
  agora: number = Date.now(),
): boolean {
  if (!storage) return false;
  const ultima = Number(storage.getItem(CHAVE_RELOAD) ?? 0);
  if (Number.isFinite(ultima) && ultima > 0 && agora - ultima < JANELA_ENTRE_RELOADS_MS) {
    return false;
  }
  storage.setItem(CHAVE_RELOAD, String(agora));
  recarregar();
  return true;
}

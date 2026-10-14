/**
 * Copia para a área de transferência. Com `html`, quem cola num e-mail ou
 * documento recebe a formatação; quem cola no WhatsApp recebe o texto simples.
 * Devolve false quando o navegador não deixa copiar (sem permissão, sem HTTPS).
 */
export async function copiarTexto(texto: string, html?: string): Promise<boolean> {
  try {
    if (html && typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({
        "text/plain": new Blob([texto], { type: "text/plain" }),
        "text/html": new Blob([html], { type: "text/html" }),
      })]);
      return true;
    }
    await navigator.clipboard.writeText(texto);
    return true;
  } catch (e) {
    console.error("[assistente] não foi possível copiar", e);
    return false;
  }
}

/** HTML de uma resposta já desenhada na tela, com links apontando para o endereço completo. */
export function htmlDaResposta(elemento: HTMLElement): string {
  const copia = elemento.cloneNode(true) as HTMLElement;
  copia.querySelectorAll("a").forEach((a) => {
    a.setAttribute("href", (a as HTMLAnchorElement).href);
    a.removeAttribute("data-testid");
  });
  return copia.innerHTML;
}

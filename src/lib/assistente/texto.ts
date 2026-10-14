/**
 * Texto das respostas do assistente fora do painel: para copiar e mandar a
 * alguém pelo WhatsApp, e-mail ou chat. O markdown vira a formatação do
 * WhatsApp (*negrito*, _itálico_, ~riscado~), que também se lê bem num e-mail,
 * e os links internos viram endereço completo, que funciona fora do app.
 */

export interface MensagemParaCopiar {
  papel: "usuario" | "assistente";
  texto: string;
  erro?: boolean;
}

const CELULAS = (linha: string) => linha.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
const LINHA_DE_TABELA = /^\s*\|.*\|\s*$/;
const SEPARADOR_DE_TABELA = /^\s*\|[\s:|-]+\|\s*$/;

/** Marca provisória do negrito, para o itálico não confundir os asteriscos. */
const NEGRITO = "\uE000";

function inline(texto: string, origem: string): string {
  return texto
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, rotulo: string, destino: string) =>
      destino.startsWith("/") && !destino.startsWith("//") ? `${rotulo} (${origem}${destino})` : `${rotulo} (${destino})`)
    .replace(/\*\*\*([^*]+)\*\*\*/g, `${NEGRITO}_$1_${NEGRITO}`)
    .replace(/\*\*([^*]+?)\*\*/g, `${NEGRITO}$1${NEGRITO}`)
    .replace(/__([^_]+?)__/g, `${NEGRITO}$1${NEGRITO}`)
    .replace(/(^|[^\w*])\*([^*\s][^*]*?)\*(?!\*)/g, "$1_$2_")
    .split(NEGRITO).join("*")
    .replace(/~~([^~]+?)~~/g, "~$1~")
    .replace(/`([^`]+)`/g, "$1");
}

/** Uma resposta em texto pronto para colar. `origem` é o endereço do app (window.location.origin). */
export function paraTextoSimples(markdown: string, origem: string): string {
  const linhas = markdown.replace(/\r\n/g, "\n").split("\n");
  const saida: string[] = [];
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i];
    if (/^\s*```/.test(l)) continue;
    if (LINHA_DE_TABELA.test(l) && SEPARADOR_DE_TABELA.test(linhas[i + 1] ?? "")) {
      const cabecalho = CELULAS(l);
      i += 2;
      for (; i < linhas.length && LINHA_DE_TABELA.test(linhas[i]); i++) {
        const valores = CELULAS(linhas[i]);
        saida.push(`• ${valores.map((v, k) => (cabecalho[k] ? `${inline(cabecalho[k], origem)}: ${inline(v, origem)}` : inline(v, origem))).join(" · ")}`);
      }
      i--;
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) { saida.push(""); continue; }
    const titulo = l.match(/^#{1,6}\s+(.*)$/);
    if (titulo) { saida.push(`*${inline(titulo[1], origem).replace(/^\*(.*)\*$/, "$1")}*`); continue; }
    const citacao = l.match(/^\s*>\s?(.*)$/);
    if (citacao) { saida.push(`> ${inline(citacao[1], origem)}`); continue; }
    const item = l.match(/^(\s*)[-*+]\s+(.*)$/);
    if (item) { saida.push(`${item[1]}• ${inline(item[2], origem)}`); continue; }
    saida.push(inline(l, origem));
  }
  return saida.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** A conversa inteira, com quem perguntou e o que o assistente respondeu. */
export function conversaComoTexto(titulo: string, mensagens: MensagemParaCopiar[], origem: string): string {
  const corpo = mensagens
    .filter((m) => !m.erro)
    .map((m) => (m.papel === "usuario" ? `*Pergunta:* ${m.texto.trim()}` : `*Assistente:*\n${paraTextoSimples(m.texto, origem)}`))
    .join("\n\n");
  return `*${titulo.trim()}*\n\n${corpo}`;
}

import { Fragment, type ReactNode } from "react";
import { Link } from "react-router-dom";

/**
 * Markdown das respostas do assistente: títulos, negrito, itálico, riscado,
 * código, links, listas (com níveis), citações, linhas divisórias e tabelas.
 *
 * Segurança: nada vira HTML cru. Link só vira link quando é tela do app
 * ("/..."). Endereço externo aparece como texto, nunca clicável: a resposta
 * pode carregar texto vindo de cliente (WhatsApp, notas), e um link clicável
 * ali serviria para phishing.
 */
const INTERNO = /^\/(?!\/)[\w\-/?=&.%#]*$/;
const TELAS = ["/dashboard", "/contacts", "/companies", "/deals", "/tasks", "/agenda", "/voz", "/products", "/whatsapp", "/inbox", "/reports", "/sales-goals", "/lead-scoring", "/settings", "/help", "/email-templates", "/f"];
const eTela = (d: string) => { const base = d.split(/[?#]/)[0]; return TELAS.some((t) => base === t || base.startsWith(`${t}/`)); };

const CLASSE_LINK = "font-medium text-via-blue underline-offset-2 hover:underline";

// Ordem importa: código antes de tudo (o que está dentro não é formatado),
// negrito-itálico antes de negrito, negrito antes de itálico.
const INLINE = new RegExp([
  "(`[^`\\n]+`)",
  "(\\[[^\\]]+\\]\\([^)\\s]+\\))",
  "(\\*\\*\\*[^*\\n]+?\\*\\*\\*)",
  "(\\*\\*[^*\\n]+?\\*\\*)",
  "(__[^_\\n]+?__)",
  "(~~[^~\\n]+?~~)",
  "((?<![\\w*])\\*[^*\\s][^*\\n]*?\\*(?![\\w*]))",
  "((?<![\\w])_[^_\\s][^_\\n]*?_(?![\\w]))",
].join("|"), "g");
/** Linha gigante não passa pela formatação (evita travar o navegador). */
const MAX_LINHA_FORMATADA = 4000;

function inline(texto: string, onNavegar?: () => void): ReactNode[] {
  if (texto.length > MAX_LINHA_FORMATADA) return [texto];
  const nos: ReactNode[] = [];
  let ultimo = 0;
  for (const m of texto.matchAll(INLINE)) {
    const inicio = m.index ?? 0;
    if (inicio > ultimo) nos.push(texto.slice(ultimo, inicio));
    nos.push(<Fragment key={inicio}>{elemento(m[0], onNavegar)}</Fragment>);
    ultimo = inicio + m[0].length;
  }
  if (ultimo < texto.length) nos.push(texto.slice(ultimo));
  return nos;
}

function elemento(trecho: string, onNavegar?: () => void): ReactNode {
  if (trecho.startsWith("`")) {
    return <code className="rounded px-1 py-0.5 font-mono text-[0.85em]" style={{ background: "var(--via-surface-2, rgba(0,0,0,0.06))" }}>{trecho.slice(1, -1)}</code>;
  }
  const link = trecho.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
  if (link) {
    const [, rotulo, destino] = link;
    if (!INTERNO.test(destino) || !eTela(destino)) return <>{inline(rotulo, onNavegar)}</>;
    return <Link to={destino} onClick={onNavegar} className={CLASSE_LINK} data-testid="assistente-link">{inline(rotulo, onNavegar)}</Link>;
  }
  if (trecho.startsWith("***")) return <strong><em>{inline(trecho.slice(3, -3), onNavegar)}</em></strong>;
  if (trecho.startsWith("**") || trecho.startsWith("__")) return <strong>{inline(trecho.slice(2, -2), onNavegar)}</strong>;
  if (trecho.startsWith("~~")) return <s>{inline(trecho.slice(2, -2), onNavegar)}</s>;
  if (trecho.startsWith("*") || trecho.startsWith("_")) return <em>{inline(trecho.slice(1, -1), onNavegar)}</em>;
  return trecho;
}

function Tabela({ linhas, onNavegar }: { linhas: string[]; onNavegar?: () => void }) {
  const celulas = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
  const [cab, , ...corpo] = linhas;
  return (
    <div className="my-2 overflow-x-auto">
      <table className="w-full text-xs">
        <thead><tr>{celulas(cab).map((c, i) => <th key={i} className="border-b px-2 py-1 text-left font-medium" style={{ borderColor: "var(--via-border)" }}>{inline(c, onNavegar)}</th>)}</tr></thead>
        <tbody>{corpo.map((l, i) => <tr key={i}>{celulas(l).map((c, j) => <td key={j} className="border-b px-2 py-1 align-top" style={{ borderColor: "var(--via-border)" }}>{inline(c, onNavegar)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

const ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const largura = (espacos: string) => espacos.replace(/\t/g, "  ").length;

/** Lista com níveis: item mais recuado que o anterior abre uma sublista. */
function Lista({ linhas, onNavegar }: { linhas: string[]; onNavegar?: () => void }) {
  const montar = (de: number, ate: number): ReactNode => {
    const base = largura(linhas[de].match(ITEM)![1]);
    const ordenada = /\d/.test(linhas[de].match(ITEM)![2]);
    const itens: ReactNode[] = [];
    let i = de;
    while (i < ate) {
      const [, , , conteudo] = linhas[i].match(ITEM)!;
      let j = i + 1;
      while (j < ate && largura(linhas[j].match(ITEM)![1]) > base) j++;
      itens.push(<li key={i}>{inline(conteudo, onNavegar)}{j > i + 1 && montar(i + 1, j)}</li>);
      i = j;
    }
    const classe = `my-1 space-y-0.5 pl-5 ${ordenada ? "list-decimal" : "list-disc"}`;
    if (!ordenada) return <ul className={classe}>{itens}</ul>;
    return <ol className={classe} start={parseInt(linhas[de].match(ITEM)![2], 10) || 1}>{itens}</ol>;
  };
  return <>{montar(0, linhas.length)}</>;
}

const TAMANHO_TITULO = ["text-base", "text-base", "text-sm", "text-sm", "text-sm", "text-sm"];

export function RespostaMarkdown({ texto, onNavegar }: { texto: string; onNavegar?: () => void }) {
  const linhas = texto.replace(/\r\n/g, "\n").split("\n");
  const blocos: ReactNode[] = [];
  let i = 0;
  while (i < linhas.length) {
    const l = linhas[i];
    if (/^\s*```/.test(l)) {
      const codigo: string[] = [];
      i++;
      while (i < linhas.length && !/^\s*```/.test(linhas[i])) codigo.push(linhas[i++]);
      i++;
      blocos.push(<pre key={i} className="my-2 overflow-x-auto rounded-md p-2 font-mono text-xs" style={{ background: "var(--via-surface-2, rgba(0,0,0,0.06))" }}>{codigo.join("\n")}</pre>);
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(l) && /^\s*\|[\s:|-]+\|\s*$/.test(linhas[i + 1] ?? "")) {
      const tabela: string[] = [];
      while (i < linhas.length && /^\s*\|.*\|\s*$/.test(linhas[i])) tabela.push(linhas[i++]);
      blocos.push(<Tabela key={i} linhas={tabela} onNavegar={onNavegar} />);
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) {
      blocos.push(<hr key={i} className="my-3" style={{ borderColor: "var(--via-border)" }} />);
      i++;
      continue;
    }
    if (ITEM.test(l)) {
      // Trocar de "-" para "1." no mesmo nível começa outra lista.
      const [, recuo, marcador] = l.match(ITEM)!;
      const mesmaLista = (linha: string) => {
        const m = linha.match(ITEM);
        return !!m && (largura(m[1]) > largura(recuo) || /\d/.test(m[2]) === /\d/.test(marcador));
      };
      // Linha recuada logo depois de um item é continuação dele; linha em branco
      // entre dois itens não quebra a lista (senão os passos viram 1, 1, 1).
      const itens: string[] = [];
      while (i < linhas.length) {
        if (mesmaLista(linhas[i])) { itens.push(linhas[i++]); continue; }
        if (itens.length && /^\s{2,}\S/.test(linhas[i]) && !ITEM.test(linhas[i])) {
          itens[itens.length - 1] += ` ${linhas[i++].trim()}`;
          continue;
        }
        let j = i;
        while (j < linhas.length && !linhas[j].trim()) j++;
        if (j > i && j < linhas.length && mesmaLista(linhas[j])) { i = j; continue; }
        break;
      }
      blocos.push(<Lista key={i} linhas={itens} onNavegar={onNavegar} />);
      continue;
    }
    if (/^\s*>/.test(l)) {
      const citacao: string[] = [];
      while (i < linhas.length && /^\s*>/.test(linhas[i])) citacao.push(linhas[i++].replace(/^\s*>\s?/, ""));
      blocos.push(
        <blockquote key={i} className="my-2 border-l-2 pl-3 italic" style={{ borderColor: "var(--via-border)", color: "var(--via-text-muted)" }}>
          {citacao.map((c, k) => <p key={k}>{inline(c, onNavegar)}</p>)}
        </blockquote>,
      );
      continue;
    }
    const titulo = l.match(/^(#{1,6})\s+(.*)$/);
    if (titulo) {
      blocos.push(<p key={i} className={`mb-1 mt-3 font-semibold first:mt-0 ${TAMANHO_TITULO[titulo[1].length - 1]}`} style={{ color: "var(--via-text-primary)" }}>{inline(titulo[2].replace(/^\*\*(.*)\*\*$/, "$1"), onNavegar)}</p>);
    } else if (l.trim()) {
      blocos.push(<p key={i} className="my-1">{inline(l, onNavegar)}</p>);
    }
    i++;
  }
  return <div className="text-sm leading-relaxed [overflow-wrap:anywhere]">{blocos}</div>;
}

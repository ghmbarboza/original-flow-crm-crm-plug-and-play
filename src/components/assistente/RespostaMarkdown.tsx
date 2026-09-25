import { Fragment, type ReactNode } from "react";
import { Link } from "react-router-dom";

/**
 * Markdown mínimo das respostas do assistente: títulos, negrito, links, listas e
 * tabelas. Link só vira link quando é caminho interno do app ("/..."); qualquer
 * outro destino (http, javascript:, //) aparece como texto. Navega sem recarregar,
 * e o painel continua aberto.
 */
const INTERNO = /^\/(?!\/)[\w\-/?=&.%]*$/;

function inline(texto: string, onNavegar?: () => void): ReactNode[] {
  const partes = texto.split(/(\[[^\]]+\]\([^)\s]+\)|\*\*[^*]+\*\*)/g);
  return partes.map((p, i) => {
    const link = p.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    if (link) {
      const [, rotulo, destino] = link;
      if (!INTERNO.test(destino)) return <Fragment key={i}>{rotulo}</Fragment>;
      return <Link key={i} to={destino} onClick={onNavegar} className="font-medium text-via-blue underline-offset-2 hover:underline" data-testid="assistente-link">{rotulo}</Link>;
    }
    const negrito = p.match(/^\*\*([^*]+)\*\*$/);
    if (negrito) return <strong key={i}>{negrito[1]}</strong>;
    return <Fragment key={i}>{p}</Fragment>;
  });
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

export function RespostaMarkdown({ texto, onNavegar }: { texto: string; onNavegar?: () => void }) {
  const linhas = texto.split("\n");
  const blocos: ReactNode[] = [];
  let i = 0;
  while (i < linhas.length) {
    const l = linhas[i];
    if (/^\s*\|.*\|\s*$/.test(l) && /^\s*\|[\s:|-]+\|\s*$/.test(linhas[i + 1] ?? "")) {
      const tabela: string[] = [];
      while (i < linhas.length && /^\s*\|.*\|\s*$/.test(linhas[i])) tabela.push(linhas[i++]);
      blocos.push(<Tabela key={i} linhas={tabela} onNavegar={onNavegar} />);
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(l)) {
      const ordenada = /^\s*\d+\./.test(l);
      const itens: string[] = [];
      while (i < linhas.length && /^\s*([-*]|\d+\.)\s+/.test(linhas[i])) itens.push(linhas[i++].replace(/^\s*([-*]|\d+\.)\s+/, ""));
      const Lista = ordenada ? "ol" : "ul";
      blocos.push(<Lista key={i} className={`my-1 space-y-0.5 pl-5 ${ordenada ? "list-decimal" : "list-disc"}`}>{itens.map((t, k) => <li key={k}>{inline(t, onNavegar)}</li>)}</Lista>);
      continue;
    }
    const titulo = l.match(/^#{1,4}\s+(.*)$/);
    if (titulo) blocos.push(<p key={i} className="mt-2 font-medium" style={{ color: "var(--via-text-primary)" }}>{inline(titulo[1], onNavegar)}</p>);
    else if (l.trim()) blocos.push(<p key={i} className="my-1">{inline(l, onNavegar)}</p>);
    i++;
  }
  return <div className="text-sm leading-relaxed">{blocos}</div>;
}

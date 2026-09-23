/**
 * Base de conhecimento (Sprint 12 B10): divisão de documentos em trechos e
 * impressão digital do conteúdo. Porte de src/domain/knowledge.ts da Nina.
 * A gravação é feita pela RPC gravar_documento_conhecimento.
 */

export const TAMANHO_TRECHO = 1200;
export const SOBREPOSICAO = 0.12;
export const MAX_CARACTERES_DOCUMENTO = 220_000;
export const MAX_TRECHOS = 500;

export type TipoDocumento = "texto" | "arquivo" | "url" | "faq";
export type StatusDocumento = "processing" | "approved" | "needs_review" | "error" | "archived";

export const STATUS_DOCUMENTO_LABEL: Record<StatusDocumento, string> = {
  processing: "Processando",
  approved: "Em uso",
  needs_review: "Aguardando revisão",
  error: "Com erro",
  archived: "Arquivado",
};

export const CATEGORIAS_FATO = ["geral", "preços", "prazos", "endereço e horários", "políticas", "produtos", "contato"] as const;

/** Empacota partes em trechos de até `max` caracteres, separadas por `sep`. */
function empacotar(partes: string[], max: number, sep: string): string[] {
  const trechos: string[] = [];
  let atual = "";
  for (const parte of partes) {
    if (!parte) continue;
    if (!atual) {
      atual = parte;
    } else if (atual.length + sep.length + parte.length <= max) {
      atual = `${atual}${sep}${parte}`;
    } else {
      trechos.push(atual);
      atual = parte;
    }
  }
  if (atual) trechos.push(atual);
  return trechos;
}

/** Janela deslizante com sobreposição para frases maiores que o limite. */
function janelas(texto: string, max: number): string[] {
  const sobre = Math.floor(max * SOBREPOSICAO);
  const passo = max - sobre;
  const out: string[] = [];
  for (let i = 0; i < texto.length; i += passo) {
    out.push(texto.slice(i, i + max));
    if (i + max >= texto.length) break;
  }
  return out;
}

/**
 * Divide o conteúdo em trechos: parágrafos até `max`; parágrafo maior quebra
 * em frases; frase maior vira janela deslizante com 12% de sobreposição.
 */
export function dividirEmTrechos(conteudo: string, max = TAMANHO_TRECHO): string[] {
  const texto = (conteudo ?? "").replace(/\r\n?/g, "\n").trim();
  if (!texto) return [];
  const paragrafos = texto.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const partes: string[] = [];
  for (const p of paragrafos) {
    if (p.length <= max) {
      partes.push(p);
      continue;
    }
    const frases = p.split(/(?<=[.!?])\s+/).map((f) => f.trim()).filter(Boolean);
    for (const f of frases) {
      if (f.length <= max) partes.push(f);
      else partes.push(...janelas(f, max));
    }
  }
  const trechos = empacotar(partes, max, "\n\n");
  return trechos.length ? trechos : [texto.slice(0, max)];
}

/** sha256 em hex do conteúdo normalizado; identifica o documento na org. */
export async function impressaoDigital(docType: TipoDocumento, sourceUrl: string | null, conteudo: string, titulo = ""): Promise<string> {
  // O título entra no hash: o mesmo texto com outro título é outro material (não some em silêncio).
  const base = `${docType}\n${sourceUrl ?? ""}\n${titulo.trim().toLowerCase()}\n${conteudo}`.normalize("NFKC").trim();
  const bytes = new TextEncoder().encode(base);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface RelatorioIngestao {
  trechos: number;
  caracteres: number;
  partes_ilegiveis: string[];
  origem?: string;
}

export function relatorioDe(trechos: string[], conteudo: string, ilegiveis: string[] = [], origem?: string): RelatorioIngestao {
  return { trechos: trechos.length, caracteres: conteudo.length, partes_ilegiveis: ilegiveis, ...(origem ? { origem } : {}) };
}

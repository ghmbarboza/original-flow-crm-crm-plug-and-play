/**
 * Extração de texto no navegador para a base de conhecimento (Sprint 12 B10):
 * PDF (pdfjs), DOCX (mammoth), XLSX (jszip + DOMParser), CSV/TXT/MD/JSON.
 * Porte de src/lib/material-extraction.ts da Nina. Nada sobe para o servidor:
 * só o texto extraído vai para a RPC.
 */

export const MAX_ARQUIVOS = 8;
export const MAX_BYTES_POR_ARQUIVO = 8 * 1024 * 1024;
export const MAX_CARACTERES_POR_ARQUIVO = 80_000;
const MIN_CARACTERES_PAGINA = 12;
const MAX_LINHAS_PLANILHA = 5000;

export interface MaterialExtraido {
  nome: string;
  texto: string;
  partesIlegiveis: string[];
  truncado: boolean;
}

export const EXTENSOES_ACEITAS = [".pdf", ".docx", ".xlsx", ".csv", ".txt", ".md", ".json"];

function extensao(nome: string): string {
  const i = nome.lastIndexOf(".");
  return i >= 0 ? nome.slice(i).toLowerCase() : "";
}

async function lerPdf(arquivo: File, ilegiveis: string[]): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const doc = await pdfjs.getDocument({ data: await arquivo.arrayBuffer() }).promise;
  const paginas: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const pagina = await doc.getPage(n);
    const conteudo = await pagina.getTextContent();
    const texto = conteudo.items.map((item) => ("str" in item ? item.str : "")).join(" ").replace(/\s+/g, " ").trim();
    if (texto.length < MIN_CARACTERES_PAGINA) {
      ilegiveis.push(`Página ${n} sem texto legível (imagem ou digitalização sem OCR)`);
      continue;
    }
    paginas.push(`[Página ${n}]\n${texto}`);
  }
  return paginas.join("\n\n");
}

async function lerDocx(arquivo: File): Promise<string> {
  const mammoth = await import("mammoth");
  const r = await mammoth.extractRawText({ arrayBuffer: await arquivo.arrayBuffer() });
  return r.value.trim();
}

function textoDaCelula(no: Element, strings: string[]): string {
  const tipo = no.getAttribute("t");
  const v = no.getElementsByTagName("v")[0]?.textContent ?? "";
  if (tipo === "s") return strings[Number(v)] ?? "";
  if (tipo === "inlineStr") return no.getElementsByTagName("t")[0]?.textContent ?? "";
  return v;
}

async function lerXlsx(arquivo: File, ilegiveis: string[]): Promise<string> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(await arquivo.arrayBuffer());
  const parser = new DOMParser();
  const xml = async (caminho: string) => {
    const f = zip.file(caminho);
    return f ? parser.parseFromString(await f.async("string"), "application/xml") : null;
  };
  const strings: string[] = [];
  const shared = await xml("xl/sharedStrings.xml");
  if (shared) for (const si of Array.from(shared.getElementsByTagName("si"))) strings.push(Array.from(si.getElementsByTagName("t")).map((t) => t.textContent ?? "").join(""));
  const workbook = await xml("xl/workbook.xml");
  const rels = await xml("xl/_rels/workbook.xml.rels");
  if (!workbook || !rels) {
    ilegiveis.push("Planilha sem estrutura reconhecível");
    return "";
  }
  const alvoPorRel = new Map<string, string>();
  for (const r of Array.from(rels.getElementsByTagName("Relationship"))) alvoPorRel.set(r.getAttribute("Id") ?? "", r.getAttribute("Target") ?? "");
  const blocos: string[] = [];
  let linhas = 0;
  for (const sheet of Array.from(workbook.getElementsByTagName("sheet"))) {
    const nome = sheet.getAttribute("name") ?? "Planilha";
    const relId = sheet.getAttribute("r:id") ?? sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") ?? "";
    const alvo = alvoPorRel.get(relId);
    if (!alvo) continue;
    const doc = await xml(alvo.startsWith("/") ? alvo.slice(1) : `xl/${alvo}`);
    if (!doc) continue;
    const linhasTexto: string[] = [];
    for (const row of Array.from(doc.getElementsByTagName("row"))) {
      if (linhas >= MAX_LINHAS_PLANILHA) break;
      const celulas = Array.from(row.getElementsByTagName("c")).map((c) => textoDaCelula(c, strings));
      if (celulas.some((c) => c.trim())) {
        linhasTexto.push(celulas.join("\t"));
        linhas++;
      }
    }
    if (linhasTexto.length) blocos.push(`[Planilha: ${nome}]\n${linhasTexto.join("\n")}`);
  }
  if (linhas >= MAX_LINHAS_PLANILHA) ilegiveis.push(`Planilha cortada em ${MAX_LINHAS_PLANILHA} linhas`);
  return blocos.join("\n\n");
}

/** Extrai o texto de um arquivo suportado; lança erro com mensagem para o usuário. */
export async function extrairMaterial(arquivo: File): Promise<MaterialExtraido> {
  if (arquivo.size > MAX_BYTES_POR_ARQUIVO) throw new Error(`"${arquivo.name}" passa de 8 MB.`);
  const ext = extensao(arquivo.name);
  if (!EXTENSOES_ACEITAS.includes(ext)) throw new Error(`"${arquivo.name}": formato não suportado. Use PDF, DOCX, XLSX, CSV, TXT, MD ou JSON.`);
  const ilegiveis: string[] = [];
  let texto = "";
  if (ext === ".pdf") texto = await lerPdf(arquivo, ilegiveis);
  else if (ext === ".docx") texto = await lerDocx(arquivo);
  else if (ext === ".xlsx") texto = await lerXlsx(arquivo, ilegiveis);
  else texto = (await arquivo.text()).trim();
  const truncado = texto.length > MAX_CARACTERES_POR_ARQUIVO;
  if (truncado) ilegiveis.push(`Texto cortado em ${MAX_CARACTERES_POR_ARQUIVO.toLocaleString("pt-BR")} caracteres`);
  return { nome: arquivo.name, texto: truncado ? texto.slice(0, MAX_CARACTERES_POR_ARQUIVO) : texto, partesIlegiveis: ilegiveis, truncado };
}

/**
 * CSV mínimo, sem dependências.
 *
 * Lida com o que aparece em arquivo exportado de Excel/Google Sheets no Brasil:
 * separador `,` ou `;` (detectado), campos entre aspas com vírgula e quebra de
 * linha dentro, aspas escapadas com `""`, BOM do Excel e CRLF.
 */

/** BOM do Excel. Declarado por codigo: o caractere literal e invisivel e o lint o rejeita. */
const BOM = String.fromCharCode(0xfeff);

/** Detecta o separador pela primeira linha fora de aspas: vence o que aparecer mais. */
function detectDelimiter(text: string): string {
  const firstLine = text.slice(0, text.indexOf("\n") === -1 ? text.length : text.indexOf("\n"));
  let commas = 0;
  let semicolons = 0;
  let inQuotes = false;
  for (const char of firstLine) {
    if (char === '"') inQuotes = !inQuotes;
    else if (!inQuotes && char === ",") commas++;
    else if (!inQuotes && char === ";") semicolons++;
  }
  return semicolons > commas ? ";" : ",";
}

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
  /**
   * Linha física de cada item de `rows` no arquivo original (1-based, contando o
   * cabeçalho e as linhas em branco descartadas).
   *
   * Sem isto, uma linha vazia no meio do arquivo desloca a numeração e o erro
   * mostrado ao usuário aponta para a linha errada na hora de corrigir a planilha.
   */
  lineNumbers: number[];
}

export function parseCsv(input: string): ParsedCsv {
  const withoutBom = input.startsWith(BOM) ? input.slice(1) : input;
  const text = withoutBom.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const delimiter = detectDelimiter(text);

  const rows: string[][] = [];
  // Linha física onde cada registro começa — um campo entre aspas pode conter
  // quebras de linha, então isso não é simplesmente o índice do array.
  const startLines: number[] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let line = 1;
  let rowStartLine = 1;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (char === "\n") line++;
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field.trim());
      field = "";
    } else if (char === "\n") {
      row.push(field.trim());
      rows.push(row);
      startLines.push(rowStartLine);
      row = [];
      field = "";
      line++;
      rowStartLine = line;
    } else {
      field += char;
    }
  }

  // Último campo/linha, quando o arquivo não termina em quebra de linha.
  if (field !== "" || row.length > 0) {
    row.push(field.trim());
    rows.push(row);
    startLines.push(rowStartLine);
  }

  // Descarta linhas totalmente vazias (rodapé em branco é comum), preservando
  // o número da linha física de cada registro que sobrou.
  const kept = rows
    .map((cells, index) => ({ cells, line: startLines[index] }))
    .filter(({ cells }) => cells.some((cell) => cell !== ""));

  if (kept.length === 0) return { headers: [], rows: [], lineNumbers: [] };

  const [header, ...body] = kept;
  return {
    headers: header.cells,
    rows: body.map((entry) => entry.cells),
    lineNumbers: body.map((entry) => entry.line),
  };
}

function escapeCell(value: unknown): string {
  const str = value === null || value === undefined ? "" : String(value);
  return /["\n;,]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/** Gera CSV com BOM, para o Excel abrir acentuação corretamente. */
export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(escapeCell).join(","), ...rows.map((r) => r.map(escapeCell).join(","))];
  return BOM + lines.join("\n");
}

export function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

import { describe, expect, it } from "vitest";
import { parseCsv, toCsv } from "@/lib/csv";

const BOM = String.fromCharCode(0xfeff);

describe("parseCsv", () => {
  it("lê um CSV simples separado por vírgula", () => {
    const { headers, rows } = parseCsv("Nome,Email\nMaria,maria@x.com\nJoão,joao@x.com");
    expect(headers).toEqual(["Nome", "Email"]);
    expect(rows).toEqual([
      ["Maria", "maria@x.com"],
      ["João", "joao@x.com"],
    ]);
  });

  it("detecta ponto e vírgula (padrão do Excel brasileiro)", () => {
    const { headers, rows } = parseCsv("Nome;Cidade\nMaria;São Paulo");
    expect(headers).toEqual(["Nome", "Cidade"]);
    expect(rows).toEqual([["Maria", "São Paulo"]]);
  });

  it("respeita vírgula e quebra de linha dentro de aspas", () => {
    const { rows } = parseCsv('Nome,Obs\n"Souza, Maria","linha 1\nlinha 2"');
    expect(rows).toEqual([["Souza, Maria", "linha 1\nlinha 2"]]);
  });

  it("entende aspas escapadas com aspas duplas", () => {
    const { rows } = parseCsv('Nome,Apelido\nMaria,"a ""chefa"""');
    expect(rows).toEqual([["Maria", 'a "chefa"']]);
  });

  it("remove o BOM do Excel e normaliza CRLF", () => {
    const { headers, rows } = parseCsv(`${BOM}Nome,Email\r\nMaria,maria@x.com\r\n`);
    expect(headers).toEqual(["Nome", "Email"]);
    expect(rows).toEqual([["Maria", "maria@x.com"]]);
  });

  it("descarta linhas em branco", () => {
    const { rows } = parseCsv("Nome\nMaria\n\n\nJoão\n");
    expect(rows).toEqual([["Maria"], ["João"]]);
  });

  it("mantém o número da linha física mesmo com linhas em branco no meio", () => {
    // João está na linha 5 do arquivo; sem isso, o erro apontaria a linha 3.
    const { rows, lineNumbers } = parseCsv("Nome\nMaria\n\nJoão\n");
    expect(rows).toEqual([["Maria"], ["João"]]);
    expect(lineNumbers).toEqual([2, 4]);
  });

  it("conta as quebras de linha dentro de aspas ao numerar", () => {
    const { lineNumbers } = parseCsv('Nome,Obs\nMaria,"linha 1\nlinha 2"\nJoão,ok');
    // O registro de João começa na linha 4 do arquivo, não na 3.
    expect(lineNumbers).toEqual([2, 4]);
  });

  it("devolve vazio para arquivo sem conteúdo", () => {
    expect(parseCsv("")).toEqual({ headers: [], rows: [], lineNumbers: [] });
  });
});

describe("toCsv", () => {
  it("escapa campos com vírgula, aspas e quebra de linha", () => {
    const csv = toCsv(["Nome", "Obs"], [["Souza, Maria", 'diz "oi"'], ["João", "linha 1\nlinha 2"]]);
    const withoutBom = csv.slice(1);
    expect(withoutBom).toBe('Nome,Obs\n"Souza, Maria","diz ""oi"""\nJoão,"linha 1\nlinha 2"');
  });

  it("escreve o BOM para o Excel abrir acentuação corretamente", () => {
    expect(toCsv(["Nome"], [["João"]]).startsWith(BOM)).toBe(true);
  });

  it("trata null e undefined como célula vazia", () => {
    expect(toCsv(["A", "B"], [[null, undefined]]).slice(1)).toBe("A,B\n,");
  });

  it("faz round-trip: o que exporta, importa de volta igual", () => {
    const rows = [["Souza, Maria", 'diz "oi"', "linha 1\nlinha 2"]];
    const parsed = parseCsv(toCsv(["A", "B", "C"], rows));
    expect(parsed.rows).toEqual(rows);
  });
});

import { describe, expect, it } from "vitest";
import { dividirEmTrechos, impressaoDigital, TAMANHO_TRECHO } from "./conhecimento";

describe("base de conhecimento: trechos e impressão digital", () => {
  it("junta parágrafos curtos num trecho e respeita o limite", () => {
    const paragrafos = Array.from({ length: 6 }, (_, i) => `Parágrafo ${i + 1} com um texto curto.`);
    const trechos = dividirEmTrechos(paragrafos.join("\n\n"), 80);
    expect(trechos.length).toBeGreaterThan(1);
    for (const t of trechos) expect(t.length).toBeLessThanOrEqual(80);
    expect(trechos.join("\n\n")).toBe(paragrafos.join("\n\n"));
  });

  it("quebra parágrafo longo em frases", () => {
    const frases = Array.from({ length: 10 }, (_, i) => `Frase número ${i + 1} fala de um assunto qualquer.`);
    const trechos = dividirEmTrechos(frases.join(" "), 120);
    expect(trechos.length).toBeGreaterThan(1);
    for (const t of trechos) expect(t.length).toBeLessThanOrEqual(120);
    expect(trechos[0].startsWith("Frase número 1")).toBe(true);
  });

  it("frase gigante vira janela deslizante com sobreposição", () => {
    const gigante = "a".repeat(3000);
    const trechos = dividirEmTrechos(gigante, TAMANHO_TRECHO);
    expect(trechos.length).toBe(3);
    expect(trechos[0]).toHaveLength(TAMANHO_TRECHO);
    // o segundo começa antes do fim do primeiro (12% de sobreposição)
    expect(trechos[1]).toHaveLength(TAMANHO_TRECHO);
  });

  it("vazio devolve nada e normaliza quebras de linha do Windows", () => {
    expect(dividirEmTrechos("   ")).toEqual([]);
    expect(dividirEmTrechos("um\r\n\r\ndois")).toEqual(["um\n\ndois"]);
  });

  it("impressão digital é estável e muda com o conteúdo", async () => {
    const a = await impressaoDigital("texto", null, "Política de troca em 7 dias.");
    const b = await impressaoDigital("texto", null, "Política de troca em 7 dias.");
    const c = await impressaoDigital("texto", null, "Política de troca em 30 dias.");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

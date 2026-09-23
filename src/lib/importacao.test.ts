import { describe, expect, it } from "vitest";
import {
  IGNORAR, adivinharCampo, linhaParaRegistro, mapearColunas, normalizarData, normalizarValor, sugerirEtapa, valoresDistintos,
} from "./importacao";

describe("importação universal", () => {
  it("adivinha campos por sinônimo e por preset do CRM de origem", () => {
    expect(adivinharCampo("E-mail", "contacts")).toBe("email");
    expect(adivinharCampo("Celular", "contacts")).toBe("whatsapp_phone");
    expect(adivinharCampo("Deal Stage", "deals", "hubspot")).toBe("stage");
    expect(adivinharCampo("Expected close date", "deals", "pipedrive")).toBe("close_date");
    expect(adivinharCampo("Coluna sem sentido", "deals")).toBe(IGNORAR);
  });

  it("não mapeia o mesmo campo duas vezes", () => {
    const mapa = mapearColunas(["Nome", "Name", "Email"], "contacts");
    expect(Object.values(mapa).filter((v) => v === "name")).toHaveLength(1);
    expect(mapa[2]).toBe("email");
  });

  it("linha vira registro só com os campos mapeados e preenchidos", () => {
    const r = linhaParaRegistro(["Nome", "Email", "Ignorar"], { 0: "name", 1: "email", 2: IGNORAR }, ["Ana Souza", " ana@x.com ", "z"]);
    expect(r).toEqual({ name: "Ana Souza", email: "ana@x.com" });
  });

  it("normaliza valor brasileiro e americano", () => {
    expect(normalizarValor("R$ 1.234,56")).toBe(1234.56);
    expect(normalizarValor("1,234.56")).toBe(1234.56);
    expect(normalizarValor("abc")).toBeNull();
  });

  it("normaliza datas dd/mm/aaaa e ISO", () => {
    expect(normalizarData("25/12/2026")).toMatch(/^2026-12-25T12:00/);
    expect(normalizarData("2026-01-05")).toMatch(/^2026-01-05/);
    expect(normalizarData("x")).toBeNull();
  });

  it("sugere etapa por nome parecido ou por palavra-chave", () => {
    const etapas = [{ id: "1", name: "Prospecção" }, { id: "2", name: "Proposta" }, { id: "3", name: "Fechamento" }];
    expect(sugerirEtapa("Proposta enviada", etapas)).toBe("2");
    expect(sugerirEtapa("Closed Won", etapas)).toBe("3");
    expect(sugerirEtapa("New lead", etapas)).toBe("1");
    expect(sugerirEtapa("Qualquer coisa", etapas)).toBeNull();
    expect(valoresDistintos([["a"], ["b"], ["a"], [""]], 0)).toEqual(["a", "b"]);
  });
});

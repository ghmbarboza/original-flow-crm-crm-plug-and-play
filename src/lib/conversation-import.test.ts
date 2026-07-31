import { describe, expect, it } from "vitest";
import {
  normalizeDirection, parseImportDate, parseImportRows,
} from "@/lib/conversation-import";

const MAPPING = { phone: 0, date: 1, direction: 2, content: 3, name: 4 };

describe("normalizeDirection", () => {
  it("reconhece sinônimos comuns dos dois lados", () => {
    expect(normalizeDirection("inbound")).toBe("inbound");
    expect(normalizeDirection("Recebida")).toBe("inbound");
    expect(normalizeDirection("cliente")).toBe("inbound");
    expect(normalizeDirection("sent")).toBe("outbound");
    expect(normalizeDirection("AGENTE")).toBe("outbound");
    expect(normalizeDirection("???")).toBeNull();
  });
});

describe("parseImportDate", () => {
  it("aceita ISO e dd/mm/aaaa com hora", () => {
    expect(parseImportDate("2026-07-01T10:00:00Z")).not.toBeNull();
    expect(parseImportDate("01/07/2026 10:30")?.getMonth()).toBe(6);
    expect(parseImportDate("31/02/x")).toBeNull();
    expect(parseImportDate("")).toBeNull();
  });
});

describe("parseImportRows", () => {
  it("agrupa por telefone e ordena mensagens por data", () => {
    const rows = [
      ["5511999998888", "2026-07-02T10:00:00Z", "outbound", "Tudo certo?", "Maria"],
      ["(11) 99999-8888", "2026-07-01T09:00:00Z", "inbound", "Olá!", "Maria"],
      ["5511977776666", "2026-07-01T11:00:00Z", "inbound", "Bom dia", ""],
    ];
    const result = parseImportRows(rows, [2, 3, 4], MAPPING);
    expect(result.errors).toHaveLength(0);
    expect(result.conversations).toHaveLength(2);
    expect(result.totalMessages).toBe(3);

    const maria = result.conversations.find((c) => c.phone === "5511999998888");
    expect(maria?.name).toBe("Maria");
    expect(maria?.messages.map((m) => m.content)).toEqual(["Olá!", "Tudo certo?"]);
  });

  it("separa linhas inválidas com o número da linha física", () => {
    const rows = [
      ["123", "2026-07-01", "inbound", "tel curto"],
      ["5511999998888", "data-ruim", "inbound", "oi"],
      ["5511999998888", "2026-07-01", "sideways", "oi"],
      ["5511999998888", "2026-07-01", "inbound", ""],
    ];
    const result = parseImportRows(rows, [2, 3, 4, 5], MAPPING);
    expect(result.conversations).toHaveLength(0);
    expect(result.errors.map((e) => e.line)).toEqual([2, 3, 4, 5]);
  });
});

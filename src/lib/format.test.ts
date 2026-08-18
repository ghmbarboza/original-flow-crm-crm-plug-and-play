import { describe, it, expect } from "vitest";
import { dataParaISO, formatDueDate } from "./format";

describe("prazo de tarefa (data pura, sem erro de fuso)", () => {
  it("o dia escolhido é o dia exibido", () => {
    expect(formatDueDate(dataParaISO("2026-08-18"))).toBe("18/08/2026");
  });

  it("grava longe da borda do dia, para nenhum fuso virar a data", () => {
    // Meia-noite UTC era o valor antigo e é justamente o que quebrava.
    expect(dataParaISO("2026-08-18")).not.toContain("T00:00:00");
  });

  it("lê corretamente os registros antigos, gravados como meia-noite UTC", () => {
    // Era o caso real em produção: exibia 17/08 para uma tarefa do dia 18.
    expect(formatDueDate("2026-08-18T00:00:00+00")).toBe("18/08/2026");
  });

  it("aceita data pura vinda do banco", () => {
    expect(formatDueDate("2026-12-31")).toBe("31/12/2026");
  });

  it("sem prazo mostra travessão", () => {
    expect(formatDueDate(null)).toBe("—");
    expect(formatDueDate(undefined)).toBe("—");
  });

  it("vira o ano sem escorregar de dia", () => {
    expect(formatDueDate(dataParaISO("2027-01-01"))).toBe("01/01/2027");
  });
});

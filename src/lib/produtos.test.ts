import { describe, expect, it } from "vitest";
import { escondeEmpresa, exigeEmpresa, resumoValores } from "./produtos";

describe("resumo de valores por cobrança", () => {
  it("separa avulso, mensal, anual e por hora", () => {
    const r = resumoValores([
      { quantity: 2, unit_price: 100 },
      { quantity: 1, unit_price: 90, billing: "monthly" },
      { quantity: 1, unit_price: 1200, billing: "yearly" },
      { quantity: 10, unit_price: 150, billing: "hourly" },
    ]);
    expect(r.avulso).toBe(200);
    expect(r.mensal).toBeCloseTo(190);
    expect(r.anual).toBeCloseTo(90 * 12 + 1200);
    expect(r.porHora).toBe(1500);
  });

  it("lista vazia zera tudo", () => {
    expect(resumoValores([])).toEqual({ avulso: 0, mensal: 0, anual: 0, porHora: 0 });
  });

  it("regras de empresa por modelo de negócio", () => {
    expect(exigeEmpresa("b2b")).toBe(true);
    expect(exigeEmpresa("mixed")).toBe(false);
    expect(escondeEmpresa("b2c")).toBe(true);
    expect(escondeEmpresa("b2b2c")).toBe(false);
  });
});

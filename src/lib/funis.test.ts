import { describe, expect, it } from "vitest";
import { etapaDoFormulario, funilAtivo, negociosDoFunil, validarNomeFunil } from "@/lib/funis";

const funis = [
  { id: "vendas", name: "Vendas", is_default: true },
  { id: "pos", name: "Pós-venda", is_default: false },
];

describe("funilAtivo", () => {
  it("mantém o funil que a pessoa deixou aberto", () => {
    expect(funilAtivo(funis, "pos")).toBe("pos");
  });

  it("volta para o padrão quando o funil salvo não existe mais", () => {
    expect(funilAtivo(funis, "apagado")).toBe("vendas");
    expect(funilAtivo(funis, null)).toBe("vendas");
  });

  it("sem padrão marcado usa o primeiro; sem funil nenhum, null", () => {
    expect(funilAtivo([{ id: "a", name: "A", is_default: false }], null)).toBe("a");
    expect(funilAtivo([], "pos")).toBeNull();
  });
});

describe("negociosDoFunil", () => {
  const deals = [
    { id: "1", stage: { pipeline_id: "vendas" } },
    { id: "2", stage: { pipeline_id: "pos" } },
    { id: "3", stage: null },
  ];

  it("separa os negócios pelo funil da etapa", () => {
    expect(negociosDoFunil(deals, "pos", "vendas").map((d) => d.id)).toEqual(["2"]);
  });

  it("negócio sem etapa aparece no funil padrão, para não sumir da lista", () => {
    expect(negociosDoFunil(deals, "vendas", "vendas").map((d) => d.id)).toEqual(["1", "3"]);
  });

  it("sem funil escolhido devolve tudo", () => {
    expect(negociosDoFunil(deals, null, null)).toHaveLength(3);
  });
});

describe("etapaDoFormulario", () => {
  const doFunilB = [{ id: "b0" }, { id: "b1" }];

  it("mantém a etapa escolhida quando ela é do funil mostrado", () => {
    expect(etapaDoFormulario("b1", doFunilB, false)).toBe("b1");
  });

  it("etapa de outro funil nunca é gravada: cai na primeira do funil mostrado", () => {
    expect(etapaDoFormulario("a0", doFunilB, false)).toBe("b0");
    expect(etapaDoFormulario(null, doFunilB, false)).toBe("b0");
  });

  it("etapas ainda carregando ou funil sem etapa: sem etapa, para o formulário barrar", () => {
    expect(etapaDoFormulario("a0", [], false)).toBeNull();
  });

  it("edição sem troca de funil preserva a etapa do negócio, até vazia", () => {
    expect(etapaDoFormulario(null, doFunilB, true)).toBeNull();
    expect(etapaDoFormulario("b1", [], true)).toBe("b1");
  });
});

describe("validarNomeFunil", () => {
  it("aceita nome novo e recusa vazio ou repetido", () => {
    expect(validarNomeFunil("Renovação", ["Vendas"])).toBeNull();
    expect(validarNomeFunil("  ", ["Vendas"])).toMatch(/nome/i);
    expect(validarNomeFunil(" vendas", ["Vendas"])).toMatch(/já existe/i);
  });
});

import { describe, expect, it } from "vitest";
import { aplicarVariaveis, filtrarRespostas, normalizarAtalho, type QuickReply } from "./useQuickReplies";

const resposta = (shortcut: string, title: string): QuickReply => ({
  id: shortcut,
  org_id: "org",
  shortcut,
  title,
  message: "m",
  category: null,
  is_active: true,
  is_demo: false,
  created_by: null,
  created_at: "",
  updated_at: "",
});

describe("normalizarAtalho", () => {
  it("remove a barra inicial, baixa a caixa e troca espaços por hífen", () => {
    expect(normalizarAtalho("/Proposta")).toBe("proposta");
    expect(normalizarAtalho("  Preço à vista ")).toBe("preço-à-vista");
  });

  it("string vazia e só-barra viram vazio", () => {
    expect(normalizarAtalho("")).toBe("");
    expect(normalizarAtalho("/")).toBe("");
  });
});

describe("filtrarRespostas", () => {
  const todas = [
    resposta("proposta", "Enviar proposta"),
    resposta("preco", "Tabela de preços"),
    resposta("site", "Link do site com proposta"),
  ];

  it("sem termo, devolve tudo", () => {
    expect(filtrarRespostas(todas, "")).toHaveLength(3);
    expect(filtrarRespostas(todas, "/")).toHaveLength(3);
  });

  it("prefixo do atalho vem antes de ocorrência no título", () => {
    const r = filtrarRespostas(todas, "prop");
    expect(r.map((x) => x.shortcut)).toEqual(["proposta", "site"]);
  });

  it("filtra por prefixo do atalho", () => {
    expect(filtrarRespostas(todas, "pre").map((x) => x.shortcut)).toEqual(["preco"]);
  });

  it("termo sem correspondência devolve vazio", () => {
    expect(filtrarRespostas(todas, "zzz")).toHaveLength(0);
  });
});

describe("aplicarVariaveis", () => {
  it("substitui variáveis com ponto e tolera espaços nas chaves", () => {
    const m = aplicarVariaveis("Olá {{contact.first_name}}, tudo bem? — {{ agent.name }}", {
      "contact.first_name": "João",
      "agent.name": "Ana",
    });
    expect(m).toBe("Olá João, tudo bem? — Ana");
  });

  it("variável sem valor vira vazio, nunca vaza o placeholder", () => {
    expect(aplicarVariaveis("Olá {{contact.first_name}}!", {})).toBe("Olá !");
    expect(aplicarVariaveis("Olá {{contact.first_name}}!", { "contact.first_name": null })).toBe("Olá !");
  });

  it("texto sem variáveis passa intacto", () => {
    expect(aplicarVariaveis("Sem variável nenhuma", { x: "y" })).toBe("Sem variável nenhuma");
  });
});

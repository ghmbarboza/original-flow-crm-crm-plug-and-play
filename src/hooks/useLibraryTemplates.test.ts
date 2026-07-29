import { describe, it, expect } from "vitest";
import {
  lerConteudo, rotuloCategoria, rotuloSubcategoria,
  DESTINO_POR_CATEGORIA, LIBRARY_CATEGORIES, type LibraryTemplate,
} from "./useLibraryTemplates";

/**
 * `lerConteudo` é a fronteira entre a biblioteca (dados) e a org do usuário
 * (escrita). Um modelo malformado tem que falhar aqui, com o título no erro, em
 * vez de virar registro quebrado na organização.
 */
function modelo(category: string, content: unknown, title = "Modelo X"): LibraryTemplate {
  return { category, content, title } as unknown as LibraryTemplate;
}

describe("lerConteudo", () => {
  it("lê sequência de email com as etapas", () => {
    const c = lerConteudo(modelo("email_sequence", {
      steps: [{ order: 1, delay_days: 0, subject: "S1", body: "B1" }],
    }));
    expect(c.tipo).toBe("email_sequence");
    if (c.tipo === "email_sequence") expect(c.steps).toHaveLength(1);
  });

  it("lê template de email", () => {
    const c = lerConteudo(modelo("email_template", { subject: "Assunto", body: "Corpo" }));
    if (c.tipo !== "email_template") throw new Error("tipo errado");
    expect(c.subject).toBe("Assunto");
    expect(c.body).toBe("Corpo");
  });

  it("lê follow-up e preenche os padrões ausentes", () => {
    const c = lerConteudo(modelo("followup", {
      steps: [{ order: 1, delay_hours: 24, message: "Oi" }, { order: 2, delay_hours: 48, message: "Oi 2" }],
    }));
    if (c.tipo !== "followup") throw new Error("tipo errado");
    // Sem max_attempts no modelo, cai no número de passos — não em zero.
    expect(c.max_attempts).toBe(2);
    expect(c.on_limit_reached).toBe("notify_agent");
  });

  it("respeita max_attempts e on_limit_reached quando informados", () => {
    const c = lerConteudo(modelo("followup", {
      steps: [{ order: 1, delay_hours: 2, message: "Oi" }],
      max_attempts: 5,
      on_limit_reached: "both",
    }));
    if (c.tipo !== "followup") throw new Error("tipo errado");
    expect(c.max_attempts).toBe(5);
    expect(c.on_limit_reached).toBe("both");
  });

  it("lê automação com conditions opcional", () => {
    const c = lerConteudo(modelo("automation", { trigger: { type: "t" }, actions: [{ type: "a" }] }));
    if (c.tipo !== "automation") throw new Error("tipo errado");
    expect(c.conditions).toEqual({});
  });

  it("lê FAQs e objeções", () => {
    const faq = lerConteudo(modelo("ai_faq", { faqs: [{ question: "q", answer: "a" }] }));
    expect(faq.tipo).toBe("ai_faq");
    const obj = lerConteudo(modelo("ai_objection", { objections: [{ objection: "o", response: "r" }] }));
    expect(obj.tipo).toBe("ai_objection");
  });

  describe("recusa modelo malformado citando o título", () => {
    const casos: [string, unknown, string][] = [
      ["email_sequence", { steps: [] }, "nenhuma etapa"],
      ["email_sequence", {}, "nenhuma etapa"],
      ["email_template", { subject: "só assunto" }, "assunto ou corpo"],
      ["followup", { steps: [] }, "nenhuma tentativa"],
      ["automation", { trigger: { type: "t" } }, "gatilho ou ações"],
      ["automation", { actions: [] }, "gatilho ou ações"],
      ["ai_faq", { faqs: [] }, "nenhuma pergunta"],
      ["ai_objection", {}, "nenhuma objeção"],
    ];

    for (const [categoria, content, esperado] of casos) {
      it(`${categoria}: ${esperado}`, () => {
        expect(() => lerConteudo(modelo(categoria, content, "Meu Modelo")))
          .toThrowError(/Meu Modelo/);
        expect(() => lerConteudo(modelo(categoria, content, "Meu Modelo")))
          .toThrowError(new RegExp(esperado));
      });
    }

    it("categoria desconhecida", () => {
      expect(() => lerConteudo(modelo("outra_coisa", {}))).toThrowError(/desconhecida/);
    });

    it("content nulo não estoura com TypeError", () => {
      expect(() => lerConteudo(modelo("ai_faq", null))).toThrowError(/nenhuma pergunta/);
    });
  });
});

describe("metadados das categorias", () => {
  it("toda categoria da lista tem destino de navegação", () => {
    for (const { value } of LIBRARY_CATEGORIES) {
      expect(DESTINO_POR_CATEGORIA[value], `sem destino: ${value}`).toBeTruthy();
      expect(DESTINO_POR_CATEGORIA[value].startsWith("/")).toBe(true);
    }
  });

  it("toda categoria tem rótulo legível", () => {
    for (const { value, label } of LIBRARY_CATEGORIES) {
      expect(rotuloCategoria(value)).toBe(label);
    }
  });

  it("rótulos desconhecidos caem no próprio valor em vez de vazio", () => {
    expect(rotuloCategoria("inexistente")).toBe("inexistente");
    expect(rotuloSubcategoria("inexistente")).toBe("inexistente");
  });

  it("traduz as subcategorias do seed", () => {
    expect(rotuloSubcategoria("pos_venda")).toBe("Pós-venda");
    expect(rotuloSubcategoria("boas_vindas")).toBe("Boas-vindas");
  });
});

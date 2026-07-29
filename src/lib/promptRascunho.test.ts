import { describe, it, expect } from "vitest";
import { PROMPT_BLOCKS, joinBlocks } from "@/hooks/useGenerateSystemPrompt";
import {
  montarPromptRascunho, contarPendencias, MARCA_PENDENTE, type ContextoRascunho,
} from "./promptRascunho";

const COMPLETO: ContextoRascunho = {
  name: "Imobiliária Alfa",
  business_sector: "imobiliario",
  business_description: "Venda e locação de imóveis residenciais",
  target_audience: "Famílias buscando o primeiro imóvel",
  main_problem_solved: "Achar imóvel adequado sem perder tempo",
  brand_tone: "consultivo",
  ai_prohibitions: "Nunca prometer aprovação de financiamento",
  good_response_example: "Cliente: tem apartamento de 2 quartos?\nSofia: Tenho sim! Para eu filtrar melhor, em qual bairro?",
};

describe("montarPromptRascunho", () => {
  it("devolve exatamente as chaves de PROMPT_BLOCKS, todas preenchidas", () => {
    const blocos = montarPromptRascunho(COMPLETO, "Sofia");
    expect(Object.keys(blocos).sort()).toEqual(PROMPT_BLOCKS.map((b) => b.key).sort());
    for (const { key } of PROMPT_BLOCKS) {
      expect(blocos[key].trim(), `bloco ${key} vazio`).not.toBe("");
    }
  });

  it("encaixa no mesmo joinBlocks do caminho com IA", () => {
    const prompt = joinBlocks(montarPromptRascunho(COMPLETO, "Sofia"));
    expect(prompt).toContain("<system_instruction>");
    for (const { key } of PROMPT_BLOCKS) {
      expect(prompt).toContain(`<${key}>`);
    }
  });

  it("usa o contexto coletado em vez de texto genérico", () => {
    const blocos = montarPromptRascunho(COMPLETO, "Sofia");
    expect(blocos.role).toContain("Sofia");
    expect(blocos.role).toContain("Imobiliária Alfa");
    expect(blocos.company).toContain("Venda e locação de imóveis residenciais");
    expect(blocos.company).toContain("Achar imóvel adequado sem perder tempo");
    expect(blocos.sector_context).toContain("Famílias buscando o primeiro imóvel");
    expect(blocos.guidelines).toContain("Nunca prometer aprovação de financiamento");
    expect(blocos.examples).toContain("2 quartos");
  });

  it("traz as etapas de funil do setor, que são conhecimento real do produto", () => {
    const blocos = montarPromptRascunho(COMPLETO, "Sofia");
    expect(blocos.sector_context).toContain("Visita agendada");
  });

  it("aplica as regras de escrita do tom escolhido", () => {
    const consultivo = montarPromptRascunho(COMPLETO, "Sofia");
    expect(consultivo.guidelines).toContain("Entenda antes de propor");

    const profissional = montarPromptRascunho({ ...COMPLETO, brand_tone: "profissional" }, "Sofia");
    expect(profissional.guidelines).toContain("Não use emojis");
  });

  // O ponto central: sem dado, marca pendência em vez de inventar.
  describe("contexto incompleto", () => {
    it("marca o que falta em vez de fabricar conteúdo", () => {
      const blocos = montarPromptRascunho({ business_sector: "saude" }, "Ana");
      expect(blocos.company).toContain(MARCA_PENDENTE);
      expect(blocos.sector_context).toContain(MARCA_PENDENTE);
      expect(blocos.guidelines).toContain(MARCA_PENDENTE);
      expect(blocos.examples).toContain(MARCA_PENDENTE);
    });

    it("não inventa conhecimento de setor", () => {
      const blocos = montarPromptRascunho({ business_sector: "imobiliario" }, "Ana");
      // Termos que um template tentado a "ajudar" inventaria — e que ninguém escreveu.
      for (const inventado of ["FGTS", "ITBI", "SFH", "Lei do Inquilinato", "Caixa"]) {
        expect(blocos.sector_context, `inventou "${inventado}"`).not.toContain(inventado);
      }
    });

    it("conta as pendências para a tela poder avisar", () => {
      expect(contarPendencias(montarPromptRascunho({}, "Ana"))).toBeGreaterThan(0);
      expect(contarPendencias(montarPromptRascunho(COMPLETO, "Sofia"))).toBe(1); // só sector_context
    });

    it("sobrevive a org nula e a nome de agente vazio", () => {
      const blocos = montarPromptRascunho(null, "   ");
      expect(blocos.role).toContain("Assistente");
      for (const { key } of PROMPT_BLOCKS) {
        expect(blocos[key].trim()).not.toBe("");
      }
    });

    it("trata setor desconhecido sem quebrar", () => {
      const blocos = montarPromptRascunho({ business_sector: "aeroespacial" }, "Ana");
      expect(blocos.role).toContain("não informado");
      expect(blocos.sector_context).toContain("Prospecção"); // funil padrão
    });
  });

  it("normaliza proibições multilinha em lista", () => {
    const blocos = montarPromptRascunho(
      { ...COMPLETO, ai_prohibitions: "Nunca dar desconto\nNunca falar de concorrente" },
      "Sofia",
    );
    expect(blocos.guidelines).toContain("- Nunca dar desconto");
    expect(blocos.guidelines).toContain("- Nunca falar de concorrente");
  });
});

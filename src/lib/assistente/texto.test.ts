import { describe, expect, it } from "vitest";
import { conversaComoTexto, paraTextoSimples } from "@/lib/assistente/texto";

const ORIGEM = "https://crm.exemplo.com";

describe("paraTextoSimples", () => {
  it("vira formatação do WhatsApp: negrito, itálico e riscado", () => {
    expect(paraTextoSimples("**R$ 10.000** em *aberto*, ~~antigo~~", ORIGEM)).toBe("*R$ 10.000* em _aberto_, ~antigo~");
    expect(paraTextoSimples("__importante__ e ***muito***", ORIGEM)).toBe("*importante* e *_muito_*");
  });

  it("link interno vira endereço completo, que abre fora do app", () => {
    expect(paraTextoSimples("Veja [Maria Souza](/contacts/abc)", ORIGEM)).toBe(`Veja Maria Souza (${ORIGEM}/contacts/abc)`);
  });

  it("títulos, listas e código", () => {
    const md = "### Resumo\n- um\n  - dois\n1. passo\n`Ctrl+K`";
    expect(paraTextoSimples(md, ORIGEM)).toBe("*Resumo*\n• um\n  • dois\n1. passo\nCtrl+K");
  });

  it("tabela vira uma linha por item, com o nome de cada coluna", () => {
    const md = "| Etapa | Qtd |\n|---|---|\n| Lead | 3 |\n| Demo | 1 |\nfim";
    expect(paraTextoSimples(md, ORIGEM)).toBe("• Etapa: Lead · Qtd: 3\n• Etapa: Demo · Qtd: 1\nfim");
  });

  it("não confunde asterisco de multiplicação nem sublinhado no meio da palavra", () => {
    expect(paraTextoSimples("2 * 3 = 6 e nome_do_campo", ORIGEM)).toBe("2 * 3 = 6 e nome_do_campo");
  });
});

describe("conversaComoTexto", () => {
  it("junta perguntas e respostas e deixa os erros de fora", () => {
    const texto = conversaComoTexto("Funil de hoje", [
      { papel: "usuario", texto: "Como está o funil?" },
      { papel: "assistente", texto: "O assistente está indisponível.", erro: true },
      { papel: "assistente", texto: "**3** negócios em [Negócios](/deals)" },
    ], ORIGEM);
    expect(texto).toBe(`*Funil de hoje*\n\n*Pergunta:* Como está o funil?\n\n*Assistente:*\n*3* negócios em Negócios (${ORIGEM}/deals)`);
  });
});

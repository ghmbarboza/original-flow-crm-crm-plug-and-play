import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RespostaMarkdown } from "@/components/assistente/RespostaMarkdown";

const montar = (texto: string) => render(<MemoryRouter><RespostaMarkdown texto={texto} /></MemoryRouter>).container;

describe("RespostaMarkdown", () => {
  it("negrito, itálico, riscado e código sem mostrar os símbolos", () => {
    const c = montar("**R$ 5.000** em *aberto*, ~~velho~~ e `Ctrl+K`");
    expect(c.querySelector("strong")?.textContent).toBe("R$ 5.000");
    expect(c.querySelector("em")?.textContent).toBe("aberto");
    expect(c.querySelector("s")?.textContent).toBe("velho");
    expect(c.querySelector("code")?.textContent).toBe("Ctrl+K");
    expect(c.textContent).not.toMatch(/[*~`]/);
  });

  it("negrito dentro de link e itálico com sublinhado", () => {
    const c = montar("Veja [**Maria**](/contacts/1) e _nota_");
    const link = c.querySelector("a");
    expect(link?.getAttribute("href")).toBe("/contacts/1");
    expect(link?.querySelector("strong")?.textContent).toBe("Maria");
    expect(c.querySelector("em")?.textContent).toBe("nota");
  });

  it("só tela do app vira link: javascript:, //host e endereço externo ficam como texto", () => {
    const c = montar("[clique](javascript:alert(1)) e [x](//mal.com) e [site](https://mal.com) e https://exemplo.com/a");
    expect(c.querySelectorAll("a")).toHaveLength(0);
    expect(c.textContent).toContain("clique");
    expect(c.textContent).toContain("https://exemplo.com/a");
  });

  it("passos numerados com explicação entre eles seguem 1, 2, 3", () => {
    const c = montar("1. **Abra** Negócios\n   escolha o funil\n\n2. Clique em Novo\n\n3. Salve");
    const listas = c.querySelectorAll("ol");
    const numeros = [...listas].flatMap((ol) => [...ol.querySelectorAll(":scope > li")].map((_, k) => Number(ol.getAttribute("start") ?? 1) + k));
    expect(numeros).toEqual([1, 2, 3]);
    expect(c.querySelector("ol li")?.textContent).toBe("Abra Negócios escolha o funil");
  });

  it("não formata multiplicação nem nome_com_sublinhado", () => {
    const c = montar("2 * 3 * 4 e nome_do_campo");
    expect(c.querySelector("em")).toBeNull();
    expect(c.textContent).toBe("2 * 3 * 4 e nome_do_campo");
  });

  it("lista com subitens, títulos, citação, divisória, tabela e bloco de código", () => {
    const c = montar("### Resumo\n- um\n  - dois\n1. passo\n> atenção\n---\n| A | B |\n|---|---|\n| 1 | 2 |\n```\nlinha *crua*\n```");
    expect(c.querySelector("ul ul li")?.textContent).toBe("dois");
    expect(c.querySelector("ol li")?.textContent).toBe("passo");
    expect(c.querySelector("blockquote")?.textContent).toBe("atenção");
    expect(c.querySelector("hr")).not.toBeNull();
    expect(c.querySelectorAll("td")).toHaveLength(2);
    expect(c.querySelector("pre")?.textContent).toBe("linha *crua*");
    expect(c.textContent).toContain("Resumo");
    expect(c.textContent).not.toContain("###");
  });
});

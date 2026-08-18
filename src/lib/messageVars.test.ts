import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { VARIAVEIS_MENSAGEM, renderVariaveis, valoresDoContato } from "./messageVars";

describe("variáveis de mensagem programada", () => {
  it("substitui as três variáveis suportadas", () => {
    const vals = valoresDoContato({ first_name: "Guilherme", last_name: "Barboza" });
    expect(renderVariaveis("Olá {{contact.first_name}}!", vals)).toBe("Olá Guilherme!");
    expect(renderVariaveis("{{contact.last_name}}", vals)).toBe("Barboza");
    expect(renderVariaveis("{{contact.name}}", vals)).toBe("Guilherme Barboza");
  });

  it("aceita espaços dentro das chaves, como o dispatcher", () => {
    const vals = valoresDoContato({ first_name: "Ana", last_name: null });
    expect(renderVariaveis("Oi {{  contact.first_name  }}", vals)).toBe("Oi Ana");
  });

  it("troca variável desconhecida por vazio — é o que o envio faz", () => {
    const vals = valoresDoContato({ first_name: "Ana", last_name: null });
    expect(renderVariaveis("Oi {{contact.email}}!", vals)).toBe("Oi !");
  });

  it("contato sem sobrenome não deixa espaço sobrando no nome completo", () => {
    const vals = valoresDoContato({ first_name: "Ana", last_name: null });
    expect(renderVariaveis("{{contact.name}}", vals)).toBe("Ana");
  });

  /**
   * A trava que dá sentido à lista: a interface não pode oferecer uma variável
   * que o servidor não substitui — ela chegaria vazia no cliente, sem aviso.
   */
  it("não oferece nenhuma variável que o dispatcher não conheça", () => {
    const fonte = fs.readFileSync(
      "supabase/functions/scheduled-message-dispatcher/index.ts",
      "utf8",
    );
    for (const { chave } of VARIAVEIS_MENSAGEM) {
      expect(fonte, `o dispatcher não substitui {{${chave}}}`).toContain(`"${chave}"`);
    }
  });
});

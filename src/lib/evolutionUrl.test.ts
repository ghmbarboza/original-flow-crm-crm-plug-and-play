import { describe, it, expect } from "vitest";
import { normalizarServerUrl } from "./evolutionUrl";

describe("normalizarServerUrl", () => {
  it("remove o /manager do painel", () => {
    expect(normalizarServerUrl("https://evo.exemplo.com/manager")).toBe("https://evo.exemplo.com");
  });

  it("remove /manager com barra final", () => {
    expect(normalizarServerUrl("https://evo.exemplo.com/manager/")).toBe("https://evo.exemplo.com");
  });

  it("aceita /MANAGER em qualquer caixa", () => {
    expect(normalizarServerUrl("https://evo.exemplo.com/Manager")).toBe("https://evo.exemplo.com");
  });

  it("remove barra final sozinha", () => {
    expect(normalizarServerUrl("http://1.2.3.4:8080/")).toBe("http://1.2.3.4:8080");
  });

  it("apara espaços colados junto do endereço", () => {
    expect(normalizarServerUrl("  https://evo.exemplo.com  ")).toBe("https://evo.exemplo.com");
  });

  it("deixa a URL correta intacta", () => {
    expect(normalizarServerUrl("https://evo.exemplo.com")).toBe("https://evo.exemplo.com");
  });

  it("não corta um host que apenas contém 'manager' no nome", () => {
    // Só o SEGMENTO final /manager é do painel; `manager.exemplo.com` é um host.
    expect(normalizarServerUrl("https://manager.exemplo.com")).toBe("https://manager.exemplo.com");
  });

  it("não corta /manager no meio do caminho", () => {
    expect(normalizarServerUrl("https://evo.exemplo.com/manager/api")).toBe(
      "https://evo.exemplo.com/manager/api",
    );
  });
});

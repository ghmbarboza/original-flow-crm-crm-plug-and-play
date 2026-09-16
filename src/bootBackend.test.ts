import { describe, it, expect } from "vitest";
import { backendDoBuild, telaSemBackend } from "./bootBackend";

describe("conferência do backend no boot", () => {
  it("reconhece o build completo", () => {
    expect(backendDoBuild({ VITE_SUPABASE_URL: "https://abc.supabase.co", VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x" }))
      .toEqual({ url: "https://abc.supabase.co", chave: "sb_publishable_x" });
  });

  it("build de remix sem backend devolve null", () => {
    expect(backendDoBuild({})).toBeNull();
    expect(backendDoBuild({ VITE_SUPABASE_URL: "https://abc.supabase.co" })).toBeNull();
    expect(backendDoBuild({ VITE_SUPABASE_URL: "   ", VITE_SUPABASE_PUBLISHABLE_KEY: "x" })).toBeNull();
    expect(backendDoBuild({ VITE_SUPABASE_URL: undefined, VITE_SUPABASE_PUBLISHABLE_KEY: "x" })).toBeNull();
  });

  it("a tela diz o que fazer, em vez de ficar branca", () => {
    const raiz = document.createElement("div");
    telaSemBackend(raiz);
    expect(raiz.textContent).toContain("Publicar");
    expect(raiz.textContent).toContain("banco de dados");
  });
});

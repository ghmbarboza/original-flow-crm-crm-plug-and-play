import { describe, expect, it, vi } from "vitest";
import {
  isStaleChunkError,
  limparFlagDeChunkObsoleto,
  recarregarUmaVezPorChunkObsoleto,
} from "./staleChunk";

function fakeStorage(inicial: Record<string, string> = {}) {
  const dados = { ...inicial };
  return {
    dados,
    getItem: (k: string) => dados[k] ?? null,
    setItem: (k: string, v: string) => void (dados[k] = v),
    removeItem: (k: string) => void delete dados[k],
  };
}

describe("isStaleChunkError", () => {
  it("reconhece o erro de import dinâmico do Vite", () => {
    expect(
      isStaleChunkError(
        new Error("Failed to fetch dynamically imported module: /assets/InboxPage-a1b2.js"),
      ),
    ).toBe(true);
  });

  it("reconhece a variante de module script do Safari/Firefox", () => {
    expect(isStaleChunkError(new Error("Importing a module script failed."))).toBe(true);
  });

  it("ignora erros de render comuns", () => {
    expect(isStaleChunkError(new Error("Cannot read properties of undefined"))).toBe(false);
    expect(isStaleChunkError(undefined)).toBe(false);
  });
});

describe("recarregarUmaVezPorChunkObsoleto", () => {
  it("recarrega na primeira vez e marca a tentativa", () => {
    const storage = fakeStorage();
    const recarregar = vi.fn();

    expect(recarregarUmaVezPorChunkObsoleto(storage, recarregar)).toBe(true);
    expect(recarregar).toHaveBeenCalledTimes(1);
  });

  it("não recarrega de novo quando o reload não resolveu", () => {
    const storage = fakeStorage();
    const recarregar = vi.fn();
    recarregarUmaVezPorChunkObsoleto(storage, recarregar);

    expect(recarregarUmaVezPorChunkObsoleto(storage, recarregar)).toBe(false);
    expect(recarregar).toHaveBeenCalledTimes(1);
  });

  it("volta a permitir reload depois que o app renderiza com sucesso", () => {
    const storage = fakeStorage();
    const recarregar = vi.fn();
    recarregarUmaVezPorChunkObsoleto(storage, recarregar);
    limparFlagDeChunkObsoleto(storage);

    expect(recarregarUmaVezPorChunkObsoleto(storage, recarregar)).toBe(true);
    expect(recarregar).toHaveBeenCalledTimes(2);
  });

  it("é inofensivo sem sessionStorage disponível", () => {
    const recarregar = vi.fn();
    expect(recarregarUmaVezPorChunkObsoleto(undefined, recarregar)).toBe(false);
    expect(recarregar).not.toHaveBeenCalled();
  });
});

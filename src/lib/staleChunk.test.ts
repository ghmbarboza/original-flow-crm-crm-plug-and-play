import { describe, expect, it, vi } from "vitest";
import {
  isStaleChunkError,
  JANELA_ENTRE_RELOADS_MS,
  recarregarUmaVezPorChunkObsoleto,
} from "./staleChunk";

function fakeStorage(inicial: Record<string, string> = {}) {
  const dados = { ...inicial };
  return {
    dados,
    getItem: (k: string) => dados[k] ?? null,
    setItem: (k: string, v: string) => void (dados[k] = v),
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
  it("recarrega na primeira vez e registra o instante", () => {
    const storage = fakeStorage();
    const recarregar = vi.fn();

    expect(recarregarUmaVezPorChunkObsoleto(storage, recarregar, 1_000)).toBe(true);
    expect(recarregar).toHaveBeenCalledTimes(1);
  });

  it("não recarrega de novo dentro da janela — mesmo após remontagem (pós-reload)", () => {
    const storage = fakeStorage();
    const recarregar = vi.fn();
    recarregarUmaVezPorChunkObsoleto(storage, recarregar, 1_000);

    // Simula o ciclo real de loop: reload → app remonta → chunk falha de novo.
    expect(recarregarUmaVezPorChunkObsoleto(storage, recarregar, 3_000)).toBe(false);
    expect(recarregarUmaVezPorChunkObsoleto(storage, recarregar, 30_000)).toBe(false);
    expect(recarregar).toHaveBeenCalledTimes(1);
  });

  it("volta a permitir reload num incidente futuro, passada a janela", () => {
    const storage = fakeStorage();
    const recarregar = vi.fn();
    recarregarUmaVezPorChunkObsoleto(storage, recarregar, 1_000);

    expect(
      recarregarUmaVezPorChunkObsoleto(storage, recarregar, 1_000 + JANELA_ENTRE_RELOADS_MS),
    ).toBe(true);
    expect(recarregar).toHaveBeenCalledTimes(2);
  });

  it("ignora flag corrompida no storage", () => {
    const storage = fakeStorage({ "via:stale-chunk-reload": "não-é-número" });
    const recarregar = vi.fn();
    expect(recarregarUmaVezPorChunkObsoleto(storage, recarregar, 1_000)).toBe(true);
    expect(recarregar).toHaveBeenCalledTimes(1);
  });

  it("é inofensivo sem sessionStorage disponível", () => {
    const recarregar = vi.fn();
    expect(recarregarUmaVezPorChunkObsoleto(undefined, recarregar)).toBe(false);
    expect(recarregar).not.toHaveBeenCalled();
  });
});

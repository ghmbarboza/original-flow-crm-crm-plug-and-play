import { describe, expect, it } from "vitest";
import {
  MAX_NOME_ETAPA, efeitosDaExclusao, lerProbabilidade, motivoDoBloqueio, moverEtapa, validarNomeEtapa,
} from "@/lib/etapasFunil";

const semUso = { negocios: 0, formularios: 0, perfisDeOrigem: 0, gatilhosDeResposta: 0 };

describe("moverEtapa", () => {
  const ids = ["a", "b", "c", "d"];

  it("leva a etapa para a nova posição e empurra as outras", () => {
    expect(moverEtapa(ids, 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moverEtapa(ids, 3, 0)).toEqual(["d", "a", "b", "c"]);
  });

  it("não altera a lista original", () => {
    moverEtapa(ids, 0, 3);
    expect(ids).toEqual(["a", "b", "c", "d"]);
  });

  it("devolve a mesma ordem quando a posição não muda ou é inválida", () => {
    expect(moverEtapa(ids, 1, 1)).toEqual(ids);
    expect(moverEtapa(ids, -1, 2)).toEqual(ids);
    expect(moverEtapa(ids, 0, 4)).toEqual(ids);
  });
});

describe("validarNomeEtapa", () => {
  const outras = ["Lead", "Proposta"];

  it("aceita nome novo", () => {
    expect(validarNomeEtapa("Negociação", outras)).toBeNull();
  });

  it("recusa vazio e só espaços", () => {
    expect(validarNomeEtapa("   ", outras)).toMatch(/nome/i);
  });

  it("recusa nome repetido, sem diferenciar maiúsculas nem espaços nas pontas", () => {
    expect(validarNomeEtapa("  lead ", outras)).toMatch(/já existe/i);
  });

  it("recusa nome acima do tamanho máximo", () => {
    expect(validarNomeEtapa("x".repeat(MAX_NOME_ETAPA + 1), outras)).toMatch(String(MAX_NOME_ETAPA));
  });
});

describe("lerProbabilidade", () => {
  it("lê número de 0 a 100 e arredonda", () => {
    expect(lerProbabilidade("0")).toBe(0);
    expect(lerProbabilidade(" 62,5 ")).toBe(63);
    expect(lerProbabilidade("100")).toBe(100);
  });

  it("recusa vazio, texto e fora da faixa, em vez de assumir um número", () => {
    expect(lerProbabilidade("")).toBeNull();
    expect(lerProbabilidade("abc")).toBeNull();
    expect(lerProbabilidade("101")).toBeNull();
    expect(lerProbabilidade("-1")).toBeNull();
  });
});

describe("motivoDoBloqueio", () => {
  it("libera etapa vazia que não é a única", () => {
    expect(motivoDoBloqueio({ unica: false, uso: semUso, falhouConferir: false })).toBeNull();
  });

  it("bloqueia a única etapa do funil", () => {
    expect(motivoDoBloqueio({ unica: true, uso: semUso, falhouConferir: false })).toMatch(/pelo menos uma etapa/);
  });

  it("bloqueia etapa com negócio e diz quantos", () => {
    expect(motivoDoBloqueio({ unica: false, uso: { ...semUso, negocios: 1 }, falhouConferir: false })).toMatch(/1 negócio,/);
    expect(motivoDoBloqueio({ unica: false, uso: { ...semUso, negocios: 3 }, falhouConferir: false })).toMatch(/3 negócios/);
  });

  it("bloqueia quando não deu para conferir, em vez de liberar no escuro", () => {
    expect(motivoDoBloqueio({ unica: false, uso: undefined, falhouConferir: true })).toMatch(/conferir/);
  });
});

describe("efeitosDaExclusao", () => {
  it("não lista nada quando ninguém aponta para a etapa", () => {
    expect(efeitosDaExclusao(semUso)).toEqual([]);
  });

  it("avisa de formulário, perfil de origem e gatilho que mudam de comportamento", () => {
    const efeitos = efeitosDaExclusao({ negocios: 0, formularios: 2, perfisDeOrigem: 1, gatilhosDeResposta: 1 });
    expect(efeitos).toHaveLength(3);
    expect(efeitos[0]).toMatch(/2 formulários passam/);
    expect(efeitos[1]).toMatch(/1 perfil de origem da IA passa/);
    expect(efeitos[2]).toMatch(/qualquer etapa anterior/);
  });
});

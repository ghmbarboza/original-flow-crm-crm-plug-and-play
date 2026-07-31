import { describe, expect, it } from "vitest";
import {
  duplicateReasons, findDuplicatePairs, normalizeName, normalizePhone, phonesMatch,
  type DuplicateCandidate,
} from "@/lib/duplicates";

function contato(partial: Partial<DuplicateCandidate> & { id: string }): DuplicateCandidate {
  return {
    first_name: "",
    last_name: null,
    email: null,
    phone: null,
    whatsapp_phone: null,
    ...partial,
  };
}

describe("normalizePhone / phonesMatch", () => {
  it("normaliza máscara brasileira para dígitos", () => {
    expect(normalizePhone("(11) 99999-8888")).toBe("11999998888");
  });

  it("descarta números curtos demais", () => {
    expect(normalizePhone("4004")).toBeNull();
  });

  it("casa com e sem código do país", () => {
    expect(phonesMatch("5511999998888", "11999998888")).toBe(true);
  });

  it("não casa sufixo curto (ramal parecido em DDDs diferentes)", () => {
    expect(phonesMatch("1188887777", "2188887777")).toBe(false);
  });
});

describe("normalizeName", () => {
  it("ignora acento, caixa e espaços", () => {
    expect(normalizeName("João", "Silva")).toBe(normalizeName("joao", " silva "));
  });

  it("nome de uma palavra só não vale como assinatura", () => {
    expect(normalizeName("Maria", null)).toBeNull();
  });
});

describe("duplicateReasons", () => {
  it("acumula motivos", () => {
    const a = contato({ id: "1", first_name: "João", last_name: "Silva", email: "joao@x.com", phone: "11999998888" });
    const b = contato({ id: "2", first_name: "Joao", last_name: "Silva", email: "JOAO@x.com", whatsapp_phone: "5511999998888" });
    expect(duplicateReasons(a, b)).toEqual(["Mesmo email", "Mesmo telefone", "Mesmo nome"]);
  });

  it("sem nada em comum, sem motivos", () => {
    const a = contato({ id: "1", first_name: "Ana", last_name: "Lima", email: "ana@x.com" });
    const b = contato({ id: "2", first_name: "Bia", last_name: "Souza", email: "bia@x.com" });
    expect(duplicateReasons(a, b)).toEqual([]);
  });
});

describe("findDuplicatePairs", () => {
  it("encontra pares por email, telefone e nome, sem repetir par", () => {
    const contatos = [
      contato({ id: "1", first_name: "João", last_name: "Silva", email: "joao@x.com", phone: "11999998888" }),
      contato({ id: "2", first_name: "Joao", last_name: "Silva", email: "joao@x.com", whatsapp_phone: "5511999998888" }),
      contato({ id: "3", first_name: "Ana", last_name: "Lima", email: "ana@x.com" }),
    ];
    const pairs = findDuplicatePairs(contatos);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].a.id).toBe("1");
    expect(pairs[0].b.id).toBe("2");
    expect(pairs[0].reasons).toHaveLength(3);
  });

  it("pares mais fortes vêm primeiro", () => {
    const contatos = [
      contato({ id: "1", first_name: "João", last_name: "Silva", email: "joao@x.com", phone: "11999998888" }),
      contato({ id: "2", first_name: "Joao", last_name: "Silva", email: "joao@x.com", phone: "11999998888" }),
      contato({ id: "3", first_name: "Ana", last_name: "Lima", email: "ana@x.com" }),
      contato({ id: "4", first_name: "Ana Clara", last_name: "Souza", email: "ana@x.com" }),
    ];
    const pairs = findDuplicatePairs(contatos);
    expect(pairs).toHaveLength(2);
    expect(pairs[0].reasons.length).toBeGreaterThan(pairs[1].reasons.length);
  });

  it("lista grande sem duplicatas não explode", () => {
    const contatos = Array.from({ length: 5000 }, (_, i) =>
      contato({ id: String(i), first_name: `Nome${i}`, last_name: `Sobrenome${i}`, email: `c${i}@x.com`, phone: `119${String(i).padStart(8, "0")}` }),
    );
    expect(findDuplicatePairs(contatos)).toHaveLength(0);
  });
});

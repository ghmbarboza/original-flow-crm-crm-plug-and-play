import { describe, expect, it } from "vitest";
import {
  missingRequiredFields, parseRequiredFields, type DealForValidation,
} from "@/lib/required-fields";

const dealCompleto: DealForValidation = {
  value: 5000,
  company_id: "c-1",
  close_date: "2026-08-15",
  contact: {
    email: "maria@x.com",
    phone: "(11) 99999-9999",
    whatsapp_phone: null,
  },
};

describe("parseRequiredFields", () => {
  it("lê o formato do guia", () => {
    expect(
      parseRequiredFields([
        { field: "contact.email" },
        { field: "deal.value", min: 1 },
      ]),
    ).toEqual([{ field: "contact.email" }, { field: "deal.value", min: 1 }]);
  });

  it("tolera JSONB nulo, não-array e itens malformados", () => {
    expect(parseRequiredFields(null)).toEqual([]);
    expect(parseRequiredFields({} as never)).toEqual([]);
    expect(parseRequiredFields(["contact.email", { min: 2 }, null])).toEqual([]);
  });
});

describe("missingRequiredFields", () => {
  it("libera quando tudo está preenchido", () => {
    const rules = parseRequiredFields([
      { field: "contact.email" },
      { field: "contact.phone" },
      { field: "deal.value", min: 1 },
      { field: "deal.company" },
      { field: "deal.close_date" },
    ]);
    expect(missingRequiredFields(rules, dealCompleto)).toEqual([]);
  });

  it("aponta cada campo faltante com rótulo legível", () => {
    const vazio: DealForValidation = {
      value: 0,
      company_id: null,
      close_date: null,
      contact: null,
    };
    const rules = parseRequiredFields([
      { field: "contact.email" },
      { field: "deal.value", min: 1 },
      { field: "deal.company" },
    ]);
    expect(missingRequiredFields(rules, vazio)).toEqual([
      "Email do contato",
      "Valor do negócio (maior que zero)",
      "Empresa vinculada",
    ]);
  });

  it("aceita WhatsApp como telefone do contato", () => {
    const deal = {
      ...dealCompleto,
      contact: { email: null, phone: null, whatsapp_phone: "5511988887777" },
    };
    expect(missingRequiredFields([{ field: "contact.phone" }], deal)).toEqual([]);
    expect(missingRequiredFields([{ field: "contact.email" }], deal)).toEqual(["Email do contato"]);
  });

  it("valor em branco ou abaixo do mínimo bloqueia", () => {
    expect(
      missingRequiredFields([{ field: "deal.value", min: 1 }], { ...dealCompleto, value: null }),
    ).toEqual(["Valor do negócio (maior que zero)"]);
    expect(
      missingRequiredFields([{ field: "deal.value", min: 1000 }], { ...dealCompleto, value: 500 }),
    ).toEqual(["Valor do negócio (maior que zero)"]);
  });

  it("string só de espaços não conta como preenchido", () => {
    const deal = {
      ...dealCompleto,
      contact: { email: "   ", phone: "  ", whatsapp_phone: null },
    };
    expect(missingRequiredFields([{ field: "contact.email" }, { field: "contact.phone" }], deal)).toEqual([
      "Email do contato",
      "Telefone do contato",
    ]);
  });

  it("regra desconhecida não bloqueia a movimentação", () => {
    expect(missingRequiredFields([{ field: "deal.inexistente" }], dealCompleto)).toEqual([]);
  });
});

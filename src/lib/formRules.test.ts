import { describe, expect, it } from "vitest";
import {
  campoVisivel, lerTrackingDaPagina, origemDoTracking, parseCaptureFields, validarValores, type CaptureField,
} from "./formRules";

const campos: CaptureField[] = [
  { key: "name", label: "Nome", type: "text", required: true },
  { key: "email", label: "E-mail", type: "email", required: true },
  { key: "interesse", label: "Interesse", type: "select", required: true, options: ["Plano mensal", "Plano anual"] },
  { key: "usuarios", label: "Quantos usuários", type: "number", required: true, show_when: { field: "interesse", op: "eq", value: "Plano anual" } },
  { key: "aceite", label: "Aceito contato", type: "checkbox", required: true },
];

describe("regras do formulário", () => {
  it("esconde o campo condicional e não o exige", () => {
    const values = { name: "Ana", email: "ana@x.com", interesse: "Plano mensal", aceite: "true" };
    expect(campoVisivel(campos[3], values)).toBe(false);
    expect(validarValores(campos, values)).toBeNull();
  });

  it("exige o campo condicional quando a regra bate", () => {
    const values = { name: "Ana", email: "ana@x.com", interesse: "Plano anual", aceite: "true" };
    expect(campoVisivel(campos[3], values)).toBe(true);
    expect(validarValores(campos, values)).toBe('Preencha o campo "Quantos usuários".');
    expect(validarValores(campos, { ...values, usuarios: "abc" })).toBe('Informe um número em "Quantos usuários".');
    expect(validarValores(campos, { ...values, usuarios: "12" })).toBeNull();
  });

  it("valida e-mail, opção da lista e checkbox obrigatório", () => {
    expect(validarValores(campos, { name: "Ana", email: "ana", interesse: "Plano mensal", aceite: "true" })).toMatch(/e-mail válido/);
    expect(validarValores(campos, { name: "Ana", email: "ana@x.com", interesse: "Outro", aceite: "true" })).toMatch(/opção válida/);
    expect(validarValores(campos, { name: "Ana", email: "ana@x.com", interesse: "Plano mensal", aceite: "false" })).toBe('Marque "Aceito contato".');
  });

  it("lê UTMs, referrer e página da URL", () => {
    const t = lerTrackingDaPagina("https://site.com.br/landing?utm_source=Meta%20Ads&utm_campaign=set&gclid=abc", "https://google.com/");
    expect(t).toMatchObject({ utm_source: "Meta Ads", utm_campaign: "set", gclid: "abc", referrer: "https://google.com/", page_url: "https://site.com.br/landing" });
  });

  it("origem vem do utm_source limpo, senão do padrão do formulário", () => {
    expect(origemDoTracking({ utm_source: "Meta Ads" }, "capture_form")).toBe("meta_ads");
    expect(origemDoTracking({}, "site")).toBe("site");
    expect(origemDoTracking({}, null)).toBe("capture_form");
  });

  it("tolera campos legados sem tipo", () => {
    const parsed = parseCaptureFields([{ key: "name", label: "Nome" }, { key: "x" }, null]);
    expect(parsed).toEqual([{ key: "name", label: "Nome", type: "text", required: false, options: undefined, help: undefined, value: undefined, show_when: null }]);
  });
});

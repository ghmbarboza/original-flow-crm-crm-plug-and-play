import { describe, it, expect } from "vitest";
import fs from "node:fs";
import {
  JANELA_ATENDIMENTO_MS, conversaUsaTemplate, janelaFechada, primeiroNomeDaConversa,
  renderTemplate, sugerirParametros, variaveisDoTemplate,
} from "./templateWhatsapp";

const AGORA = Date.parse("2026-10-13T15:00:00Z");
const haHoras = (h: number) => new Date(AGORA - h * 60 * 60 * 1000).toISOString();
const msg = (direction: string, horas: number, nota = false) => ({
  direction, sent_at: haHoras(horas), is_internal_note: nota,
});

describe("janela de 24h do WhatsApp oficial", () => {
  it("só existe no WhatsApp pela API oficial ou pelo Zernio", () => {
    expect(conversaUsaTemplate({ channel: "whatsapp", provider: "meta_official" })).toBe(true);
    expect(conversaUsaTemplate({ channel: "whatsapp", provider: "zernio" })).toBe(true);
    expect(conversaUsaTemplate({ channel: "whatsapp", provider: "evolution" })).toBe(false);
    expect(conversaUsaTemplate({ channel: "instagram", provider: "zernio" })).toBe(false);
  });

  it("fica aberta enquanto a última mensagem do cliente tem menos de 24h", () => {
    expect(janelaFechada([msg("inbound", 30), msg("inbound", 23)], AGORA)).toBe(false);
  });

  it("fecha quando a última mensagem do cliente passou de 24h", () => {
    expect(janelaFechada([msg("inbound", 25)], AGORA)).toBe(true);
  });

  it("mensagem enviada pela equipe não reabre a janela", () => {
    expect(janelaFechada([msg("inbound", 30), msg("outbound", 1)], AGORA)).toBe(true);
  });

  it("conversa em que o cliente nunca escreveu nasce fechada", () => {
    expect(janelaFechada([msg("outbound", 2)], AGORA)).toBe(true);
    expect(janelaFechada([], AGORA)).toBe(true);
  });

  it("nota interna não conta como mensagem do cliente", () => {
    expect(janelaFechada([msg("inbound", 1, true)], AGORA)).toBe(true);
  });

  it("o limite é de 24 horas", () => {
    expect(JANELA_ATENDIMENTO_MS).toBe(24 * 60 * 60 * 1000);
  });
});

describe("variáveis do template", () => {
  it("lista as variáveis sem repetir, na ordem numérica", () => {
    expect(variaveisDoTemplate("Pedido {{2}} de {{1}}, {{ 1 }}")).toEqual(["1", "2"]);
    expect(variaveisDoTemplate("Sem variável")).toEqual([]);
  });

  it("preenche com o primeiro nome a variável que vem depois de um cumprimento", () => {
    expect(sugerirParametros("Olá {{1}}, tudo bem?", "Marina")).toEqual(["Marina"]);
    expect(sugerirParametros("Oi, {{1}}! Seu pedido {{2}} saiu.", "Marina")).toEqual(["Marina", ""]);
    expect(sugerirParametros("Bom dia {{1}}", "Marina")).toEqual(["Marina"]);
  });

  it("não chuta o nome em variável que não é de cumprimento", () => {
    expect(sugerirParametros("Seu pedido {{1}} está pronto.", "Marina")).toEqual([""]);
  });

  it("sem nome conhecido deixa o campo para a pessoa preencher", () => {
    expect(sugerirParametros("Olá {{1}}", "")).toEqual([""]);
  });

  it("monta o texto final trocando cada variável pelo valor", () => {
    expect(renderTemplate("Olá {{1}}, pedido {{ 2 }} ({{1}})", ["Marina", "A-7"]))
      .toBe("Olá Marina, pedido A-7 (Marina)");
  });
});

describe("primeiro nome vindo da conversa", () => {
  it("usa o contato do CRM quando existe", () => {
    expect(primeiroNomeDaConversa({
      contact: { first_name: "Marina", last_name: "Souza" }, channel_contact_name: "Mari",
    })).toBe("Marina");
  });

  it("sem contato, usa a primeira palavra do nome do WhatsApp", () => {
    expect(primeiroNomeDaConversa({ contact: null, channel_contact_name: "  Marina Souza " })).toBe("Marina");
  });

  it("sem nenhum nome, devolve vazio (telefone não é nome)", () => {
    expect(primeiroNomeDaConversa({ contact: null, channel_contact_name: null })).toBe("");
  });
});

/**
 * O texto que a pessoa vê na prévia é montado aqui; o que fica gravado na
 * conversa é montado pela edge function. As duas regras precisam ser a mesma.
 */
describe("prévia igual ao que o servidor grava", () => {
  it("usa o mesmo padrão de variável do módulo compartilhado das functions", () => {
    const servidor = fs.readFileSync("supabase/functions/_shared/templateWhatsapp.ts", "utf8");
    const tela = fs.readFileSync("src/lib/templateWhatsapp.ts", "utf8");
    const padrao = /const PADRAO_VARIAVEL = (.+);/;
    expect(tela.match(padrao)?.[1]).toBeTruthy();
    expect(servidor.match(padrao)?.[1]).toBe(tela.match(padrao)?.[1]);
  });
});

// deno test supabase/functions/_shared/templateWhatsapp_test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  contarParametros, corpoMeta, corpoZernio, normalizarTemplate, renderTemplate, validarParametros,
} from "./templateWhatsapp.ts";

const aprovado = { name: "retomada", language: "pt_BR", status: "APPROVED", category: "UTILITY", body_text: "Olá {{1}}, pedido {{2}}.", param_count: 2, id: "1" };

Deno.test("normaliza o template da Meta e do Zernio (type maiúsculo ou minúsculo)", () => {
  const meta = normalizarTemplate({ id: "9", name: "a", status: "approved", category: "utility", language: "pt_BR", components: [{ type: "BODY", text: "Oi {{1}}" }] });
  assertEquals(meta.status, "APPROVED");
  assertEquals(meta.body_text, "Oi {{1}}");
  assertEquals(meta.param_count, 1);
  const zernio = normalizarTemplate({ name: "b", components: [{ type: "body", text: "Sem variável" }] });
  assertEquals(zernio.param_count, 0);
  assertEquals(zernio.id, null);
});

Deno.test("conta variáveis distintas", () => {
  assertEquals(contarParametros("{{1}} {{2}} {{ 1 }}"), 2);
});

Deno.test("monta o texto que fica gravado na conversa", () => {
  assertEquals(renderTemplate(aprovado.body_text, ["Marina", "A-7"]), "Olá Marina, pedido A-7.");
});

Deno.test("recusa template não aprovado, quantidade errada e valor vazio", () => {
  assertEquals(validarParametros({ ...aprovado, status: "PENDING" }, ["a", "b"]), "Este template ainda não foi aprovado pelo WhatsApp.");
  assertEquals(validarParametros(aprovado, ["a"]), "O template espera 2 variável(is) e foram enviadas 1.");
  assertEquals(validarParametros(aprovado, ["a", "  "]), "Preencha todas as variáveis do template.");
  assertEquals(validarParametros(aprovado, ["a", "b"]), null);
});

Deno.test("recusa valor que quebra a regra da Meta (linha nova ou longo demais)", () => {
  assertEquals(validarParametros(aprovado, ["a", "b\nc"]), "As variáveis não podem ter quebra de linha.");
  assertEquals(validarParametros(aprovado, ["a", "x".repeat(1025)]), "Variável longa demais para o WhatsApp.");
});

Deno.test("corpo do envio pela Meta leva as variáveis como parâmetros de texto", () => {
  assertEquals(corpoMeta("5511999990000", { nome: "retomada", idioma: "pt_BR" }, ["Marina"]), {
    messaging_product: "whatsapp",
    to: "5511999990000",
    type: "template",
    template: {
      name: "retomada",
      language: { code: "pt_BR" },
      components: [{ type: "body", parameters: [{ type: "text", text: "Marina" }] }],
    },
  });
  // Template sem variável não leva components (a Meta recusa components vazio).
  assertEquals("components" in corpoMeta("55", { nome: "x", idioma: "pt_BR" }, []).template, false);
});

Deno.test("corpo do envio pelo Zernio", () => {
  assertEquals(corpoZernio("acc1", "5511999990000", { nome: "retomada", idioma: "pt_BR" }, ["Marina"]), {
    accountId: "acc1", participantId: "5511999990000", templateName: "retomada", templateLanguage: "pt_BR", templateParams: ["Marina"],
  });
  assertEquals("templateParams" in corpoZernio("acc1", "55", { nome: "x", idioma: "pt_BR" }, []), false);
});

import { describe, it, expect } from "vitest";
import { FunctionsHttpError, FunctionsFetchError, FunctionsRelayError } from "@supabase/supabase-js";
import { erroDeFunction } from "./functionError";

/**
 * O caso que motiva o helper: em non-2xx o client entrega `data: null` e um
 * FunctionsHttpError cuja `message` é sempre a mesma string genérica. O corpo
 * real — onde está o texto acionável escrito pela edge function — fica só em
 * `error.context`.
 */
function httpError(status: number, corpo: unknown): FunctionsHttpError {
  const resp = new Response(JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json" },
  });
  return new FunctionsHttpError(resp);
}

describe("erroDeFunction", () => {
  it("usa o `error` do corpo em vez da mensagem genérica do client", async () => {
    const original = httpError(402, { error: "Os créditos de IA do projeto acabaram." });
    // Confirma a premissa: a message do client não serve para mostrar ao usuário.
    expect(original.message).toContain("non-2xx");

    const erro = await erroDeFunction(original, "Falha ao gerar o prompt.");
    expect(erro.message).toBe("Os créditos de IA do projeto acabaram.");
  });

  it("aceita `message` quando a function não usa a chave `error`", async () => {
    const erro = await erroDeFunction(httpError(429, { message: "Muitas requisições." }), "padrão");
    expect(erro.message).toBe("Muitas requisições.");
  });

  it("cai no padrão com o status quando o corpo não é JSON legível", async () => {
    const resp = new Response("<html>502 Bad Gateway</html>", { status: 502 });
    const erro = await erroDeFunction(new FunctionsHttpError(resp), "Falha ao sincronizar.");
    expect(erro.message).toBe("Falha ao sincronizar. (HTTP 502)");
  });

  it("cai no padrão com o status quando o corpo é JSON sem texto de erro", async () => {
    const erro = await erroDeFunction(httpError(500, { ok: false }), "Falha ao enviar o email.");
    expect(erro.message).toBe("Falha ao enviar o email. (HTTP 500)");
  });

  it("ignora corpo com erro vazio ou só espaços", async () => {
    const erro = await erroDeFunction(httpError(400, { error: "   " }), "Falha no envio.");
    expect(erro.message).toBe("Falha no envio. (HTTP 400)");
  });

  it("traduz falha de rede em algo que o usuário pode agir", async () => {
    const erro = await erroDeFunction(new FunctionsFetchError(new TypeError("fetch failed")), "padrão");
    expect(erro.message).toContain("conexão");
  });

  it("sinaliza falha de relay sem esconder o contexto da operação", async () => {
    const erro = await erroDeFunction(new FunctionsRelayError(new Error("relay")), "Falha ao sincronizar.");
    expect(erro.message).toContain("Falha ao sincronizar.");
  });

  it("preserva a mensagem de um Error comum", async () => {
    const erro = await erroDeFunction(new Error("Algo específico quebrou"), "padrão");
    expect(erro.message).toBe("Algo específico quebrou");
  });

  it("usa o padrão quando o valor lançado não é um Error", async () => {
    const erro = await erroDeFunction("string solta", "Falha ao diagnosticar.");
    expect(erro.message).toBe("Falha ao diagnosticar.");
  });
});

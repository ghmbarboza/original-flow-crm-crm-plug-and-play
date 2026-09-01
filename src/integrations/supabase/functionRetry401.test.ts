import { describe, expect, it, vi } from "vitest";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { instalarRenovacaoDeSessaoNasFunctions } from "./functionRetry401";

type Resultado = { data: unknown; error: unknown };

/**
 * Reproduz a forma do supabase-js que importa aqui: `functions` é um getter no
 * protótipo que devolve um client novo a cada acesso, e o token é resolvido por
 * requisição — então repetir o invoke basta para usar a sessão renovada.
 */
function criarClienteFake(
  respostas: Resultado[],
  refreshSession: () => Promise<{ data: { session: unknown }; error: unknown }>,
) {
  const invoke = vi.fn(async () => {
    const proxima = respostas.shift();
    if (!proxima) throw new Error("invoke chamado mais vezes que o esperado");
    return proxima;
  });
  const prototipo = {};
  Object.defineProperty(prototipo, "functions", {
    configurable: true,
    get() {
      return { invoke };
    },
  });
  const cliente = Object.create(prototipo) as {
    functions: { invoke: typeof invoke };
    auth: { refreshSession: typeof refreshSession };
  };
  cliente.auth = { refreshSession };
  return { cliente, invoke };
}

const erro401 = () => new FunctionsHttpError(new Response("{}", { status: 401 }));
const erro500 = () => new FunctionsHttpError(new Response("{}", { status: 500 }));

const instalar = (cliente: unknown) =>
  instalarRenovacaoDeSessaoNasFunctions(cliente as Parameters<typeof instalarRenovacaoDeSessaoNasFunctions>[0]);

describe("instalarRenovacaoDeSessaoNasFunctions", () => {
  it("401 com renovação bem-sucedida: repete a chamada e devolve o segundo resultado", async () => {
    const refresh = vi.fn(async () => ({ data: { session: { access_token: "novo" } }, error: null }));
    const { cliente, invoke } = criarClienteFake(
      [{ data: null, error: erro401() }, { data: { success: true }, error: null }],
      refresh,
    );
    instalar(cliente);

    const resultado = await cliente.functions.invoke();
    expect(resultado.data).toEqual({ success: true });
    expect(resultado.error).toBeNull();
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("401 com renovação falhando: devolve o 401 original sem repetir", async () => {
    const refresh = vi.fn(async () => ({ data: { session: null }, error: new Error("refresh morto") }));
    const primeira: Resultado = { data: null, error: erro401() };
    const { cliente, invoke } = criarClienteFake([primeira], refresh);
    instalar(cliente);

    const resultado = await cliente.functions.invoke();
    expect(resultado.error).toBe(primeira.error);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("erro que não é 401: não renova nem repete", async () => {
    const refresh = vi.fn();
    const primeira: Resultado = { data: null, error: erro500() };
    const { cliente, invoke } = criarClienteFake([primeira], refresh);
    instalar(cliente);

    const resultado = await cliente.functions.invoke();
    expect(resultado.error).toBe(primeira.error);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("sucesso: passa direto, sem tocar na sessão", async () => {
    const refresh = vi.fn();
    const { cliente, invoke } = criarClienteFake([{ data: { ok: 1 }, error: null }], refresh);
    instalar(cliente);

    const resultado = await cliente.functions.invoke();
    expect(resultado.data).toEqual({ ok: 1 });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("não consome o corpo da Response do 401: o erroDeFunction ainda consegue lê-lo", async () => {
    const refresh = vi.fn(async () => ({ data: { session: null }, error: new Error("sem sessão") }));
    const contexto = new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401 });
    const { cliente } = criarClienteFake([{ data: null, error: new FunctionsHttpError(contexto) }], refresh);
    instalar(cliente);

    const resultado = await cliente.functions.invoke();
    const corpo = await ((resultado.error as FunctionsHttpError).context as Response).json();
    expect(corpo).toEqual({ error: "Não autorizado" });
  });
});

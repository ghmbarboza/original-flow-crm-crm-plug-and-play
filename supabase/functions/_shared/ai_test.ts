// deno test supabase/functions/_shared/ai_test.ts
import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { chamarComFila, ErroIA, filaDeProvedores, type AlvoIA, type PedidoIA } from "./ai.ts";

const pedido: PedidoIA = { tarefa: "chat", maxTokens: 50, messages: [{ role: "user", content: "oi" }] };

const openai: AlvoIA = { provedor: "openai", apiKey: "k-openai", origem: "organizacao" };
const gateway: AlvoIA = { provedor: "gateway", apiKey: "k-lovable", origem: "projeto" };

const respostaOpenAI = (texto: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content: texto } }] }), { status: 200 });

/** Troca o fetch por respostas combinadas por host e devolve os hosts chamados, em ordem. */
function simularFetch(porHost: Record<string, () => Response | Promise<Response>>): { chamados: string[]; desfazer: () => void } {
  const original = globalThis.fetch;
  const chamados: string[] = [];
  globalThis.fetch = ((entrada: string | URL | Request) => {
    const host = new URL(entrada instanceof Request ? entrada.url : String(entrada)).host;
    chamados.push(host);
    const responder = porHost[host];
    if (!responder) return Promise.reject(new Error(`host não esperado: ${host}`));
    return Promise.resolve(responder());
  }) as typeof fetch;
  return { chamados, desfazer: () => { globalThis.fetch = original; } };
}

Deno.test("fila: chaves da organização primeiro, Lovable por último", () => {
  const fila = filaDeProvedores(
    { gemini: "g", anthropic: "a", openai: "o" },
    { anthropic: "a-projeto", lovable: "l" },
  );
  assertEquals(fila.map((a) => `${a.provedor}:${a.origem}`), [
    "anthropic:organizacao", "openai:organizacao", "gemini:organizacao", "anthropic:projeto", "gateway:projeto",
  ]);
});

Deno.test("fila: sem chave própria sobra só o que o projeto tem", () => {
  assertEquals(filaDeProvedores({}, { lovable: "l" }).map((a) => a.provedor), ["gateway"]);
  assertEquals(filaDeProvedores({ openai: "  " }, {}), []);
});

Deno.test("cai para o próximo provedor quando o primeiro falha", async () => {
  const sim = simularFetch({
    "api.openai.com": () => new Response("sem saldo", { status: 429 }),
    "ai.gateway.lovable.dev": () => respostaOpenAI("resposta do reserva"),
  });
  try {
    const r = await chamarComFila(pedido, [openai, gateway]);
    assertEquals(r.texto, "resposta do reserva");
    assertEquals(r.provedor, "gateway");
    assertEquals(sim.chamados, ["api.openai.com", "ai.gateway.lovable.dev"]);
  } finally { sim.desfazer(); }
});

Deno.test("cai para o próximo também quando a rede do primeiro falha", async () => {
  const sim = simularFetch({
    "api.openai.com": () => { throw new TypeError("connection reset"); },
    "ai.gateway.lovable.dev": () => respostaOpenAI("ok"),
  });
  try {
    assertEquals((await chamarComFila(pedido, [openai, gateway])).provedor, "gateway");
  } finally { sim.desfazer(); }
});

Deno.test("não usa o reserva quando o primeiro responde", async () => {
  const sim = simularFetch({ "api.openai.com": () => respostaOpenAI("principal") });
  try {
    const r = await chamarComFila(pedido, [openai, gateway]);
    assertEquals(r.provedor, "openai");
    assertEquals(sim.chamados, ["api.openai.com"]);
  } finally { sim.desfazer(); }
});

Deno.test("todos falharam: devolve o erro do primeiro, que é o que a pessoa configurou", async () => {
  const sim = simularFetch({
    "api.openai.com": () => new Response("sem crédito", { status: 402 }),
    "ai.gateway.lovable.dev": () => new Response("fora do ar", { status: 503 }),
  });
  try {
    const erro = await assertRejects(() => chamarComFila(pedido, [openai, gateway]), ErroIA);
    assertEquals(erro.status, 402);
    // A chave que falhou é da organização: a mensagem aponta para Integrações.
    assertEquals(erro.publico.includes("Configurações > Integrações"), true);
    assertEquals(erro.publico.includes("k-openai"), false);
  } finally { sim.desfazer(); }
});

Deno.test("não recomeça em outro provedor depois que uma ferramenta já rodou", async () => {
  let rodada = 0;
  const sim = simularFetch({
    "api.openai.com": () => {
      rodada++;
      if (rodada > 1) return new Response("caiu no meio", { status: 500 });
      return new Response(JSON.stringify({
        choices: [{ message: { tool_calls: [{ id: "c1", function: { name: "mover_negocio", arguments: "{}" } }] } }],
      }), { status: 200 });
    },
    "ai.gateway.lovable.dev": () => respostaOpenAI("não deveria chegar aqui"),
  });
  let execucoes = 0;
  try {
    await assertRejects(() => chamarComFila({
      ...pedido,
      tools: [{ name: "mover_negocio", description: "move", parameters: { type: "object", properties: {} } }],
      executarFerramenta: () => { execucoes++; return Promise.resolve("movido"); },
    }, [openai, gateway]), ErroIA);
    assertEquals(execucoes, 1);
    assertEquals(sim.chamados, ["api.openai.com", "api.openai.com"]);
  } finally { sim.desfazer(); }
});

Deno.test("fila vazia: erro de configuração, sem chamar ninguém", async () => {
  const erro = await assertRejects(() => chamarComFila(pedido, []), ErroIA);
  assertEquals(erro.status, 500);
});

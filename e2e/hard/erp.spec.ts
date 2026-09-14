import { expect, test } from "@playwright/test";
import {
  abrirSandbox, capturas, ctx, esperar, invocar, Limpeza, MARCADOR, ok, postFunction, rodarDispatcher, uid,
  type Ctx, type Sessao,
} from "./ctx";

/**
 * Integração ERP: entrada (erp-webhook com token) e saída (fila + erp-outbound
 * entregando na sandbox com autenticação e mapeamento de campos).
 */

test.describe.configure({ mode: "serial" });
test.skip(!process.env.HARD, "hard smoke: rode com npm run test:hard");

let c: Ctx;
let sandbox: Sessao;
const limpeza = new Limpeza();
const token = uid();
const email = `e2ehard.erp.${uid().slice(0, 8)}@exemplo.com`;
let configId = "";
let contatoId = "";
let produtoId = "";

function erp(corpo: object, t = token) {
  return postFunction(c, "erp-webhook", corpo, { "x-erp-token": t });
}

test.beforeAll(async () => {
  c = await ctx();
  const existente = ok(await c.db.from("erp_integration_configs").select("id").eq("org_id", c.orgId), "ler ERP");
  test.skip((existente ?? []).length > 0, "a org já tem ERP configurado: o teste não sobrescreve config real");

  sandbox = await abrirSandbox(c, limpeza, "erp");
  const cfg = ok(await c.db.from("erp_integration_configs").insert({
    org_id: c.orgId,
    inbound_token: token,
    outbound_url: `${sandbox.base}/erp/eventos`,
    outbound_auth_type: "bearer",
    outbound_auth_config: { token: "token-do-erp-e2e" },
    outbound_events: ["novo_contato", "deal_ganho"],
    outbound_field_mappings: { novo_contato: { "contact.email": "email_cliente", "contact.name": "nome_cliente" } },
    is_active: true,
  }).select("id").single(), "criar ERP");
  configId = cfg.id;
  limpeza.add("config ERP", async () => ok(await c.db.from("erp_integration_configs").delete().eq("id", configId), "apagar ERP"));

  const contato = ok(await c.db.from("contacts").insert({ org_id: c.orgId, first_name: `${MARCADOR} ERP`, email }).select("id").single(), "contato");
  contatoId = contato.id;
  const produto = ok(await c.db.from("products").insert({ org_id: c.orgId, name: `Produto ${MARCADOR} ${uid().slice(0, 6)}`, price: 10 }).select("id, name").single(), "produto");
  produtoId = produto.id;
  limpeza.add("dados ERP", async () => {
    ok(await c.db.from("contact_tags").delete().eq("contact_id", contatoId), "apagar tags do contato");
    ok(await c.db.from("deals").delete().eq("contact_id", contatoId), "apagar negócios");
    ok(await c.db.from("contacts").delete().eq("id", contatoId), "apagar contato");
    ok(await c.db.from("products").delete().eq("id", produtoId), "apagar produto");
  });
});

test.afterAll(async () => {
  await limpeza.rodar();
});

test("entrada: nova_oportunidade cria negócio na primeira etapa ligado ao contato", async () => {
  const titulo = `Oportunidade ${MARCADOR} ${uid().slice(0, 6)}`;
  const r = await erp({ event: "nova_oportunidade", titulo, valor: 1500, cliente_email: email });
  expect(r.status, r.texto).toBe(200);
  const deal = ok(await c.db.from("deals").select("value, contact_id, stage_id, status").eq("title", titulo).single(), "negócio");
  expect(deal).toMatchObject({ contact_id: contatoId, status: "open" });
  expect(Number(deal.value)).toBe(1500);
  expect(deal.stage_id).toBeTruthy();
});

test("entrada: pedido_faturado marca o negócio aberto como ganho", async () => {
  const r = await erp({ event: "pedido_faturado", cliente_email: email, numero_pedido: "PED-E2E" });
  expect(r.status, r.texto).toBe(200);
  const deal = ok(await c.db.from("deals").select("status").eq("id", r.json?.deal_id as string).single(), "negócio");
  expect(deal.status).toBe("won");
});

test("entrada: estoque_atualizado e cliente_inadimplente", async () => {
  const produto = ok(await c.db.from("products").select("name").eq("id", produtoId).single(), "produto");
  const estoque = await erp({ event: "estoque_atualizado", produto_nome: produto.name, quantidade: 42 });
  expect(estoque.status, estoque.texto).toBe(200);
  const p = ok(await c.db.from("products").select("stock_quantity, track_stock").eq("id", produtoId).single(), "produto");
  expect(p).toMatchObject({ stock_quantity: 42, track_stock: true });

  const inad = await erp({ event: "cliente_inadimplente", cliente_email: email });
  expect(inad.status, inad.texto).toBe(200);
  const tags = ok(await c.db.from("contact_tags").select("tags(name)").eq("contact_id", contatoId), "tags") as Array<{ tags: { name: string } }>;
  expect(tags.map((t) => t.tags.name)).toContain("Inadimplente");
});

test("entrada: token errado é 401, evento desconhecido é 400 e cada chamada fica no log", async () => {
  expect((await erp({ event: "nova_oportunidade" }, "token-errado")).status).toBe(401);
  const desconhecido = await erp({ event: "evento_que_nao_existe" });
  expect(desconhecido.status).toBe(400);
  expect(String(desconhecido.json?.error)).toContain("Válidos");

  const logs = ok(await c.db.from("erp_webhook_logs").select("event_type, status").eq("org_id", c.orgId).eq("direction", "inbound").order("created_at", { ascending: false }).limit(10), "logs");
  expect(logs).toEqual(expect.arrayContaining([
    expect.objectContaining({ event_type: "evento_que_nao_existe", status: "failed" }),
    expect.objectContaining({ event_type: "pedido_faturado", status: "success" }),
  ]));
});

test("saída: contato novo chega ao ERP com Bearer e campos mapeados", async () => {
  const outroEmail = `e2ehard.saida.${uid().slice(0, 8)}@exemplo.com`;
  const novo = ok(await c.db.from("contacts").insert({ org_id: c.orgId, first_name: `${MARCADOR} Saída`, email: outroEmail }).select("id").single(), "contato");
  limpeza.add("contato saída", async () => ok(await c.db.from("contacts").delete().eq("id", novo.id), "apagar contato saída"));

  await rodarDispatcher(c, "erp-outbound");
  const entrega = await esperar("evento novo_contato na sandbox", async () =>
    (await capturas(c, sandbox, "/erp/eventos")).find((x) => x.body?.email_cliente === outroEmail), { timeout: 45_000, intervalo: 2_000 });

  expect(entrega.headers["authorization"]).toBe("Bearer token-do-erp-e2e");
  expect(entrega.body).toEqual({ event: "novo_contato", email_cliente: outroEmail, nome_cliente: `${MARCADOR} Saída` });

  const log = await esperar("log de saída como success", async () => {
    const r = await c.db.from("erp_webhook_logs").select("status").eq("org_id", c.orgId).eq("direction", "outbound")
      .eq("event_type", "novo_contato").contains("payload", { "contact.email": outroEmail });
    return r.data?.[0]?.status === "success" ? r.data[0] : null;
  });
  expect(log.status).toBe("success");
});

test("saída: ERP respondendo 500 deixa o evento como falha com o motivo", async () => {
  ok(await c.db.from("integration_sandbox_sessions").update({ response_status: 500 }).eq("id", sandbox.id), "derrubar ERP");
  const outroEmail = `e2ehard.falha.${uid().slice(0, 8)}@exemplo.com`;
  const novo = ok(await c.db.from("contacts").insert({ org_id: c.orgId, first_name: `${MARCADOR} Falha`, email: outroEmail }).select("id").single(), "contato");
  limpeza.add("contato falha", async () => ok(await c.db.from("contacts").delete().eq("id", novo.id), "apagar contato falha"));
  try {
    await rodarDispatcher(c, "erp-outbound");
    const log = await esperar("log de saída como failed", async () => {
      const r = await c.db.from("erp_webhook_logs").select("status, error_msg").eq("org_id", c.orgId).eq("direction", "outbound")
        .contains("payload", { "contact.email": outroEmail });
      return r.data?.[0]?.status === "failed" ? r.data[0] : null;
    }, { timeout: 45_000, intervalo: 2_000 });
    expect(log.error_msg).toContain("500");
  } finally {
    ok(await c.db.from("integration_sandbox_sessions").update({ response_status: 200 }).eq("id", sandbox.id), "religar ERP");
  }
});

test("botão Testar entrega o evento de teste na URL configurada", async () => {
  const r = await invocar(c, "erp-outbound", { test: true });
  expect(r.status, r.texto).toBe(200);
  const teste = (await capturas(c, sandbox, "/erp/eventos")).find((x) => x.body?.event === "teste_flowcrm");
  expect(teste, "o teste tem que chegar ao destino").toBeTruthy();
  expect(teste!.headers["authorization"]).toBe("Bearer token-do-erp-e2e");
});

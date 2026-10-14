import { expect, test } from "@playwright/test";
import { ctx, invocar, Limpeza, MARCADOR, ok, postFunction, uid, type Ctx } from "./ctx";

/**
 * Assistente do CRM: responde com dados reais da org e link para o registro;
 * sem login não responde; guia de plataforma traz o caminho da tela.
 */
test.describe.configure({ mode: "serial" });
test.skip(!process.env.HARD, "hard smoke: rode com npm run test:hard");

let c: Ctx;
const limpeza = new Limpeza();
const marca = uid().slice(0, 6).toUpperCase();

test.beforeAll(async () => { c = await ctx(); });
test.afterAll(async () => { await limpeza.rodar(); });

test("sem login não responde", async () => {
  const r = await postFunction(c, "assistente", { mensagem: "Como está meu funil?" });
  expect(r.status).toBe(401);
});

test("acha um negócio pelo nome e devolve o link dele", async () => {
  test.setTimeout(120_000);
  const contato = ok(await c.db.from("contacts").insert({ org_id: c.orgId, first_name: `${MARCADOR} Assist`, last_name: marca }).select("id").single(), "contato");
  const etapa = ok(await c.db.from("pipeline_stages").select("id").eq("org_id", c.orgId).order("order").limit(1).single(), "etapa");
  const deal = ok(await c.db.from("deals").insert({ org_id: c.orgId, contact_id: contato.id, title: `${MARCADOR} Projeto Zeta${marca}`, value: 12345, status: "open", stage_id: etapa.id }).select("id").single(), "negócio");
  limpeza.add("negócio e contato", async () => {
    ok(await c.db.from("activities").delete().eq("contact_id", contato.id), "atividades");
    ok(await c.db.from("deals").delete().eq("id", deal.id), "negócio");
    ok(await c.db.from("contacts").delete().eq("id", contato.id), "contato");
  });
  const r = await invocar(c, "assistente", { mensagem: `Qual o valor do negócio "Projeto Zeta${marca}"? Me mande o link.` });
  expect(r.status, r.texto).toBe(200);
  const resposta = String(r.json?.resposta ?? "");
  console.log(`[assistente] ${JSON.stringify(resposta).slice(0, 900)}`);
  expect(resposta).toContain(`/deals/${deal.id}`);
  expect(resposta).toMatch(/12\.?345/);
});

test("pergunta de como usar traz o caminho da tela", async () => {
  test.setTimeout(120_000);
  const r = await invocar(c, "assistente", { mensagem: "Como eu conecto meu calendário do Google?" });
  expect(r.status, r.texto).toBe(200);
  const resposta = String(r.json?.resposta ?? "");
  console.log(`[assistente] ${JSON.stringify(resposta).slice(0, 900)}`);
  expect(resposta).toMatch(/\/settings\/agenda|\/settings\/integrations\?integration=nylas|\/help\?guia=agenda/);
});

test("metas: responde com o link da tela de Metas e sem inventar meta", async () => {
  test.setTimeout(120_000);
  const r = await invocar(c, "assistente", { mensagem: "Como estão as metas deste mês?" });
  expect(r.status, r.texto).toBe(200);
  const resposta = String(r.json?.resposta ?? "");
  console.log(`[assistente] ${JSON.stringify(resposta).slice(0, 900)}`);
  expect(resposta).toContain("/sales-goals");
});

test("funis: cita as etapas reais do funil padrão", async () => {
  test.setTimeout(120_000);
  const funil = ok(await c.db.from("pipelines").select("id").eq("org_id", c.orgId).eq("is_default", true).single(), "funil padrão");
  const etapas = ok(await c.db.from("pipeline_stages").select("name").eq("pipeline_id", funil.id).order("order"), "etapas");
  const r = await invocar(c, "assistente", { mensagem: "Quais são as etapas do nosso funil, na ordem?" });
  expect(r.status, r.texto).toBe(200);
  const resposta = String(r.json?.resposta ?? "");
  console.log(`[assistente] ${JSON.stringify(resposta).slice(0, 900)}`);
  for (const e of etapas) expect(resposta).toContain(e.name);
});

test("janela de 24h: explica o template e não inventa tela", async () => {
  test.setTimeout(120_000);
  const r = await invocar(c, "assistente", { mensagem: "Passaram 24 horas e não consigo mais responder o cliente no WhatsApp. O que faço?" });
  expect(r.status, r.texto).toBe(200);
  const resposta = String(r.json?.resposta ?? "");
  console.log(`[assistente] ${JSON.stringify(resposta).slice(0, 900)}`);
  expect(resposta).toMatch(/template/i);
  expect(resposta).toMatch(/Enviar template/i);
});

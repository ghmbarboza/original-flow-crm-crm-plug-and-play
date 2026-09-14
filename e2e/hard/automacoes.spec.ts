import { expect, test } from "@playwright/test";
import { ctx, esperar, Limpeza, MARCADOR, ok, postFunction, uid, type Ctx } from "./ctx";

/**
 * Automações e proteção dos agendamentos.
 *
 * Até 14/09 o automation-dispatcher não tinha cron: a fila crescia e nenhuma
 * automação rodava. Este teste prova a volta completa (evento, fila, dispatcher,
 * ação executada) e que os dispatchers não aceitam chamada de fora.
 */

test.describe.configure({ mode: "serial" });
test.skip(!process.env.HARD, "hard smoke: rode com npm run test:hard");

let c: Ctx;
const limpeza = new Limpeza();

test.beforeAll(async () => {
  c = await ctx();
});

test.afterAll(async () => {
  await limpeza.rodar();
});

test("contato criado dispara a automação e a tarefa aparece sem ninguém chamar nada", async () => {
  test.setTimeout(150_000);
  const tituloTarefa = `Tarefa ${MARCADOR} ${uid().slice(0, 6)}`;
  const automacao = ok(await c.db.from("automations").insert({
    org_id: c.orgId,
    name: `Automação ${MARCADOR} ${uid().slice(0, 6)}`,
    is_active: true,
    trigger: { type: "contact_created" },
    conditions: [{ field: "source", op: "eq", value: "e2e-hard" }],
    actions: [{ type: "create_activity", params: { title: tituloTarefa } }],
    created_by: c.userId,
  }).select("id").single(), "criar automação");
  limpeza.add("automação", async () => ok(await c.db.from("automations").delete().eq("id", automacao.id), "apagar automação"));

  const contato = ok(await c.db.from("contacts").insert({
    org_id: c.orgId, first_name: `${MARCADOR} Automação`, source: "e2e-hard",
  }).select("id").single(), "criar contato");
  limpeza.add("contato automação", async () => {
    ok(await c.db.from("activities").delete().eq("contact_id", contato.id), "apagar tarefa");
    ok(await c.db.from("contacts").delete().eq("id", contato.id), "apagar contato");
  });

  // Sem disparo manual de propósito: quem tem que rodar é o cron de 1 minuto.
  const tarefa = await esperar("tarefa criada pelo cron da automação", async () => {
    const r = await c.db.from("activities").select("title, contact_id, type").eq("title", tituloTarefa);
    return r.data?.[0] ?? null;
  }, { timeout: 130_000, intervalo: 5_000 });
  expect(tarefa).toMatchObject({ contact_id: contato.id, type: "task" });

  const log = ok(await c.db.from("automation_logs").select("status, error_msg").eq("automation_id", automacao.id).single(), "log");
  expect(log, JSON.stringify(log)).toMatchObject({ status: "ok" });
});

test("condição que não bate: automação registra que pulou e não executa a ação", async () => {
  const tituloTarefa = `Não deveria ${MARCADOR} ${uid().slice(0, 6)}`;
  const automacao = ok(await c.db.from("automations").insert({
    org_id: c.orgId,
    name: `Automação ${MARCADOR} condição ${uid().slice(0, 6)}`,
    is_active: true,
    trigger: { type: "contact_created" },
    conditions: [{ field: "source", op: "eq", value: "nunca-bate" }],
    actions: [{ type: "create_activity", params: { title: tituloTarefa } }],
    created_by: c.userId,
  }).select("id").single(), "criar automação");
  limpeza.add("automação condição", async () => ok(await c.db.from("automations").delete().eq("id", automacao.id), "apagar"));

  const contato = ok(await c.db.from("contacts").insert({ org_id: c.orgId, first_name: `${MARCADOR} Condição`, source: "e2e-hard" }).select("id").single(), "contato");
  limpeza.add("contato condição", async () => ok(await c.db.from("contacts").delete().eq("id", contato.id), "apagar contato"));

  ok(await c.db.rpc("executar_dispatcher_agora", { p_function: "automation-dispatcher" }), "disparar");
  const log = await esperar("log processado", async () => {
    const r = await c.db.from("automation_logs").select("status, result").eq("automation_id", automacao.id);
    return r.data?.[0]?.status === "ok" ? r.data[0] : null;
  }, { timeout: 90_000, intervalo: 3_000 });
  expect(log.result).toMatchObject({ skipped: "conditions" });
  const tarefas = ok(await c.db.from("activities").select("id").eq("title", tituloTarefa), "ler");
  expect(tarefas).toHaveLength(0);
});

test("dispatchers e a IA recusam chamada de fora (sem segredo interno)", async () => {
  for (const fn of ["automation-dispatcher", "nps-dispatcher", "followup-dispatcher", "scheduled-message-dispatcher", "erp-outbound"]) {
    const r = await postFunction(c, fn, {}, { "x-cron-secret": "chute" });
    expect(r.status, `${fn}: ${r.texto}`).toBe(401);
  }
  const ia = await postFunction(c, "ai-reply", { conversation_id: "00000000-0000-0000-0000-000000000000" }, { Authorization: `Bearer ${c.anonKey}` });
  expect(ia.status).toBe(401);
});

test("disparo manual de dispatcher é só para admin e só para a lista fechada", async () => {
  const r = await c.db.rpc("executar_dispatcher_agora", { p_function: "ai-reply" });
  expect(r.error?.message).toContain("Dispatcher desconhecido");
});

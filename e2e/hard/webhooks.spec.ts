import { expect, test } from "@playwright/test";
import {
  abrirSandbox, capturas, ctx, esperar, hmacHex, invocar, Limpeza, MARCADOR, ok, postFunction, rodarDispatcher,
  uid, type Ctx, type Sessao,
} from "./ctx";

/**
 * Módulo Webhooks (Sprint 11, Fase 2): a ponte com as outras soluções do Viver de IA.
 *
 * Saída: destinos cadastrados recebem os eventos assinados na sandbox; falha agenda
 * nova tentativa; reenvio e teste manuais funcionam.
 * Entrada: a chave fcrm_ aceita as ações do CRM e os eventos no formato que as
 * outras soluções já mandam hoje (TypeFlow, AssinaAí, FinanceAI, Análise de
 * Satisfação), com idempotência.
 */

test.describe.configure({ mode: "serial" });
test.skip(!process.env.HARD, "hard smoke: rode com npm run test:hard");

let c: Ctx;
let sandbox: Sessao;
const limpeza = new Limpeza();
const sufixo = uid().slice(0, 8);
const emailDe = (rotulo: string) => `e2ehard.wh.${rotulo}.${sufixo}@exemplo.com`;
let destinoId = "";
let secretDestino = "";
let chave = "";
let chaveId = "";

async function entregasDoDestino(evento?: string) {
  let q = c.db.from("webhook_deliveries").select("id, event, status, attempts, last_status_code, last_error, next_attempt_at, payload")
    .eq("endpoint_id", destinoId).order("created_at");
  if (evento) q = q.eq("event", evento);
  return ok(await q, "ler entregas") ?? [];
}

function entrada(corpo: object | string, headers: Record<string, string> = {}) {
  return postFunction(c, "webhook-inbound", corpo, { Authorization: `Bearer ${chave}`, ...headers });
}

async function contatoPorEmail(email: string) {
  return ok(await c.db.from("contacts").select("id, first_name, last_name, email, whatsapp_phone, company_id, source").eq("email", email).maybeSingle(), "contato");
}

test.beforeAll(async () => {
  c = await ctx();
  sandbox = await abrirSandbox(c, limpeza, "webhooks");

  const tagsAntes = new Set((ok(await c.db.from("tags").select("name"), "tags") ?? []).map((t) => t.name));
  limpeza.add("dados criados pelos webhooks", async () => {
    const contatos = ok(await c.db.from("contacts").select("id, company_id").like("email", `e2ehard.wh.%.${sufixo}@exemplo.com`), "contatos") ?? [];
    for (const ct of contatos) {
      ok(await c.db.from("activities").delete().eq("contact_id", ct.id), "atividades");
      ok(await c.db.from("deals").delete().eq("contact_id", ct.id), "negócios");
      ok(await c.db.from("contacts").delete().eq("id", ct.id), "contato");
      if (ct.company_id) ok(await c.db.from("companies").delete().eq("id", ct.company_id), "empresa");
    }
    for (const nome of ["Detrator", "Promotor", "Inadimplente", `VIP ${sufixo}`]) {
      if (!tagsAntes.has(nome)) ok(await c.db.from("tags").delete().eq("name", nome), `tag ${nome}`);
    }
  });
});

test.afterAll(async () => {
  await limpeza.rodar();
});

// ---------------------------------------------------------------------------
// Saída
// ---------------------------------------------------------------------------

test("saída: evento inscrito chega assinado com o envelope do contrato", async () => {
  const destino = ok(await c.db.from("webhook_endpoints").insert({
    org_id: c.orgId,
    name: `${MARCADOR} destino`,
    url: `${sandbox.base}/receber`,
    events: ["contact.created", "deal.won"],
    headers: { "X-Solucao": "e2e" },
    created_by: c.userId,
  }).select("id, secret").single(), "criar destino");
  destinoId = destino.id;
  secretDestino = destino.secret;
  limpeza.add("destino", async () => ok(await c.db.from("webhook_endpoints").delete().eq("id", destinoId), "apagar destino"));

  const email = emailDe("saida");
  ok(await c.db.from("contacts").insert({ org_id: c.orgId, first_name: `${MARCADOR} Saída`, email }), "criar contato");

  await rodarDispatcher(c, "webhook-dispatcher");
  const recebida = await esperar("contact.created na sandbox", async () =>
    (await capturas(c, sandbox, "/receber")).find((x) => (x.body?.data as { contact?: { email?: string } })?.contact?.email === email),
  { timeout: 45_000, intervalo: 2_000 });

  expect(recebida.headers["x-flowcrm-event"]).toBe("contact.created");
  expect(recebida.headers["x-solucao"], "headers extras do cadastro vão junto").toBe("e2e");
  const ts = recebida.headers["x-flowcrm-timestamp"];
  expect(recebida.headers["x-flowcrm-signature"], "assinatura = HMAC(secret, timestamp.corpo)")
    .toBe(`sha256=${hmacHex(secretDestino, `${ts}.${recebida.raw_body}`)}`);
  expect(recebida.body).toMatchObject({
    event: "contact.created",
    org_id: c.orgId,
    source: "flowcrm",
    data: { contact: { email, first_name: `${MARCADOR} Saída`, status: "lead" } },
  });
  expect(recebida.headers["x-flowcrm-event-id"]).toBe(recebida.body?.id);

  const [entrega] = await entregasDoDestino("contact.created");
  expect(entrega).toMatchObject({ status: "success", attempts: 1, last_status_code: 200 });
});

test("saída: evento não inscrito não gera entrega", async () => {
  const contato = await contatoPorEmail(emailDe("saida"));
  ok(await c.db.from("activities").insert({ org_id: c.orgId, type: "task", title: `Tarefa ${MARCADOR}`, contact_id: contato!.id }), "criar atividade");
  const entregas = await entregasDoDestino("activity.created");
  expect(entregas).toHaveLength(0);
});

test("saída: destino fora do ar agenda nova tentativa e o reenvio manual entrega", async () => {
  ok(await c.db.from("integration_sandbox_sessions").update({ response_status: 500 }).eq("id", sandbox.id), "derrubar destino");
  const contato = await contatoPorEmail(emailDe("saida"));
  const deal = ok(await c.db.from("deals").insert({ org_id: c.orgId, title: `Negócio ${MARCADOR} saída`, contact_id: contato!.id, status: "open" }).select("id").single(), "negócio");
  ok(await c.db.from("deals").update({ status: "won" }).eq("id", deal.id), "ganhar negócio");

  await rodarDispatcher(c, "webhook-dispatcher");
  const falha = await esperar("deal.won em nova tentativa", async () => {
    const [e] = await entregasDoDestino("deal.won");
    return e?.status === "retrying" ? e : null;
  }, { timeout: 45_000, intervalo: 2_000 });
  expect(falha).toMatchObject({ attempts: 1, last_status_code: 500 });
  expect(falha.last_error).toContain("500");
  const espera = new Date(falha.next_attempt_at as string).getTime() - Date.now();
  expect(espera, "segunda tentativa em ~1 minuto").toBeGreaterThan(20_000);

  ok(await c.db.from("integration_sandbox_sessions").update({ response_status: 200 }).eq("id", sandbox.id), "religar destino");
  const r = await invocar(c, "webhook-dispatcher", { action: "redeliver", delivery_id: falha.id });
  expect(r.status, r.texto).toBe(200);
  const [depois] = await entregasDoDestino("deal.won");
  expect(depois).toMatchObject({ status: "success", last_status_code: 200 });

  const chegou = (await capturas(c, sandbox, "/receber")).filter((x) => x.body?.event === "deal.won");
  expect(chegou.map((x) => x.response_status)).toEqual([500, 200]);
  expect((chegou[1].body?.data as { deal?: { status?: string } }).deal?.status).toBe("won");
});

test("saída: botão Testar manda ping e mostra o erro do destino quando falha", async () => {
  const okResp = await invocar(c, "webhook-dispatcher", { action: "test", endpoint_id: destinoId });
  expect(okResp.status, okResp.texto).toBe(200);
  expect((await capturas(c, sandbox, "/receber")).some((x) => x.body?.event === "ping")).toBe(true);

  ok(await c.db.from("integration_sandbox_sessions").update({ response_status: 500 }).eq("id", sandbox.id), "derrubar destino");
  try {
    const falha = await invocar(c, "webhook-dispatcher", { action: "test", endpoint_id: destinoId });
    expect(falha.status).toBe(502);
    expect(String(falha.json?.error)).toContain("500");
  } finally {
    ok(await c.db.from("integration_sandbox_sessions").update({ response_status: 200 }).eq("id", sandbox.id), "religar destino");
  }
  const testes = await entregasDoDestino("ping");
  expect(testes.every((t) => t.status === "success" || t.status === "failed"), "teste não entra na fila de novas tentativas").toBe(true);
});

test("saída: destino desativado não recebe nada", async () => {
  ok(await c.db.from("webhook_endpoints").update({ is_active: false }).eq("id", destinoId), "desativar");
  try {
    const email = emailDe("desativado");
    ok(await c.db.from("contacts").insert({ org_id: c.orgId, first_name: `${MARCADOR} Desativado`, email }), "contato");
    const entregas = (await entregasDoDestino("contact.created")).filter((e) =>
      ((e.payload as { data?: { contact?: { email?: string } } }).data?.contact?.email) === email);
    expect(entregas).toHaveLength(0);
  } finally {
    ok(await c.db.from("webhook_endpoints").update({ is_active: true }).eq("id", destinoId), "reativar");
  }
});

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

test("entrada: chave criada uma vez; sem chave ou chave errada é 401", async () => {
  const r = ok(await c.db.rpc("criar_chave_webhook", { p_name: `${MARCADOR} ${sufixo}` }), "criar chave") as { id: string; key: string };
  chave = r.key;
  chaveId = r.id;
  expect(chave).toMatch(/^fcrm_[0-9a-f]{64}$/);
  limpeza.add("chave de entrada", async () => {
    ok(await c.db.from("webhook_inbound_logs").delete().eq("key_id", chaveId), "apagar logs");
    ok(await c.db.from("webhook_inbound_keys").delete().eq("id", chaveId), "apagar chave");
  });

  const guardada = ok(await c.db.from("webhook_inbound_keys").select("key_prefix, key_hash").eq("id", chaveId).single(), "ler chave");
  expect(guardada.key_prefix).toBe(chave.slice(0, 13));
  expect(guardada.key_hash, "o banco não guarda a chave").not.toContain(chave.slice(5));

  expect((await postFunction(c, "webhook-inbound", { action: "ping" })).status).toBe(401);
  expect((await postFunction(c, "webhook-inbound", { action: "ping" }, { Authorization: "Bearer fcrm_errada" })).status).toBe(401);
  const pong = await entrada({ action: "ping" });
  expect(pong.status, pong.texto).toBe(200);
  expect(pong.json).toMatchObject({ ok: true, pong: true });
});

test("entrada: contact.upsert cria e depois atualiza o mesmo contato", async () => {
  const email = emailDe("upsert");
  const criar = await entrada({ action: "contact.upsert", data: { name: "Upsert Silva", email, phone: "(11) 98888-7777", tags: [`VIP ${sufixo}`] } });
  expect(criar.status, criar.texto).toBe(200);
  expect(criar.json).toMatchObject({ created: true });

  const atualizar = await entrada({ action: "contact.upsert", data: { email: email.toUpperCase(), first_name: `${MARCADOR} Atualizado` } });
  expect(atualizar.status, atualizar.texto).toBe(200);
  expect(atualizar.json).toMatchObject({ contact_id: criar.json?.contact_id, created: false });

  const contato = await contatoPorEmail(email);
  expect(contato).toMatchObject({ first_name: `${MARCADOR} Atualizado`, last_name: "Silva", whatsapp_phone: "5511988887777" });
  const tags = ok(await c.db.from("contact_tags").select("tags(name)").eq("contact_id", contato!.id), "tags") as Array<{ tags: { name: string } }>;
  expect(tags.map((t) => t.tags.name)).toContain(`VIP ${sufixo}`);
});

test("entrada: linha plana de lead (TypeFlow) vira contato, empresa e negócio aberto", async () => {
  const email = emailDe("typeflow");
  const r = await entrada({
    nome: `${MARCADOR} TypeFlow Souza`, email, telefone: "11977776666", empresa: `Empresa ${MARCADOR} ${sufixo}`,
    score: 82, origem: "typeflow",
  }, { "x-webhook-token": chave, Authorization: "" });
  expect(r.status, r.texto).toBe(200);
  expect(r.json).toMatchObject({ action: "lead.created", created: true });
  expect(r.json?.deal_id).toBeTruthy();

  const contato = await contatoPorEmail(email);
  expect(contato).toMatchObject({ source: "typeflow", whatsapp_phone: "5511977776666" });
  expect(contato!.company_id).toBeTruthy();
  const deal = ok(await c.db.from("deals").select("status, contact_id").eq("id", r.json?.deal_id as string).single(), "negócio");
  expect(deal).toMatchObject({ status: "open", contact_id: contato!.id });
});

test("entrada: contrato assinado (formato AssinaAí) registra nota e ganha o negócio", async () => {
  const email = emailDe("typeflow");
  const r = await entrada({
    event: "envelope.completed",
    id: `evt_${uid()}`,
    delivered_at: new Date().toISOString(),
    data: { envelope: { id: "env_1", title: "Contrato de prestação" }, signers: [{ name: `${MARCADOR} TypeFlow Souza`, email }] },
  });
  expect(r.status, r.texto).toBe(200);
  expect(r.json).toMatchObject({ action: "contract.signed", deal_won: true });
  const deal = ok(await c.db.from("deals").select("status").eq("id", r.json?.deal_id as string).single(), "negócio");
  expect(deal.status).toBe("won");
  const nota = ok(await c.db.from("activities").select("type, title").eq("id", r.json?.activity_id as string).single(), "nota");
  expect(nota).toMatchObject({ type: "note", title: "Contrato assinado: Contrato de prestação" });
});

test("entrada: pagamento confirmado (FinanceAI) com Idempotency-Key processa uma vez só", async () => {
  const email = emailDe("pagamento");
  await entrada({ action: "lead.created", data: { name: `${MARCADOR} Pagador`, email } });
  const corpo = { event: "transaction.confirmed", data: { amount: "1.250,90", description: "Mensalidade", customer: { email } } };

  const primeira = await entrada(corpo, { "Idempotency-Key": `pag-${sufixo}` });
  const segunda = await entrada(corpo, { "Idempotency-Key": `pag-${sufixo}` });
  expect(primeira.status, primeira.texto).toBe(200);
  expect(segunda.status, segunda.texto).toBe(200);
  expect(segunda.json).toMatchObject({ duplicate: true, activity_id: primeira.json?.activity_id });

  const contato = await contatoPorEmail(email);
  const notas = ok(await c.db.from("activities").select("id").eq("contact_id", contato!.id).eq("type", "note"), "notas");
  expect(notas, "a repetição não pode gerar outra nota").toHaveLength(1);
  const deal = ok(await c.db.from("deals").select("status, value").eq("id", primeira.json?.deal_id as string).single(), "negócio");
  expect(deal.status).toBe("won");
  expect(Number(deal.value)).toBeCloseTo(1250.9);
});

test("entrada: feedback detrator (Análise de Satisfação) vira nota com a nota e tag Detrator", async () => {
  const email = emailDe("nps");
  const r = await entrada({ event: "feedback.received", data: { email, score_nps: 3, texto_feedback: "Demorou demais" } });
  expect(r.status, r.texto).toBe(200);
  expect(r.json).toMatchObject({ action: "nps.submitted", score: 3 });
  const contato = await contatoPorEmail(email);
  const tags = ok(await c.db.from("contact_tags").select("tags(name)").eq("contact_id", contato!.id), "tags") as Array<{ tags: { name: string } }>;
  expect(tags.map((t) => t.tags.name)).toContain("Detrator");
  const nota = ok(await c.db.from("activities").select("title, body").eq("id", r.json?.activity_id as string).single(), "nota");
  expect(nota.title).toBe("NPS 3");
  expect(nota.body).toContain("Demorou demais");
});

test("entrada: agendamento vira reunião ligada ao negócio aberto", async () => {
  const email = emailDe("agenda");
  await entrada({ action: "lead.created", data: { name: `${MARCADOR} Agenda`, email } });
  const inicio = new Date(Date.now() + 86_400_000).toISOString();
  const r = await entrada({ event: "booking.created", data: { title: `Demo ${MARCADOR}`, start_time: inicio, attendee: { email } , contact: { email } } });
  expect(r.status, r.texto).toBe(200);
  const reuniao = ok(await c.db.from("activities").select("type, due_date, deal_id").eq("id", r.json?.activity_id as string).single(), "reunião");
  expect(reuniao.type).toBe("meeting");
  expect(reuniao.deal_id).toBeTruthy();
  expect(new Date(reuniao.due_date as string).toISOString()).toBe(inicio);
});

test("entrada: erros explicam o que corrigir e ficam no log", async () => {
  const desconhecido = await entrada({ event: "candidate.hired", data: { email: emailDe("x") } });
  expect(desconhecido.status).toBe(400);
  expect(String(desconhecido.json?.error)).toContain("Aceitos:");

  const semContato = await entrada({ action: "contact.upsert", data: { name: "Sem identificação" } });
  expect(semContato.status).toBe(422);
  expect(String(semContato.json?.error)).toContain("e-mail ou telefone");

  const invalido = await entrada("isto não é json");
  expect(invalido.status).toBe(400);

  const logs = ok(await c.db.from("webhook_inbound_logs").select("status, http_status").eq("key_id", chaveId), "logs") ?? [];
  expect(logs.filter((l) => l.status === "failed").map((l) => l.http_status)).toEqual(expect.arrayContaining([400, 422]));
});

test("entrada: chave revogada para de funcionar na hora", async () => {
  ok(await c.db.from("webhook_inbound_keys").update({ is_active: false }).eq("id", chaveId), "revogar");
  const r = await entrada({ action: "ping" });
  expect(r.status).toBe(401);
});

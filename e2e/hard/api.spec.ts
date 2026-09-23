import { expect, test } from "@playwright/test";
import { ctx, Limpeza, MARCADOR, ok, uid, type Ctx } from "./ctx";

/**
 * Hard smoke da API pública (Sprint 12 B5): chave com escopos criada pela RPC,
 * leitura de funis, contato e negócio criados e movidos por nome de etapa
 * (com histórico), mensagem registrada na conversa, escopo negado, limite
 * por minuto e OpenAPI público.
 */

test.describe.configure({ mode: "serial" });
test.skip(!process.env.HARD, "hard smoke: rode com npm run test:hard");

let c: Ctx;
const limpeza = new Limpeza();
let chave = "";
let chaveSoLeitura = "";
let chaveLimitada = "";

async function api(metodo: string, caminho: string, corpo?: object, token = chave) {
  const resp = await fetch(`${c.functions}/api${caminho}`, {
    method: metodo,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    ...(corpo ? { body: JSON.stringify(corpo) } : {}),
  });
  const texto = await resp.text();
  let json: Record<string, unknown> | null = null;
  try { json = JSON.parse(texto); } catch { /* sem json */ }
  return { status: resp.status, json, texto };
}

test.beforeAll(async () => {
  c = await ctx();
  const todos = ["contacts:read", "contacts:write", "deals:read", "deals:write", "conversations:read", "conversations:write", "pipelines:read", "activities:write", "products:read", "knowledge:read"];
  const k1 = ok(await c.db.rpc("criar_chave_api", { p_name: `${MARCADOR} api ${uid().slice(0, 6)}`, p_scopes: todos, p_rate_limit: 120 }), "chave") as { id: string; key: string };
  const k2 = ok(await c.db.rpc("criar_chave_api", { p_name: `${MARCADOR} leitura ${uid().slice(0, 6)}`, p_scopes: ["contacts:read"], p_rate_limit: 120 }), "chave leitura") as { id: string; key: string };
  const k3 = ok(await c.db.rpc("criar_chave_api", { p_name: `${MARCADOR} limitada ${uid().slice(0, 6)}`, p_scopes: ["pipelines:read"], p_rate_limit: 10 }), "chave limitada") as { id: string; key: string };
  chave = k1.key; chaveSoLeitura = k2.key; chaveLimitada = k3.key;
  expect(chave).toMatch(/^fcrm_live_[0-9a-f]{64}$/);
  for (const k of [k1, k2, k3]) {
    limpeza.add(`chave ${k.id}`, async () => {
      ok(await c.db.from("api_request_logs").delete().eq("key_id", k.id), "apagar logs");
      ok(await c.db.from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", k.id), "revogar chave");
    });
  }
});

test.afterAll(async () => {
  await limpeza.rodar();
});

test("openapi é público e os funis exigem chave", async () => {
  const spec = await fetch(`${c.functions}/api/openapi.json`);
  expect(spec.status).toBe(200);
  expect(((await spec.json()) as { paths: object }).paths).toHaveProperty("/deals/{id}");

  const semChave = await fetch(`${c.functions}/api/pipelines`);
  expect(semChave.status).toBe(401);

  const r = await api("GET", "/pipelines");
  expect(r.status, r.texto).toBe(200);
  const pipelines = r.json!.pipelines as { stages: { name: string }[] }[];
  expect(pipelines.length).toBeGreaterThan(0);
  expect(pipelines[0].stages.length).toBeGreaterThan(1);
});

test("contato e negócio pela API, mover por nome de etapa com histórico", async () => {
  const email = `api-${uid().slice(0, 8)}@exemplo.com.br`;
  const criado = await api("POST", "/contacts", { name: `${MARCADOR} API Lead`, email, company: `${MARCADOR} Empresa API`, custom_fields: { plano: "anual" } });
  expect(criado.status, criado.texto).toBe(201);
  const contactId = criado.json!.contact_id as string;
  limpeza.add("contato api", async () => {
    ok(await c.db.from("activities").delete().eq("contact_id", contactId), "atividades");
    ok(await c.db.from("deals").delete().eq("contact_id", contactId), "negócios");
    ok(await c.db.from("contacts").delete().eq("id", contactId), "contato");
    ok(await c.db.from("companies").delete().eq("org_id", c.orgId).eq("name", `${MARCADOR} Empresa API`), "empresa");
  });

  const denovo = await api("POST", "/contacts", { email, title: "Diretora" });
  expect(denovo.json).toMatchObject({ contact_id: contactId, created: false });

  const ficha = await api("GET", `/contacts/${contactId}`);
  expect(ficha.status).toBe(200);
  expect((ficha.json!.contact as { title: string }).title).toBe("Diretora");
  expect((ficha.json!.company as { name: string }).name).toBe(`${MARCADOR} Empresa API`);

  const funis = await api("GET", "/pipelines");
  const etapas = (funis.json!.pipelines as { stages: { id: string; name: string }[] }[])[0].stages;

  const deal = await api("POST", "/deals", { email, title: `${MARCADOR} negócio API`, value: 4900, stage: etapas[0].name });
  expect(deal.status, deal.texto).toBe(201);
  const dealId = deal.json!.deal_id as string;
  expect(deal.json!.stage_id).toBe(etapas[0].id);

  const movido = await api("PATCH", `/deals/${dealId}`, { stage: etapas[1].name, reason: "cliente pediu proposta" });
  expect(movido.status, movido.texto).toBe(200);
  expect(movido.json!.moved).toBe(true);
  const historico = ok(await c.db.from("activities").select("title, body").eq("deal_id", dealId).eq("type", "stage_change"), "histórico");
  expect(historico[0].title).toBe(`Movido para ${etapas[1].name}`);
  expect(historico[0].body).toContain("cliente pediu proposta");

  const atividade = await api("POST", "/activities", { deal_id: dealId, type: "task", title: `${MARCADOR} ligar amanhã` });
  expect(atividade.status, atividade.texto).toBe(201);
});

test("mensagem registrada pela API aparece na conversa; handoff pausa a IA", async () => {
  const telefone = `55119${uid().replace(/\D/g, "").slice(0, 8).padEnd(8, "7")}`;
  const contato = ok(await c.db.from("contacts").insert({ org_id: c.orgId, first_name: `${MARCADOR} API conversa`, whatsapp_phone: telefone }).select("id").single(), "contato");
  const conv = ok(await c.db.from("conversations").insert({ org_id: c.orgId, contact_id: contato.id, phone_number: telefone, provider: "evolution", status: "ai_active" }).select("id").single(), "conversa");
  limpeza.add("conversa api", async () => {
    ok(await c.db.from("conversation_messages").delete().eq("conversation_id", conv.id), "mensagens");
    ok(await c.db.from("conversations").delete().eq("id", conv.id), "conversa");
    ok(await c.db.from("deals").delete().eq("contact_id", contato.id), "negócios");
    ok(await c.db.from("contacts").delete().eq("id", contato.id), "contato");
  });

  const busca = await api("GET", `/conversations?phone=${telefone}`);
  expect((busca.json!.conversations as { id: string }[]).map((x) => x.id)).toContain(conv.id);

  const msg = await api("POST", `/conversations/${conv.id}/messages`, { content: "Olá! Aqui é o SDR externo.", direction: "outbound" });
  expect(msg.status, msg.texto).toBe(201);
  const lista = await api("GET", `/conversations/${conv.id}/messages`);
  expect((lista.json!.messages as { content: string; is_from_ai: boolean }[]).map((m) => m.content)).toContain("Olá! Aqui é o SDR externo.");

  const handoff = await api("POST", `/conversations/${conv.id}/handoff`, { reason: "lead pediu humano" });
  expect(handoff.status, handoff.texto).toBe(200);
  const estado = ok(await c.db.from("conversations").select("status").eq("id", conv.id).single(), "status");
  expect(estado.status).toBe("human_takeover");
  const retomada = await api("POST", `/conversations/${conv.id}/resume-ai`, {});
  expect(retomada.json!.status).toBe("ai_active");
});

test("escopo insuficiente dá 403 e o limite por minuto dá 429", async () => {
  const negado = await api("POST", "/contacts", { email: "x@exemplo.com.br" }, chaveSoLeitura);
  expect(negado.status).toBe(403);

  let ultimo = 200;
  for (let i = 0; i < 12; i++) {
    ultimo = (await api("GET", "/pipelines", undefined, chaveLimitada)).status;
    if (ultimo === 429) break;
  }
  expect(ultimo).toBe(429);

  const logs = ok(await c.db.from("api_request_logs").select("status").eq("org_id", c.orgId).order("created_at", { ascending: false }).limit(5), "logs");
  expect(logs.length).toBeGreaterThan(0);
});

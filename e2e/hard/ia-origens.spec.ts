import { expect, test } from "@playwright/test";
import { abrirSandbox, ctx, esperar, invocar, Limpeza, MARCADOR, ok, postFunction, telefoneUnico, uid, type Ctx, type Sessao } from "./ctx";

/**
 * Hard smoke dos perfis por origem (Sprint 12 B4): um contato com origem
 * "e2e_origem" tem perfil com uma instrução marcada; a resposta da IA precisa
 * refletir a instrução. Também confere a etapa inicial do perfil no envio de
 * formulário.
 */

test.describe.configure({ mode: "serial" });
test.skip(!process.env.HARD, "hard smoke: rode com npm run test:hard");

let c: Ctx;
let sandbox: Sessao;
const limpeza = new Limpeza();
const instancia = `e2e-hard-orig-${uid().slice(0, 8)}`;
let webhookToken = "";
const ORIGEM = `e2e_origem_${uid().slice(0, 6)}`;
const MARCA = "ABACAXI";

test.beforeAll(async () => {
  c = await ctx();
  sandbox = await abrirSandbox(c, limpeza, "ia-origens");
  const r = await invocar(c, "evolution-connect", {
    server_url: sandbox.base, api_key: "chave-sandbox", instance_name: instancia, display_name: `${MARCADOR} origens`, mode: "create",
  });
  expect(r.status, r.texto).toBe(200);
  limpeza.add("instância", async () => ok(await c.db.from("evolution_configs").delete().eq("instance_name", instancia), "apagar instância"));
  webhookToken = ok(await c.db.from("evolution_configs").select("webhook_token").eq("instance_name", instancia).single(), "instância").webhook_token as string;

  const original = ok(await c.db.from("ai_messaging_config").select("id, is_active, working_hours").eq("org_id", c.orgId).single(), "config IA");
  limpeza.add("restaurar IA", async () => ok(await c.db.from("ai_messaging_config").update({ is_active: original.is_active, working_hours: original.working_hours }).eq("id", original.id), "restaurar"));
  ok(await c.db.from("ai_messaging_config").update({ is_active: true, working_hours: {} }).eq("id", original.id), "ligar IA");

  const etapas = ok(await c.db.from("pipeline_stages").select("id").eq("org_id", c.orgId).order("order"), "etapas");
  const perfil = ok(await c.db.from("ai_source_profiles").insert({
    org_id: c.orgId, source: ORIGEM, label: "Origem de teste",
    instruction: `Obrigatório: termine TODA resposta com a palavra ${MARCA}, em maiúsculas, isolada no fim.`,
    funnel_mode: "suggest", initial_stage_id: etapas[1].id,
  }).select("id").single(), "perfil");
  limpeza.add("perfil", async () => ok(await c.db.from("ai_source_profiles").delete().eq("id", perfil.id), "apagar perfil"));
});

test.afterAll(async () => {
  await limpeza.rodar();
});

test("a resposta da IA segue a instrução do perfil da origem", async () => {
  test.setTimeout(150_000);
  const telefone = telefoneUnico();
  const contato = ok(await c.db.from("contacts").insert({
    org_id: c.orgId, first_name: `${MARCADOR} Origem`, whatsapp_phone: telefone, source: ORIGEM,
  }).select("id").single(), "contato");
  limpeza.add("contato origem", async () => {
    const convs = ok(await c.db.from("conversations").select("id").eq("contact_id", contato.id), "conversas") ?? [];
    for (const conv of convs) {
      ok(await c.db.from("conversation_messages").delete().eq("conversation_id", conv.id), "apagar mensagens");
      ok(await c.db.from("conversations").delete().eq("id", conv.id), "apagar conversa");
    }
    ok(await c.db.from("activities").delete().eq("contact_id", contato.id), "apagar atividades");
    ok(await c.db.from("deals").delete().eq("contact_id", contato.id), "apagar negócios");
    ok(await c.db.from("contacts").delete().eq("id", contato.id), "apagar contato");
  });

  const r = await postFunction(c, `evolution-webhook?token=${webhookToken}`, {
    event: "messages.upsert", instance: instancia,
    data: {
      key: { remoteJid: `${telefone}@s.whatsapp.net`, fromMe: false, id: `E2E${uid().slice(0, 16).toUpperCase()}` },
      pushName: `${MARCADOR} Origem`, message: { conversation: "Oi, quero saber mais sobre o serviço de vocês." },
      messageType: "conversation", messageTimestamp: Math.floor(Date.now() / 1000),
    },
  });
  expect(r.status, r.texto).toBe(200);
  const conv = ok(await c.db.from("conversations").select("id").eq("phone_number", telefone).single(), "conversa");
  const resposta = await esperar("resposta da IA", async () => {
    const m = await c.db.from("conversation_messages").select("content").eq("conversation_id", conv.id).eq("is_from_ai", true);
    return m.data?.[0] ?? null;
  }, { timeout: 120_000, intervalo: 3_000 });
  expect(resposta.content.toUpperCase(), "a instrução da origem tem que valer").toContain(MARCA);
});

test("formulário: lead com utm_source da origem nasce na etapa inicial do perfil", async () => {
  const slug = `e2e-hard-orig-${uid().slice(0, 8)}`;
  const form = ok(await c.db.from("capture_forms").insert({
    org_id: c.orgId, name: `${MARCADOR} form origem`, slug, is_active: true,
    fields: [{ key: "name", label: "Nome", type: "text", required: true }, { key: "email", label: "E-mail", type: "email", required: true }],
  }).select("id").single(), "formulário");
  const email = `hard-origem-${uid().slice(0, 6)}@exemplo.com.br`;
  limpeza.add("form origem", async () => {
    const ct = ok(await c.db.from("contacts").select("id").eq("email", email).maybeSingle(), "contato");
    if (ct) {
      ok(await c.db.from("tracking_events").delete().eq("contact_id", ct.id), "tracking");
      ok(await c.db.from("deals").delete().eq("contact_id", ct.id), "negócios");
      ok(await c.db.from("contacts").delete().eq("id", ct.id), "contato");
    }
    ok(await c.db.from("capture_forms").delete().eq("id", form.id), "apagar formulário");
  });

  const r = await postFunction(c, "submit-capture-form", {
    action: "submit", slug, values: { name: "Hard Origem", email }, tracking: { utm_source: ORIGEM },
  });
  expect(r.status, r.texto).toBe(200);
  const etapas = ok(await c.db.from("pipeline_stages").select("id").eq("org_id", c.orgId).order("order"), "etapas");
  const contato = ok(await c.db.from("contacts").select("id, source").eq("email", email).single(), "contato");
  expect(contato.source).toBe(ORIGEM);
  const deal = ok(await c.db.from("deals").select("stage_id").eq("contact_id", contato.id).single(), "negócio");
  expect(deal.stage_id, "etapa inicial do perfil").toBe(etapas[1].id);
});

import { expect, test } from "@playwright/test";
import {
  abrirSandbox, capturas, ctx, esperar, invocar, Limpeza, MARCADOR, ok, postFunction,
  rodarDispatcher, telefoneUnico, uid, type Ctx, type Sessao,
} from "./ctx";

/**
 * Hard smoke da IA no funil e do histórico automático (23/09/2026).
 *
 *  1. Equipe move no Kanban → atividade 'stage_change' com o nome de quem moveu.
 *  2. Automação move_deal → atividade "por automação" com o nome da regra.
 *  3. Lead diz que quer fechar → a IA chama mover_etapa e o histórico registra "pela IA".
 *  4. Abordagem ativa: contato novo dispara a ação ai_outreach, a primeira mensagem
 *     sai pelo Evolution (sandbox), a conversa nasce ai_active, tudo na ficha, e a
 *     resposta do lead cai na MESMA conversa sem duplicar contato.
 */

test.describe.configure({ mode: "serial" });
test.skip(!process.env.HARD, "hard smoke: rode com npm run test:hard");

let c: Ctx;
let sandbox: Sessao;
const limpeza = new Limpeza();
const instancia = `e2e-hard-ia-${uid().slice(0, 8)}`;
let webhookToken = "";
let etapas: { id: string; name: string }[] = [];

function mensagemTexto(telefone: string, texto: string, nome: string) {
  return {
    event: "messages.upsert",
    instance: instancia,
    data: {
      key: { remoteJid: `${telefone}@s.whatsapp.net`, fromMe: false, id: `E2E${uid().slice(0, 16).toUpperCase()}` },
      pushName: nome,
      message: { conversation: texto },
      messageType: "conversation",
      messageTimestamp: Math.floor(Date.now() / 1000),
    },
  };
}

async function limparContato(contactId: string) {
  ok(await c.db.from("activities").delete().eq("contact_id", contactId), "apagar atividades");
  const convs = ok(await c.db.from("conversations").select("id").eq("contact_id", contactId), "ler conversas") ?? [];
  for (const conv of convs) {
    ok(await c.db.from("conversation_messages").delete().eq("conversation_id", conv.id), "apagar mensagens");
    ok(await c.db.from("scheduled_messages").delete().eq("conversation_id", conv.id), "apagar agendadas");
    ok(await c.db.from("conversations").delete().eq("id", conv.id), "apagar conversa");
  }
  ok(await c.db.from("deals").delete().eq("contact_id", contactId), "apagar negócios");
  ok(await c.db.from("contacts").delete().eq("id", contactId), "apagar contato");
}

async function limparTelefone(telefone: string) {
  const contatos = ok(await c.db.from("contacts").select("id").eq("whatsapp_phone", telefone), "ler contatos") ?? [];
  for (const ct of contatos) await limparContato(ct.id);
  const convs = ok(await c.db.from("conversations").select("id").eq("phone_number", telefone), "ler conversas soltas") ?? [];
  for (const conv of convs) {
    ok(await c.db.from("conversation_messages").delete().eq("conversation_id", conv.id), "apagar mensagens");
    ok(await c.db.from("conversations").delete().eq("id", conv.id), "apagar conversa");
  }
}

test.beforeAll(async () => {
  c = await ctx();
  sandbox = await abrirSandbox(c, limpeza, "ia-funil");

  const r = await invocar(c, "evolution-connect", {
    server_url: sandbox.base, api_key: "chave-sandbox", instance_name: instancia,
    display_name: `${MARCADOR} IA funil`, mode: "create",
  });
  expect(r.status, r.texto).toBe(200);
  limpeza.add("instância evolution", async () =>
    ok(await c.db.from("evolution_configs").delete().eq("instance_name", instancia), "apagar instância"));
  const row = ok(await c.db.from("evolution_configs").select("webhook_token").eq("instance_name", instancia).single(), "instância");
  webhookToken = row.webhook_token as string;

  const original = ok(
    await c.db.from("ai_messaging_config").select("id, is_active, working_hours, funnel_actions, outreach").eq("org_id", c.orgId).single(),
    "config da IA",
  );
  limpeza.add("restaurar IA", async () =>
    ok(await c.db.from("ai_messaging_config").update({
      is_active: original.is_active, working_hours: original.working_hours,
      funnel_actions: original.funnel_actions, outreach: original.outreach,
    }).eq("id", original.id), "restaurar IA"));
  ok(await c.db.from("ai_messaging_config").update({
    is_active: true,
    working_hours: {},
    funnel_actions: { enabled: true, mode: "auto", allowed_stage_ids: [] },
    outreach: { instruction: "Diga que viu o pedido dele no site e pergunte o melhor horário para uma ligação.", template_name: null, template_language: "pt_BR", template_params: [] },
  }).eq("id", original.id), "ligar IA");

  const org = ok(await c.db.from("organizations").select("history_settings").eq("id", c.orgId).single(), "org");
  limpeza.add("restaurar histórico", async () =>
    ok(await c.db.from("organizations").update({ history_settings: org.history_settings }).eq("id", c.orgId), "restaurar"));
  ok(await c.db.from("organizations").update({
    history_settings: { stage_changes: true, status_changes: true, origins: { usuario: true, ia: true, automacao: true }, ai_notes: true },
  }).eq("id", c.orgId), "ligar histórico");

  etapas = ok(await c.db.from("pipeline_stages").select("id, name").eq("org_id", c.orgId).order("order"), "etapas") ?? [];
  expect(etapas.length, "o funil precisa de pelo menos 3 etapas").toBeGreaterThanOrEqual(3);
});

test.afterAll(async () => {
  await limpeza.rodar();
});

test("equipe move no Kanban: o histórico registra a etapa e quem moveu", async () => {
  const contato = ok(await c.db.from("contacts").insert({ org_id: c.orgId, first_name: `${MARCADOR} Kanban` }).select("id").single(), "contato");
  limpeza.add("contato kanban", () => limparContato(contato.id));
  const deal = ok(await c.db.from("deals").insert({
    org_id: c.orgId, contact_id: contato.id, title: `${MARCADOR} negócio kanban`, stage_id: etapas[0].id,
  }).select("id").single(), "negócio");

  ok(await c.db.from("deals").update({ stage_id: etapas[1].id }).eq("id", deal.id), "mover");

  const atividade = await esperar("atividade de etapa", async () => {
    const r = await c.db.from("activities").select("type, title, body, user_id").eq("deal_id", deal.id).eq("type", "stage_change");
    return r.data?.[0] ?? null;
  });
  expect(atividade.title).toBe(`Movido para ${etapas[1].name}`);
  expect(atividade.body).toContain(`De ${etapas[0].name} para ${etapas[1].name}`);
  expect(atividade.body).toContain("por ");
  expect(atividade.user_id).toBe(c.userId);

  // Não é tarefa: a lista de atividades sem filtro não pode trazer a entrada.
  const tarefas = ok(await c.db.from("activities").select("id").eq("deal_id", deal.id).neq("type", "stage_change"), "tarefas");
  expect(tarefas).toHaveLength(0);
});

test("automação move o negócio: o histórico registra por automação com o nome da regra", async () => {
  const nome = `Regra ${MARCADOR} ${uid().slice(0, 6)}`;
  const automacao = ok(await c.db.from("automations").insert({
    org_id: c.orgId, name: nome, is_active: true,
    trigger: { type: "deal_stage_changed" },
    conditions: [{ field: "title", op: "contains", value: "negócio automação" }],
    actions: [{ type: "move_deal", params: { stage_id: etapas[2].id } }],
    created_by: c.userId,
  }).select("id").single(), "automação");
  limpeza.add("automação move", async () => ok(await c.db.from("automations").delete().eq("id", automacao.id), "apagar"));

  const contato = ok(await c.db.from("contacts").insert({ org_id: c.orgId, first_name: `${MARCADOR} Automação` }).select("id").single(), "contato");
  limpeza.add("contato automação", () => limparContato(contato.id));
  const deal = ok(await c.db.from("deals").insert({
    org_id: c.orgId, contact_id: contato.id, title: `${MARCADOR} negócio automação`, stage_id: etapas[0].id,
  }).select("id").single(), "negócio");

  ok(await c.db.from("deals").update({ stage_id: etapas[1].id }).eq("id", deal.id), "mover pela equipe");
  await rodarDispatcher(c, "automation-dispatcher");

  const movido = await esperar("negócio na etapa 3", async () => {
    const r = await c.db.from("deals").select("stage_id").eq("id", deal.id).single();
    return r.data?.stage_id === etapas[2].id ? r.data : null;
  }, { timeout: 90_000, intervalo: 3_000 });
  expect(movido.stage_id).toBe(etapas[2].id);

  const atividades = ok(await c.db.from("activities").select("title, body").eq("deal_id", deal.id).eq("type", "stage_change").order("created_at"), "atividades");
  const porAutomacao = atividades.find((a) => a.body?.includes("por automação"));
  expect(porAutomacao, JSON.stringify(atividades)).toBeTruthy();
  expect(porAutomacao!.title).toBe(`Movido para ${etapas[2].name}`);
  expect(porAutomacao!.body).toContain(`Automação "${nome}"`);
});

test("lead quer fechar: a IA move o negócio de etapa e o histórico registra pela IA", async () => {
  test.setTimeout(180_000);
  const telefone = telefoneUnico();
  limpeza.add(`telefone ${telefone}`, () => limparTelefone(telefone));

  const r = await postFunction(c, `evolution-webhook?token=${webhookToken}`, mensagemTexto(
    telefone,
    "Oi! Já conversei com a equipe, decidi fechar e quero comprar agora. Pode me mandar a proposta e o contrato para eu assinar hoje?",
    `${MARCADOR} Fechamento`,
  ));
  expect(r.status, r.texto).toBe(200);

  const conv = ok(await c.db.from("conversations").select("id, contact_id, deal_id").eq("phone_number", telefone).single(), "conversa");
  expect(conv.deal_id, "toda conversa nova abre negócio na 1ª etapa").toBeTruthy();

  await esperar("resposta da IA gravada", async () => {
    const m = await c.db.from("conversation_messages").select("id").eq("conversation_id", conv.id).eq("is_from_ai", true);
    return m.data?.[0] ?? null;
  }, { timeout: 120_000, intervalo: 3_000 });

  const deal = ok(await c.db.from("deals").select("stage_id").eq("id", conv.deal_id!).single(), "negócio");
  expect(deal.stage_id, "a IA precisa ter avançado o negócio da 1ª etapa").not.toBe(etapas[0].id);

  const atividade = ok(await c.db.from("activities").select("title, body").eq("deal_id", conv.deal_id!).eq("type", "stage_change"), "histórico")[0];
  expect(atividade, "movimento da IA tem que aparecer no histórico").toBeTruthy();
  expect(atividade.body).toContain("pela IA");
  expect(atividade.body).toContain("Motivo:");
});

test("abordagem ativa: lead novo recebe a primeira mensagem da IA e a resposta cai na mesma conversa", async () => {
  test.setTimeout(240_000);
  const telefone = telefoneUnico();
  limpeza.add(`telefone outreach ${telefone}`, () => limparTelefone(telefone));
  const origem = `e2e-hard-outreach-${uid().slice(0, 6)}`;

  const automacao = ok(await c.db.from("automations").insert({
    org_id: c.orgId, name: `Abordagem ${MARCADOR} ${uid().slice(0, 6)}`, is_active: true,
    trigger: { type: "contact_created" },
    conditions: [{ field: "source", op: "eq", value: origem }],
    actions: [{ type: "ai_outreach", params: { instruction: "" } }],
    created_by: c.userId,
  }).select("id").single(), "automação");
  limpeza.add("automação outreach", async () => ok(await c.db.from("automations").delete().eq("id", automacao.id), "apagar"));

  const contato = ok(await c.db.from("contacts").insert({
    org_id: c.orgId, first_name: `${MARCADOR} Outreach`, last_name: "Lead", phone: telefone, source: origem,
    custom_fields: { interesse: "Plano anual para 5 usuários" },
  }).select("id").single(), "contato");
  limpeza.add("contato outreach", () => limparContato(contato.id));

  await rodarDispatcher(c, "automation-dispatcher");
  const log = await esperar("automação executada", async () => {
    const r = await c.db.from("automation_logs").select("status, result, error_msg").eq("automation_id", automacao.id);
    const l = r.data?.[0];
    return l && l.status !== "queued" && l.status !== "processing" ? l : null;
  }, { timeout: 120_000, intervalo: 3_000 });
  expect(log.status, JSON.stringify(log)).toBe("ok");

  const conv = ok(await c.db.from("conversations").select("id, status, contact_id, deal_id, provider").eq("phone_number", telefone).single(), "conversa aberta");
  expect(conv).toMatchObject({ status: "ai_active", contact_id: contato.id, provider: "evolution" });
  expect(conv.deal_id, "a abordagem abre o negócio").toBeTruthy();

  const abertura = ok(await c.db.from("conversation_messages").select("content, status, is_from_ai, direction").eq("conversation_id", conv.id), "mensagens")[0];
  expect(abertura).toMatchObject({ is_from_ai: true, direction: "outbound", status: "sent" });
  expect(abertura.content.length).toBeGreaterThan(10);

  const envio = (await capturas(c, sandbox, `/message/sendText/${instancia}`)).find((x) => x.body?.number === telefone);
  expect(envio, "a abertura tem que sair pelo Evolution").toBeTruthy();
  expect(envio!.body?.text).toBe(abertura.content);

  const nota = ok(await c.db.from("activities").select("title").eq("contact_id", contato.id).eq("type", "note"), "notas");
  expect(nota.map((n) => n.title)).toContain("IA abordou o lead pelo WhatsApp");

  const resposta = await postFunction(c, `evolution-webhook?token=${webhookToken}`, mensagemTexto(telefone, "Pode ser amanhã às 10h", "Lead"));
  expect(resposta.status, resposta.texto).toBe(200);
  await esperar("IA respondeu na mesma conversa", async () => {
    const m = await c.db.from("conversation_messages").select("id").eq("conversation_id", conv.id).eq("is_from_ai", true);
    return (m.data?.length ?? 0) >= 2 ? m.data : null;
  }, { timeout: 120_000, intervalo: 3_000 });

  const conversas = ok(await c.db.from("conversations").select("id").eq("phone_number", telefone), "conversas");
  expect(conversas, "a resposta não pode abrir uma segunda conversa").toHaveLength(1);
  const contatos = ok(await c.db.from("contacts").select("id").eq("whatsapp_phone", telefone), "contatos");
  expect(contatos.map((x) => x.id), "a resposta não pode criar um segundo contato").toEqual([contato.id]);
});

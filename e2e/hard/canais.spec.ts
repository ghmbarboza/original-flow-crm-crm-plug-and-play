import { expect, test } from "@playwright/test";
import {
  abrirSandbox, capturas, ctx, esperar, invocar, Limpeza, MARCADOR, ok, postFunction, rodarDispatcher,
  telefoneUnico, uid, type Ctx, type Sessao,
} from "./ctx";

/**
 * Vários números ao mesmo tempo (16/10/2026): o número define a abordagem.
 *
 * Duas instâncias Evolution na mesma sandbox: A com papel "ativo" (pode
 * prospectar) e B com papel "passivo" (só responde). O que se prova:
 *  1. cada instância conectada vira uma conta de canal;
 *  2. o mesmo lead escrevendo para A e para B abre DUAS conversas, com um só contato;
 *  3. a resposta da equipe e a agendada saem pela instância da conversa, nunca pela outra;
 *  4. a abordagem ativa sai por A e nunca por B;
 *  5. com a IA desligada em B, a IA não responde quem escreve para B.
 */

test.describe.configure({ mode: "serial" });
test.skip(!process.env.HARD, "hard smoke: rode com npm run test:hard");

let c: Ctx;
let sandbox: Sessao;
const limpeza = new Limpeza();
const sufixo = uid().slice(0, 8);
const instanciaA = `e2e-hard-canal-a-${sufixo}`;
const instanciaB = `e2e-hard-canal-b-${sufixo}`;
const tokens: Record<string, string> = {};
const contas: Record<string, string> = {};

function mensagemTexto(instancia: string, telefone: string, texto: string, nome: string) {
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

async function limparTelefone(telefone: string) {
  const convs = ok(await c.db.from("conversations").select("id").eq("phone_number", telefone), "ler conversas") ?? [];
  for (const conv of convs) {
    ok(await c.db.from("conversation_messages").delete().eq("conversation_id", conv.id), "apagar mensagens");
    ok(await c.db.from("scheduled_messages").delete().eq("conversation_id", conv.id), "apagar agendadas");
    ok(await c.db.from("conversations").delete().eq("id", conv.id), "apagar conversa");
  }
  const contatos = ok(await c.db.from("contacts").select("id").eq("whatsapp_phone", telefone), "ler contatos") ?? [];
  for (const ct of contatos) {
    ok(await c.db.from("activities").delete().eq("contact_id", ct.id), "apagar atividades");
    ok(await c.db.from("deals").delete().eq("contact_id", ct.id), "apagar negócios");
    ok(await c.db.from("contacts").delete().eq("id", ct.id), "apagar contato");
  }
}

function webhook(instancia: string, corpo: object) {
  return postFunction(c, `evolution-webhook?token=${tokens[instancia]}`, corpo);
}

async function conectar(instancia: string, rotulo: string) {
  const r = await invocar(c, "evolution-connect", {
    server_url: sandbox.base, api_key: "chave-sandbox", instance_name: instancia,
    display_name: `${MARCADOR} ${rotulo}`, mode: "create",
  });
  expect(r.status, r.texto).toBe(200);
  limpeza.add(`instância ${instancia}`, async () =>
    ok(await c.db.from("evolution_configs").delete().eq("instance_name", instancia), "apagar instância"));
  const row = ok(await c.db.from("evolution_configs").select("id, webhook_token").eq("instance_name", instancia).single(), "instância");
  tokens[instancia] = row.webhook_token as string;
  return row.id as string;
}

test.beforeAll(async () => {
  c = await ctx();
  sandbox = await abrirSandbox(c, limpeza, "canais");

  const idA = await conectar(instanciaA, "Número ativo");
  const idB = await conectar(instanciaB, "Número passivo");

  // Conta de canal nasce pelo gatilho da instância; aqui só o papel é ajustado.
  const contaA = ok(await c.db.from("channel_accounts").select("id").eq("evolution_config_id", idA).single(), "conta A");
  const contaB = ok(await c.db.from("channel_accounts").select("id").eq("evolution_config_id", idB).single(), "conta B");
  contas[instanciaA] = contaA.id as string;
  contas[instanciaB] = contaB.id as string;
  ok(await c.db.from("channel_accounts").update({ role: "ativo" }).eq("id", contaA.id), "papel A");
  ok(await c.db.from("channel_accounts").update({ role: "passivo" }).eq("id", contaB.id), "papel B");

  const original = ok(
    await c.db.from("ai_messaging_config").select("id, is_active, working_hours, outreach").eq("org_id", c.orgId).single(),
    "config da IA",
  );
  limpeza.add("restaurar IA", async () =>
    ok(await c.db.from("ai_messaging_config").update({
      is_active: original.is_active, working_hours: original.working_hours, outreach: original.outreach,
    }).eq("id", original.id), "restaurar IA"));
  ok(await c.db.from("ai_messaging_config").update({
    is_active: true,
    working_hours: {},
    outreach: { instruction: "Diga que viu o pedido dele no site e pergunte o melhor horário.", template_name: null, template_language: "pt_BR", template_params: [] },
  }).eq("id", original.id), "ligar IA");
});

test.afterAll(async () => {
  await limpeza.rodar();
});

test("cada instância conectada vira uma conta de canal com nome, papel e IA ligada", async () => {
  const lista = ok(
    await c.db.from("channel_accounts").select("provider, channel, label, role, ai_enabled, is_active, evolution_config_id")
      .in("id", [contas[instanciaA], contas[instanciaB]]).order("label"),
    "contas",
  );
  expect(lista).toHaveLength(2);
  expect(lista.map((x) => x.label)).toEqual([`${MARCADOR} Número ativo`, `${MARCADOR} Número passivo`]);
  for (const conta of lista) {
    expect(conta).toMatchObject({ provider: "evolution", channel: "whatsapp", ai_enabled: true, is_active: true });
    expect(conta.evolution_config_id).toBeTruthy();
  }
  expect(lista.map((x) => x.role)).toEqual(["ativo", "passivo"]);
});

test("o mesmo lead escrevendo para os dois números abre duas conversas e um só contato", async () => {
  const telefone = telefoneUnico();
  limpeza.add(`telefone ${telefone}`, () => limparTelefone(telefone));

  const ra = await webhook(instanciaA, mensagemTexto(instanciaA, telefone, "Oi, vi o anúncio", `${MARCADOR} Dois números`));
  expect(ra.status, ra.texto).toBe(200);
  const rb = await webhook(instanciaB, mensagemTexto(instanciaB, telefone, "Olá, é do suporte?", `${MARCADOR} Dois números`));
  expect(rb.status, rb.texto).toBe(200);

  const convs = ok(await c.db.from("conversations").select("id, channel_account_id, contact_id, provider").eq("phone_number", telefone), "conversas");
  expect(convs, "uma conversa por número").toHaveLength(2);
  expect(new Set(convs.map((x) => x.channel_account_id))).toEqual(new Set([contas[instanciaA], contas[instanciaB]]));
  expect(new Set(convs.map((x) => x.contact_id)).size, "o contato é o mesmo nas duas").toBe(1);

  const contatos = ok(await c.db.from("contacts").select("id").eq("whatsapp_phone", telefone), "contatos");
  expect(contatos).toHaveLength(1);

  // Mensagem nova no número A cai na conversa de A, não abre uma terceira.
  await webhook(instanciaA, mensagemTexto(instanciaA, telefone, "ainda está disponível?", `${MARCADOR} Dois números`));
  const depois = ok(await c.db.from("conversations").select("id").eq("phone_number", telefone), "conversas depois");
  expect(depois).toHaveLength(2);
});

test("resposta da equipe e mensagem agendada saem pela instância da conversa", async () => {
  const telefone = telefoneUnico();
  limpeza.add(`telefone ${telefone}`, () => limparTelefone(telefone));
  await webhook(instanciaB, mensagemTexto(instanciaB, telefone, "preciso de ajuda", `${MARCADOR} Inbox B`));
  const conv = ok(
    await c.db.from("conversations").select("id, contact_id").eq("phone_number", telefone).eq("channel_account_id", contas[instanciaB]).single(),
    "conversa de B",
  );

  const texto = `Resposta ${MARCADOR} ${uid().slice(0, 6)}`;
  const r = await invocar(c, "evolution-send-message", { conversation_id: conv.id, content: texto });
  expect(r.status, r.texto).toBe(200);

  const porB = (await capturas(c, sandbox, `/message/sendText/${instanciaB}`)).find((x) => x.body?.text === texto);
  expect(porB, "a resposta tem que sair pela instância B").toBeTruthy();
  const porA = (await capturas(c, sandbox, `/message/sendText/${instanciaA}`)).find((x) => x.body?.text === texto);
  expect(porA, "a instância A não pode receber o envio da conversa de B").toBeFalsy();

  const agendado = `Agendada ${MARCADOR} ${uid().slice(0, 6)}`;
  const agendada = ok(await c.db.from("scheduled_messages").insert({
    org_id: c.orgId, contact_id: conv.contact_id, conversation_id: conv.id, message: agendado,
    channel: "whatsapp", scheduled_at: new Date(Date.now() - 60_000).toISOString(), status: "pending", created_by: c.userId,
  }).select("id").single(), "agendar");
  await rodarDispatcher(c, "scheduled-message-dispatcher");
  const final = await esperar("agendada processada", async () => {
    const x = await c.db.from("scheduled_messages").select("status, error_msg").eq("id", agendada.id).single();
    return x.data?.status !== "pending" ? x.data : null;
  }, { timeout: 60_000, intervalo: 2_000 });
  expect(final, JSON.stringify(final)).toMatchObject({ status: "sent" });
  const envioAgendado = (await capturas(c, sandbox, `/message/sendText/${instanciaB}`)).find((x) => x.body?.text === agendado);
  expect(envioAgendado, "a agendada tem que sair pela instância B").toBeTruthy();
});

test("abordagem ativa sai pelo número ativo (A) e nunca pelo passivo (B)", async () => {
  test.setTimeout(240_000);
  const telefone = telefoneUnico();
  limpeza.add(`telefone outreach ${telefone}`, () => limparTelefone(telefone));
  const origem = `e2e-hard-canais-${uid().slice(0, 6)}`;

  const automacao = ok(await c.db.from("automations").insert({
    org_id: c.orgId, name: `Abordagem ${MARCADOR} canais ${uid().slice(0, 6)}`, is_active: true,
    trigger: { type: "contact_created" },
    conditions: [{ field: "source", op: "eq", value: origem }],
    actions: [{ type: "ai_outreach", params: { instruction: "" } }],
    created_by: c.userId,
  }).select("id").single(), "automação");
  limpeza.add("automação outreach", async () => ok(await c.db.from("automations").delete().eq("id", automacao.id), "apagar"));

  const contato = ok(await c.db.from("contacts").insert({
    org_id: c.orgId, first_name: `${MARCADOR} Outreach canais`, last_name: "Lead", phone: telefone, source: origem,
  }).select("id").single(), "contato");

  await rodarDispatcher(c, "automation-dispatcher");
  const log = await esperar("automação executada", async () => {
    const r = await c.db.from("automation_logs").select("status, result, error_msg").eq("automation_id", automacao.id);
    const l = r.data?.[0];
    return l && l.status !== "queued" && l.status !== "processing" ? l : null;
  }, { timeout: 120_000, intervalo: 3_000 });
  expect(log.status, JSON.stringify(log)).toBe("ok");

  const conv = ok(await c.db.from("conversations").select("id, channel_account_id, contact_id").eq("phone_number", telefone).single(), "conversa aberta");
  expect(conv.contact_id).toBe(contato.id);
  expect(conv.channel_account_id, "a conversa da abordagem pertence ao número ativo").toBe(contas[instanciaA]);

  const abertura = ok(await c.db.from("conversation_messages").select("content, status").eq("conversation_id", conv.id), "mensagens")[0];
  expect(abertura).toMatchObject({ status: "sent" });
  const porA = (await capturas(c, sandbox, `/message/sendText/${instanciaA}`)).find((x) => x.body?.number === telefone);
  expect(porA, "a abertura tem que sair pela instância A").toBeTruthy();
  const porB = (await capturas(c, sandbox, `/message/sendText/${instanciaB}`)).find((x) => x.body?.number === telefone);
  expect(porB, "o número passivo nunca prospecta").toBeFalsy();
});

test("sem nenhum número ativo, a abordagem é recusada com motivo claro", async () => {
  // Rebaixa A para passivo; outras contas da org também não podem contar.
  const outras = ok(
    await c.db.from("channel_accounts").select("id, role").eq("org_id", c.orgId).eq("channel", "whatsapp")
      .in("role", ["ativo", "ambos"]).not("id", "in", `(${contas[instanciaA]},${contas[instanciaB]})`),
    "outras contas",
  );
  for (const o of outras) {
    limpeza.add(`papel da conta ${o.id}`, async () => ok(await c.db.from("channel_accounts").update({ role: o.role }).eq("id", o.id), "restaurar papel"));
    ok(await c.db.from("channel_accounts").update({ role: "passivo" }).eq("id", o.id), "rebaixar");
  }
  ok(await c.db.from("channel_accounts").update({ role: "passivo" }).eq("id", contas[instanciaA]), "rebaixar A");
  try {
    const telefone = telefoneUnico();
    limpeza.add(`telefone recusa ${telefone}`, () => limparTelefone(telefone));
    const contato = ok(await c.db.from("contacts").insert({
      org_id: c.orgId, first_name: `${MARCADOR} Sem ativo`, phone: telefone, source: "e2e-hard-canais-recusa",
    }).select("id").single(), "contato");
    const r = await postFunction(c, "ai-outreach", { org_id: c.orgId, contact_id: contato.id }, {
      Authorization: `Bearer ${c.anonKey}`, apikey: c.anonKey,
    });
    // Sem o segredo interno a function recusa antes de olhar os números: a prova
    // do motivo vem pelo automation-dispatcher, que chama com a service role.
    expect(r.status).toBe(401);

    const automacao = ok(await c.db.from("automations").insert({
      org_id: c.orgId, name: `Abordagem ${MARCADOR} recusa ${uid().slice(0, 6)}`, is_active: true,
      trigger: { type: "contact_created" },
      conditions: [{ field: "source", op: "eq", value: "e2e-hard-canais-recusa-2" }],
      actions: [{ type: "ai_outreach", params: { instruction: "" } }],
      created_by: c.userId,
    }).select("id").single(), "automação");
    limpeza.add("automação recusa", async () => ok(await c.db.from("automations").delete().eq("id", automacao.id), "apagar"));
    const telefone2 = telefoneUnico();
    limpeza.add(`telefone recusa ${telefone2}`, () => limparTelefone(telefone2));
    ok(await c.db.from("contacts").insert({
      org_id: c.orgId, first_name: `${MARCADOR} Sem ativo 2`, phone: telefone2, source: "e2e-hard-canais-recusa-2",
    }), "contato 2");
    await rodarDispatcher(c, "automation-dispatcher");
    const log = await esperar("automação executada", async () => {
      const x = await c.db.from("automation_logs").select("status, result, error_msg").eq("automation_id", automacao.id);
      const l = x.data?.[0];
      return l && l.status !== "queued" && l.status !== "processing" ? l : null;
    }, { timeout: 120_000, intervalo: 3_000 });
    expect(JSON.stringify(log)).toContain("papel ativo");
    const convs = ok(await c.db.from("conversations").select("id").eq("phone_number", telefone2), "conversas");
    expect(convs, "sem número ativo não abre conversa").toHaveLength(0);
  } finally {
    ok(await c.db.from("channel_accounts").update({ role: "ativo" }).eq("id", contas[instanciaA]), "restaurar A");
  }
});

test("IA desligada em B: quem escreve para B não recebe resposta automática; A segue respondendo", async () => {
  test.setTimeout(180_000);
  ok(await c.db.from("channel_accounts").update({ ai_enabled: false }).eq("id", contas[instanciaB]), "desligar IA em B");

  const telefone = telefoneUnico();
  limpeza.add(`telefone ${telefone}`, () => limparTelefone(telefone));
  const rb = await webhook(instanciaB, mensagemTexto(instanciaB, telefone, "Olá, vocês atendem hoje?", `${MARCADOR} IA B`));
  expect(rb.status, rb.texto).toBe(200);
  const ra = await webhook(instanciaA, mensagemTexto(instanciaA, telefone, "Olá, vocês atendem hoje?", `${MARCADOR} IA A`));
  expect(ra.status, ra.texto).toBe(200);

  const convA = ok(await c.db.from("conversations").select("id").eq("phone_number", telefone).eq("channel_account_id", contas[instanciaA]).single(), "conversa A");
  const convB = ok(await c.db.from("conversations").select("id").eq("phone_number", telefone).eq("channel_account_id", contas[instanciaB]).single(), "conversa B");

  // A responde (8s de agrupamento + modelo).
  const respostaA = await esperar("IA respondeu em A", async () => {
    const m = await c.db.from("conversation_messages").select("content, status").eq("conversation_id", convA.id).eq("is_from_ai", true);
    return m.data?.[0] ?? null;
  }, { timeout: 120_000, intervalo: 3_000 });
  expect(respostaA.content).toBeTruthy();

  // B ficou em silêncio: a IA já teve tempo de sobra para responder em A.
  const emB = ok(await c.db.from("conversation_messages").select("id").eq("conversation_id", convB.id).eq("is_from_ai", true), "mensagens da IA em B");
  expect(emB, "a IA não pode responder no número com IA desligada").toHaveLength(0);
  const porB = (await capturas(c, sandbox, `/message/send`)).filter((x) => x.path.endsWith(`/${instanciaB}`) && x.body?.number === telefone);
  expect(porB).toHaveLength(0);
});

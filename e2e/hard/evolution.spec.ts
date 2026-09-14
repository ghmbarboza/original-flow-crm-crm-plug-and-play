import { expect, test } from "@playwright/test";
import {
  abrirSandbox, capturas, ctx, esperar, invocar, Limpeza, MARCADOR, ok, postFunction, rodarDispatcher,
  telefoneUnico, uid, type Ctx, type Sessao,
} from "./ctx";

/**
 * WhatsApp pelo Evolution, de ponta a ponta, sem o servidor real.
 *
 * O evolution-connect é chamado com server_url apontando para a sandbox, então
 * o fluxo inteiro (criar instância, registrar webhook, receber, responder,
 * disparar agendada) roda com o código de produção. O que o CRM manda para o
 * "servidor Evolution" fica gravado e é conferido aqui.
 *
 * A instância de teste é a ativa mais recente da org enquanto a suíte roda, então
 * os envios da org saem por ela. É apagada no fim.
 */

test.describe.configure({ mode: "serial" });
test.skip(!process.env.HARD, "hard smoke: rode com npm run test:hard");

let c: Ctx;
let sandbox: Sessao;
const limpeza = new Limpeza();
const instancia = `e2e-hard-${uid().slice(0, 10)}`;
let webhookToken = "";

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

async function limparTelefone(telefone: string) {
  const convs = ok(await c.db.from("conversations").select("id, contact_id, deal_id").eq("phone_number", telefone), "ler conversas") ?? [];
  for (const conv of convs) {
    ok(await c.db.from("conversation_messages").delete().eq("conversation_id", conv.id), "apagar mensagens");
    ok(await c.db.from("scheduled_messages").delete().eq("conversation_id", conv.id), "apagar agendadas");
    ok(await c.db.from("conversations").delete().eq("id", conv.id), "apagar conversa");
  }
  const contatos = ok(await c.db.from("contacts").select("id").eq("whatsapp_phone", telefone), "ler contatos") ?? [];
  for (const ct of contatos) {
    ok(await c.db.from("deals").delete().eq("contact_id", ct.id), "apagar negócios");
    ok(await c.db.from("contacts").delete().eq("id", ct.id), "apagar contato");
  }
}

function webhook(token: string, corpo: object) {
  return postFunction(c, `evolution-webhook?token=${token}`, corpo);
}

test.beforeAll(async () => {
  c = await ctx();
  sandbox = await abrirSandbox(c, limpeza, "evolution");
  limpeza.add("instância evolution", async () =>
    ok(await c.db.from("evolution_configs").delete().eq("instance_name", instancia), "apagar instância"));
});

test.afterAll(async () => {
  await limpeza.rodar();
});

test("conectar: cria a instância, registra o webhook com token e o servidor confirma", async () => {
  const r = await invocar(c, "evolution-connect", {
    server_url: sandbox.base,
    api_key: "chave-sandbox",
    instance_name: instancia,
    display_name: `${MARCADOR} Evolution`,
    mode: "create",
  });
  expect(r.status, r.texto).toBe(200);
  expect(r.json?.webhook_registered).toBe(true);
  expect(r.json?.qr_code).toBeTruthy();

  const row = ok(
    await c.db.from("evolution_configs").select("webhook_token, server_url, is_active").eq("instance_name", instancia).single(),
    "ler instância",
  );
  webhookToken = row.webhook_token as string;
  expect(webhookToken).toMatch(/^[0-9a-f]{64}$/);

  const set = (await capturas(c, sandbox, "/webhook/set/"))[0];
  expect(set, "o CRM precisa chamar /webhook/set").toBeTruthy();
  expect(set.headers["apikey"]).toBe("chave-sandbox");
  const cadastro = (set.body?.webhook ?? set.body) as { url: string; events: string[]; enabled: boolean };
  expect(cadastro.url).toBe(`${c.functions}/evolution-webhook?token=${webhookToken}`);
  expect(cadastro.enabled).toBe(true);
  expect(cadastro.events).toEqual(expect.arrayContaining(["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"]));

  expect((await capturas(c, sandbox, "/webhook/find/")).length, "o CRM precisa confirmar com /webhook/find").toBeGreaterThan(0);
});

test("reconectar a mesma instância mantém o token (a URL no servidor não quebra)", async () => {
  const r = await invocar(c, "evolution-connect", {
    server_url: sandbox.base, api_key: "chave-sandbox", instance_name: instancia, mode: "existing",
  });
  expect(r.status, r.texto).toBe(200);
  const row = ok(await c.db.from("evolution_configs").select("webhook_token").eq("instance_name", instancia).single(), "ler");
  expect(row.webhook_token).toBe(webhookToken);
});

test("CONNECTION_UPDATE open marca a instância como conectada com o número", async () => {
  const r = await webhook(webhookToken, {
    event: "connection.update",
    instance: instancia,
    data: { state: "open", wuid: "5511900000000@s.whatsapp.net" },
  });
  expect(r.status, r.texto).toBe(200);
  const row = ok(await c.db.from("evolution_configs").select("status, phone_number").eq("instance_name", instancia).single(), "ler");
  expect(row.status).toBe("connected");
  expect(row.phone_number).toBe("5511900000000");
});

test("webhook sem token ou com token errado é recusado e nada é gravado", async () => {
  const telefone = telefoneUnico();
  limpeza.add(`telefone ${telefone}`, () => limparTelefone(telefone));

  const semToken = await postFunction(c, "evolution-webhook", mensagemTexto(telefone, "invasão", `${MARCADOR} invasor`));
  const errado = await webhook("0".repeat(64), mensagemTexto(telefone, "invasão", `${MARCADOR} invasor`));
  expect(semToken.status).toBe(401);
  expect(errado.status).toBe(401);

  const convs = ok(await c.db.from("conversations").select("id").eq("phone_number", telefone), "ler");
  expect(convs).toHaveLength(0);
});

test("mensagem de texto vira contato, conversa, negócio aberto e mensagem", async () => {
  const telefone = telefoneUnico();
  const nome = `${MARCADOR} Lead ${uid().slice(0, 6)}`;
  limpeza.add(`telefone ${telefone}`, () => limparTelefone(telefone));

  const r = await webhook(webhookToken, mensagemTexto(telefone, "Oi, quero saber o preço", nome));
  expect(r.status, r.texto).toBe(200);

  const contato = ok(await c.db.from("contacts").select("id, first_name, source, status").eq("whatsapp_phone", telefone).single(), "contato");
  expect(contato).toMatchObject({ first_name: nome, source: "whatsapp", status: "lead" });

  const conv = ok(await c.db.from("conversations").select("id, provider, status, contact_id, deal_id").eq("phone_number", telefone).single(), "conversa");
  expect(conv).toMatchObject({ provider: "evolution", contact_id: contato.id });

  const msgs = ok(await c.db.from("conversation_messages").select("direction, content, type, status").eq("conversation_id", conv.id), "mensagens");
  expect(msgs).toEqual([expect.objectContaining({ direction: "inbound", content: "Oi, quero saber o preço", type: "text" })]);

  expect(conv.deal_id, "toda conversa nova abre negócio").toBeTruthy();
  const deal = ok(await c.db.from("deals").select("status, contact_id").eq("id", conv.deal_id).single(), "negócio");
  expect(deal).toMatchObject({ status: "open", contact_id: contato.id });
});

test("rajada de 6 mensagens simultâneas: um contato, uma conversa, seis mensagens", async () => {
  const telefone = telefoneUnico();
  const nome = `${MARCADOR} Rajada`;
  limpeza.add(`telefone ${telefone}`, () => limparTelefone(telefone));

  const respostas = await Promise.all(
    Array.from({ length: 6 }, (_, i) => webhook(webhookToken, mensagemTexto(telefone, `parte ${i + 1}`, nome))),
  );
  respostas.forEach((r) => expect(r.status, r.texto).toBe(200));

  // Espera as 6 mensagens aparecerem, somando todas as conversas do telefone, e
  // só então afirma a unicidade: assim uma duplicação aparece como duplicação,
  // não como timeout.
  await esperar("6 mensagens gravadas", async () => {
    const convs = await c.db.from("conversations").select("id").eq("phone_number", telefone);
    const ids = (convs.data ?? []).map((x) => x.id);
    if (!ids.length) return false;
    const msgs = await c.db.from("conversation_messages").select("id").in("conversation_id", ids);
    return (msgs.data?.length ?? 0) >= 6;
  });
  const convs = ok(await c.db.from("conversations").select("id").eq("phone_number", telefone), "conversas");
  const contatos = ok(await c.db.from("contacts").select("id").eq("whatsapp_phone", telefone), "contatos");
  const msgs = ok(await c.db.from("conversation_messages").select("id").in("conversation_id", convs.map((x) => x.id)), "mensagens");
  expect(contatos, "rajada não pode duplicar contato").toHaveLength(1);
  expect(convs, "rajada não pode duplicar conversa").toHaveLength(1);
  expect(msgs, "nenhuma mensagem da rajada pode se perder").toHaveLength(6);
});

test("foto com legenda é gravada com a mídia baixada pelo Evolution", async () => {
  const telefone = telefoneUnico();
  limpeza.add(`telefone ${telefone}`, () => limparTelefone(telefone));

  const corpo = mensagemTexto(telefone, "", `${MARCADOR} Foto`);
  corpo.data.message = { imageMessage: { caption: "foto do imóvel", mimetype: "image/jpeg" } } as never;
  const r = await webhook(webhookToken, corpo);
  expect(r.status, r.texto).toBe(200);

  const conv = ok(await c.db.from("conversations").select("id").eq("phone_number", telefone).single(), "conversa");
  const msg = ok(await c.db.from("conversation_messages").select("type, content, media_url").eq("conversation_id", conv.id).single(), "mensagem");
  expect(msg).toMatchObject({ type: "image", content: "foto do imóvel" });
  expect(msg.media_url, "a mídia tem que ir para o bucket").toBeTruthy();

  const downloads = await capturas(c, sandbox, "/chat/getBase64FromMediaMessage/");
  expect(downloads.length).toBeGreaterThan(0);
});

test("resposta pelo inbox sai pelo Evolution com número e texto certos", async () => {
  const telefone = telefoneUnico();
  limpeza.add(`telefone ${telefone}`, () => limparTelefone(telefone));
  await webhook(webhookToken, mensagemTexto(telefone, "preciso de ajuda", `${MARCADOR} Inbox`));
  const conv = ok(await c.db.from("conversations").select("id").eq("phone_number", telefone).single(), "conversa");

  const texto = `Resposta ${MARCADOR} ${uid().slice(0, 6)}`;
  const r = await invocar(c, "evolution-send-message", { conversation_id: conv.id, content: texto });
  expect(r.status, r.texto).toBe(200);

  const envio = (await capturas(c, sandbox, `/message/sendText/${instancia}`)).find((x) => x.body?.text === texto);
  expect(envio, "o texto tem que chegar ao Evolution").toBeTruthy();
  expect(envio!.body?.number).toBe(telefone);
  expect(envio!.headers["apikey"]).toBe("chave-sandbox");

  const msg = ok(await c.db.from("conversation_messages").select("direction, status").eq("conversation_id", conv.id).eq("content", texto).single(), "mensagem");
  expect(msg).toMatchObject({ direction: "outbound", status: "sent" });
});

test("mensagem agendada vencida sai pelo dispatcher e fica marcada como enviada", async () => {
  const telefone = telefoneUnico();
  limpeza.add(`telefone ${telefone}`, () => limparTelefone(telefone));
  await webhook(webhookToken, mensagemTexto(telefone, "me chama amanhã", `${MARCADOR} Agendada`));
  const conv = ok(await c.db.from("conversations").select("id, contact_id").eq("phone_number", telefone).single(), "conversa");

  const texto = `Agendada ${MARCADOR} ${uid().slice(0, 6)}`;
  const agendada = ok(await c.db.from("scheduled_messages").insert({
    org_id: c.orgId,
    contact_id: conv.contact_id,
    conversation_id: conv.id,
    message: texto,
    channel: "whatsapp",
    scheduled_at: new Date(Date.now() - 60_000).toISOString(),
    status: "pending",
    created_by: c.userId,
  }).select("id").single(), "agendar");

  await rodarDispatcher(c, "scheduled-message-dispatcher");

  const final = await esperar("agendada processada", async () => {
    const r = await c.db.from("scheduled_messages").select("status, error_msg").eq("id", agendada.id).single();
    return r.data?.status !== "pending" ? r.data : null;
  }, { timeout: 60_000, intervalo: 2_000 });
  expect(final, JSON.stringify(final)).toMatchObject({ status: "sent" });

  const envio = (await capturas(c, sandbox, "/message/sendText/")).find((x) => x.body?.text === texto);
  expect(envio, "a agendada tem que chegar ao Evolution").toBeTruthy();
});

test("IA ativa responde e a resposta sai pelo Evolution", async () => {
  test.setTimeout(150_000);
  const original = ok(await c.db.from("ai_messaging_config").select("id, is_active, working_hours").eq("org_id", c.orgId).single(), "config da IA");
  limpeza.add("restaurar IA", async () =>
    ok(await c.db.from("ai_messaging_config").update({ is_active: original.is_active, working_hours: original.working_hours }).eq("id", original.id), "restaurar IA"));
  ok(await c.db.from("ai_messaging_config").update({ is_active: true, working_hours: null }).eq("id", original.id), "ligar IA");

  const telefone = telefoneUnico();
  limpeza.add(`telefone ${telefone}`, () => limparTelefone(telefone));
  const r = await webhook(webhookToken, mensagemTexto(telefone, "Olá, vocês atendem hoje?", `${MARCADOR} IA`));
  expect(r.status, r.texto).toBe(200);
  const conv = ok(await c.db.from("conversations").select("id").eq("phone_number", telefone).single(), "conversa");

  // 8s de agrupamento + tempo do modelo.
  const resposta = await esperar("resposta da IA gravada", async () => {
    const m = await c.db.from("conversation_messages").select("content, status, is_from_ai")
      .eq("conversation_id", conv.id).eq("direction", "outbound").eq("is_from_ai", true);
    return m.data?.[0] ?? null;
  }, { timeout: 120_000, intervalo: 3_000 });
  expect(resposta.content, "a IA precisa responder algo").toBeTruthy();
  expect(resposta.status).not.toBe("failed");

  const envio = (await capturas(c, sandbox, "/message/send")).find((x) => x.body?.number === telefone);
  expect(envio, "a resposta da IA tem que sair pelo Evolution").toBeTruthy();
});

test("Evolution fora do ar: o envio falha com aviso e a mensagem fica marcada como falha", async () => {
  const telefone = telefoneUnico();
  limpeza.add(`telefone ${telefone}`, () => limparTelefone(telefone));
  await webhook(webhookToken, mensagemTexto(telefone, "oi", `${MARCADOR} Fora`));
  const conv = ok(await c.db.from("conversations").select("id").eq("phone_number", telefone).single(), "conversa");

  // Sessão inexistente: a sandbox responde 404, como um servidor que sumiu.
  ok(await c.db.from("evolution_configs").update({ server_url: `${c.functions}/integration-sandbox/inexistente` }).eq("instance_name", instancia), "derrubar servidor");
  try {
    const texto = `Falha ${MARCADOR} ${uid().slice(0, 6)}`;
    const r = await invocar(c, "evolution-send-message", { conversation_id: conv.id, content: texto });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.json?.error, "o usuário precisa ver o motivo").toBeTruthy();
    const msg = ok(await c.db.from("conversation_messages").select("status").eq("conversation_id", conv.id).eq("content", texto).single(), "mensagem");
    expect(msg.status).toBe("failed");
  } finally {
    ok(await c.db.from("evolution_configs").update({ server_url: sandbox.base }).eq("instance_name", instancia), "religar servidor");
  }
});

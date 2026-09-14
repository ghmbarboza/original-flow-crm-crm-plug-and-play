import { expect, test } from "@playwright/test";
import { ctx, hmacHex, invocar, Limpeza, MARCADOR, ok, postFunction, uid, type Ctx } from "./ctx";

/**
 * Multicanal pelo Zernio.
 *
 * Payloads no formato de https://docs.zernio.com/webhooks/inbox e assinatura
 * X-Zernio-Signature (HMAC-SHA256 hex do corpo). A API do Zernio tem endereço
 * fixo: cadastro de webhook e envio são provados pelo caminho de erro, com chave
 * falsa contra o Zernio de verdade.
 */

test.describe.configure({ mode: "serial" });
test.skip(!process.env.HARD, "hard smoke: rode com npm run test:hard");

let c: Ctx;
const limpeza = new Limpeza();
const profileId = `e2ehard${uid().slice(0, 12)}`;
const secret = uid();
const remetente = `ig_${uid().slice(0, 10)}`;
let conversaId = "";

function assinado(corpo: object) {
  const raw = JSON.stringify(corpo);
  return { raw, headers: { "X-Zernio-Signature": hmacHex(secret, raw), "X-Zernio-Event": String((corpo as { event: string }).event) } };
}

test.beforeAll(async () => {
  c = await ctx();
  const existente = ok(await c.db.from("zernio_configs").select("id").eq("org_id", c.orgId), "ler Zernio");
  test.skip((existente ?? []).length > 0, "a org já tem Zernio configurado: o teste não sobrescreve config real");

  const row = ok(await c.db.from("zernio_configs").insert({
    org_id: c.orgId, api_key: "zk_falsa_e2e", profile_id: profileId, webhook_secret: secret, status: "active",
  }).select("id").single(), "criar Zernio");
  limpeza.add("config Zernio", async () => ok(await c.db.from("zernio_configs").delete().eq("id", row.id), "apagar Zernio"));
  limpeza.add("conversas Zernio", async () => {
    const convs = ok(await c.db.from("conversations").select("id, contact_id").eq("phone_number", remetente), "ler") ?? [];
    for (const conv of convs) {
      ok(await c.db.from("conversation_messages").delete().eq("conversation_id", conv.id), "apagar mensagens");
      ok(await c.db.from("conversations").delete().eq("id", conv.id), "apagar conversa");
      if (conv.contact_id) ok(await c.db.from("contacts").delete().eq("id", conv.contact_id), "apagar contato");
    }
  });
});

test.afterAll(async () => {
  await limpeza.rodar();
});

test("message.received assinado vira contato, conversa do canal e mensagem", async () => {
  const { raw, headers } = assinado({
    event: "message.received",
    id: uid(),
    timestamp: new Date().toISOString(),
    account: { accountId: "acc_e2e", profileId, platform: "instagram" },
    conversation: { id: `conv_${uid().slice(0, 10)}`, platformConversationId: "pc_e2e" },
    message: {
      id: `msg_${uid().slice(0, 10)}`,
      platform: "instagram",
      direction: "incoming",
      text: "Oi pelo Instagram",
      sender: { id: remetente, name: `${MARCADOR} Zernio`, phoneNumber: null },
      attachments: [],
    },
  });
  const r = await postFunction(c, "zernio-webhook", raw, headers);
  expect(r.status, r.texto).toBe(200);

  const conv = ok(await c.db.from("conversations").select("id, provider, channel, contact_id, provider_conversation_id").eq("phone_number", remetente).single(), "conversa");
  expect(conv).toMatchObject({ provider: "zernio", channel: "instagram" });
  expect(conv.contact_id).toBeTruthy();
  expect(conv.provider_conversation_id).toMatch(/^conv_/);
  conversaId = conv.id;

  const msg = ok(await c.db.from("conversation_messages").select("direction, content").eq("conversation_id", conv.id).single(), "mensagem");
  expect(msg).toMatchObject({ direction: "inbound", content: "Oi pelo Instagram" });
});

test("assinatura errada ou ausente é recusada", async () => {
  const corpo = JSON.stringify({
    event: "message.received",
    account: { profileId, platform: "instagram" },
    message: { text: "falsa", sender: { id: `ig_${uid().slice(0, 8)}` } },
  });
  expect((await postFunction(c, "zernio-webhook", corpo)).status).toBe(401);
  expect((await postFunction(c, "zernio-webhook", corpo, { "X-Zernio-Signature": hmacHex("outro", corpo) })).status).toBe(401);
});

test("message.delivered e message.read atualizam o status da mensagem enviada", async () => {
  const pmid = `zmsg_${uid().slice(0, 10)}`;
  ok(await c.db.from("conversation_messages").insert({
    org_id: c.orgId, conversation_id: conversaId, direction: "outbound", content: `Enviada ${MARCADOR}`,
    type: "text", status: "sent", provider_message_id: pmid,
  }), "gravar enviada");

  for (const [evento, esperado] of [["message.delivered", "delivered"], ["message.read", "read"]] as const) {
    const { raw, headers } = assinado({
      event: evento, account: { profileId, platform: "instagram" }, message: { id: pmid, platform: "instagram" },
      statusAt: new Date().toISOString(),
    });
    const r = await postFunction(c, "zernio-webhook", raw, headers);
    expect(r.status, r.texto).toBe(200);
    const msg = ok(await c.db.from("conversation_messages").select("status").eq("provider_message_id", pmid).single(), "ler");
    expect(msg.status).toBe(esperado);
  }
});

test("cadastrar o webhook com chave recusada pelo Zernio: erro claro e o secret não muda", async () => {
  const r = await invocar(c, "zernio-register-webhook", {});
  expect(r.status).toBe(400);
  expect(String(r.json?.error)).toMatch(/API Key|Zernio/);

  const row = ok(await c.db.from("zernio_configs").select("webhook_secret").eq("org_id", c.orgId).single(), "ler");
  expect(row.webhook_secret, "secret só muda quando o Zernio aceita o webhook").toBe(secret);
});

test("envio com chave recusada: erro visível e mensagem marcada como falha", async () => {
  const texto = `Resposta Zernio ${MARCADOR} ${uid().slice(0, 6)}`;
  const r = await invocar(c, "zernio-send-message", { conversation_id: conversaId, content: texto });
  expect(r.status).toBe(400);
  expect(String(r.json?.error)).toContain("Zernio");
  const msg = ok(await c.db.from("conversation_messages").select("status").eq("conversation_id", conversaId).eq("content", texto).maybeSingle(), "mensagem");
  expect(msg, "o texto digitado não pode sumir: fica na conversa como falha").not.toBeNull();
  expect(msg!.status).toBe("failed");
});

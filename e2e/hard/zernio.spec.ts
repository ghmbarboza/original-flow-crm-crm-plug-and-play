import { expect, test } from "@playwright/test";
import { abrirSandbox, capturas, ctx, hmacHex, invocar, Limpeza, MARCADOR, ok, postFunction, uid, type Ctx } from "./ctx";

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

// ---------------------------------------------------------------------------
// 15/09: mídia além de áudio e contato único por canal
// ---------------------------------------------------------------------------

/** Remetente novo, com limpeza de conversa, mensagens, contato e arquivos. */
function remetenteNovo(rotulo: string) {
  const id = `ig_${rotulo}_${uid().slice(0, 8)}`;
  limpeza.add(`remetente ${id}`, async () => {
    const convs = ok(await c.db.from("conversations").select("id").eq("phone_number", id), "ler conversas") ?? [];
    for (const conv of convs) {
      const midias = (ok(await c.db.from("conversation_messages").select("media_url").eq("conversation_id", conv.id), "ler mídias") ?? [])
        .map((m) => m.media_url).filter((p): p is string => !!p);
      if (midias.length) ok(await c.db.storage.from("whatsapp-media").remove(midias), "apagar arquivos");
      ok(await c.db.from("conversation_messages").delete().eq("conversation_id", conv.id), "apagar mensagens");
      ok(await c.db.from("conversations").delete().eq("id", conv.id), "apagar conversa");
    }
    // Contato pelo identificador do canal: pega também a cópia que uma rajada criaria.
    ok(await c.db.from("contacts").delete().eq("org_id", c.orgId).eq("custom_fields->>channel_contact_id", id), "apagar contatos");
  });
  return id;
}

function mensagemInstagram(sender: string, message: Record<string, unknown>) {
  return assinado({
    event: "message.received",
    id: uid(),
    timestamp: new Date().toISOString(),
    account: { accountId: "acc_e2e", profileId, platform: "instagram" },
    conversation: { id: `conv_${uid().slice(0, 10)}` },
    message: {
      id: `msg_${uid().slice(0, 10)}`, platform: "instagram", direction: "incoming", text: null,
      sender: { id: sender, name: `${MARCADOR} Zernio mídia`, phoneNumber: null },
      attachments: [], ...message,
    },
  });
}

test("foto com legenda e documento sem legenda viram mensagens com a mídia gravada", async () => {
  test.setTimeout(90_000);
  const sandbox = await abrirSandbox(c, limpeza, "zernio-midia");
  const sender = remetenteNovo("midia");

  const foto = mensagemInstagram(sender, {
    text: "Olha o imóvel",
    attachments: [{ type: "image", url: `${sandbox.base}/cdn/foto.jpg`, payload: { mimeType: "image/jpeg" } }],
  });
  const r1 = await postFunction(c, "zernio-webhook", foto.raw, foto.headers);
  expect(r1.status, r1.texto).toBe(200);

  const doc = mensagemInstagram(sender, {
    attachments: [{ type: "file", url: `${sandbox.base}/cdn/contrato`, payload: { filename: "contrato final.pdf", mimeType: "application/pdf" } }],
  });
  const r2 = await postFunction(c, "zernio-webhook", doc.raw, doc.headers);
  expect(r2.status, r2.texto).toBe(200);

  const conv = ok(await c.db.from("conversations").select("id, last_message_preview").eq("phone_number", sender).single(), "conversa");
  expect(conv.last_message_preview, "mídia sem legenda aparece com rótulo na lista").toBe("📎 Documento");
  const msgs = ok(await c.db.from("conversation_messages").select("type, content, media_url")
    .eq("conversation_id", conv.id).order("created_at"), "mensagens") ?? [];
  expect(msgs).toHaveLength(2);
  expect(msgs[0]).toMatchObject({ type: "image", content: "Olha o imóvel" });
  expect(msgs[0].media_url).toMatch(new RegExp(`^${c.orgId}/imagem/${conv.id}/`));
  expect(msgs[1]).toMatchObject({ type: "document", content: null });
  expect(msgs[1].media_url, "documento guarda o nome original").toMatch(/contrato_final\.pdf$/);

  const baixadas = (await capturas(c, sandbox, "/cdn/")).map((x) => x.method);
  expect(baixadas, "o webhook baixa cada anexo na hora").toEqual(["GET", "GET"]);
});

test("rajada de 6 mensagens simultâneas no Instagram: um contato, uma conversa, seis mensagens", async () => {
  test.setTimeout(90_000);
  const sender = remetenteNovo("rajada");
  const envios = Array.from({ length: 6 }, (_, i) => mensagemInstagram(sender, { text: `Rajada ${i + 1}` }));
  const respostas = await Promise.all(envios.map((e) => postFunction(c, "zernio-webhook", e.raw, e.headers)));
  for (const r of respostas) expect(r.status, r.texto).toBe(200);

  const contatos = ok(await c.db.from("contacts").select("id").eq("org_id", c.orgId)
    .eq("custom_fields->>channel", "instagram").eq("custom_fields->>channel_contact_id", sender), "contatos") ?? [];
  expect(contatos, "índice uniq_contact_canal_por_org").toHaveLength(1);
  const convs = ok(await c.db.from("conversations").select("id, contact_id").eq("phone_number", sender), "conversas") ?? [];
  expect(convs).toHaveLength(1);
  expect(convs[0].contact_id, "a conversa aponta para o contato que sobrou").toBe(contatos[0].id);
  const { count } = await c.db.from("conversation_messages").select("id", { count: "exact", head: true }).eq("conversation_id", convs[0].id);
  expect(count).toBe(6);
});

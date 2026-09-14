import { expect, test } from "@playwright/test";
import {
  ctx, hmacHex, invocar, Limpeza, MARCADOR, ok, postFunction, telefoneUnico, uid, type Ctx,
} from "./ctx";

/**
 * WhatsApp pela API oficial (Meta).
 *
 * A Graph API tem endereço fixo, então a saída não passa pela sandbox: o envio
 * é provado pelo caminho de erro, com token falso contra a Meta de verdade (o
 * CRM precisa registrar a falha com o motivo que a Meta devolveu). A entrada é
 * provada inteira: verificação do webhook, assinatura X-Hub-Signature-256 e o
 * formato de payload documentado pela Meta.
 */

test.describe.configure({ mode: "serial" });
test.skip(!process.env.HARD, "hard smoke: rode com npm run test:hard");

let c: Ctx;
const limpeza = new Limpeza();
const phoneNumberId = `e2ehard${uid().slice(0, 12)}`;
const appSecret = uid();
let verifyToken = "";
let telefoneLead = "";

function payloadMeta(telefone: string, texto: string) {
  return {
    object: "whatsapp_business_account",
    entry: [{
      id: "WABA_E2E",
      changes: [{
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          metadata: { display_phone_number: "5511900000000", phone_number_id: phoneNumberId },
          contacts: [{ profile: { name: `${MARCADOR} Meta` }, wa_id: telefone }],
          messages: [{
            from: telefone,
            id: `wamid.E2E${uid()}`,
            timestamp: String(Math.floor(Date.now() / 1000)),
            type: "text",
            text: { body: texto },
          }],
        },
      }],
    }],
  };
}

async function limparTelefone(telefone: string) {
  const convs = ok(await c.db.from("conversations").select("id").eq("phone_number", telefone), "ler conversas") ?? [];
  for (const conv of convs) {
    ok(await c.db.from("conversation_messages").delete().eq("conversation_id", conv.id), "apagar mensagens");
    ok(await c.db.from("conversations").delete().eq("id", conv.id), "apagar conversa");
  }
  const contatos = ok(await c.db.from("contacts").select("id").eq("whatsapp_phone", telefone), "ler contatos") ?? [];
  for (const ct of contatos) {
    ok(await c.db.from("deals").delete().eq("contact_id", ct.id), "apagar negócios");
    ok(await c.db.from("contacts").delete().eq("id", ct.id), "apagar contato");
  }
}

test.beforeAll(async () => {
  c = await ctx();
  const row = ok(await c.db.from("meta_configs").insert({
    org_id: c.orgId,
    phone_number_id: phoneNumberId,
    business_account_id: "WABA_E2E",
    access_token: "token-falso-e2e",
    app_secret: appSecret,
    display_name: `${MARCADOR} Meta`,
    status: "connected",
    is_active: true,
  }).select("id, webhook_verify_token").single(), "criar config Meta");
  verifyToken = row.webhook_verify_token as string;
  limpeza.add("config Meta", async () => ok(await c.db.from("meta_configs").delete().eq("id", row.id), "apagar config Meta"));
});

test.afterAll(async () => {
  await limpeza.rodar();
});

test("verificação do webhook: token da empresa devolve o challenge, token errado é 403", async () => {
  const certo = await fetch(`${c.functions}/meta-webhook?hub.mode=subscribe&hub.verify_token=${verifyToken}&hub.challenge=987654`);
  expect(certo.status).toBe(200);
  expect(await certo.text()).toBe("987654");

  const errado = await fetch(`${c.functions}/meta-webhook?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=1`);
  expect(errado.status).toBe(403);

  const row = ok(await c.db.from("meta_configs").select("webhook_verified").eq("phone_number_id", phoneNumberId).single(), "ler");
  expect(row.webhook_verified, "o canal só aparece conectado depois da verificação real").toBe(true);
});

test("mensagem assinada vira contato, conversa e mensagem", async () => {
  telefoneLead = telefoneUnico();
  limpeza.add(`telefone ${telefoneLead}`, () => limparTelefone(telefoneLead));
  const corpo = JSON.stringify(payloadMeta(telefoneLead, "Olá pela Meta"));

  const r = await postFunction(c, "meta-webhook", corpo, { "X-Hub-Signature-256": `sha256=${hmacHex(appSecret, corpo)}` });
  expect(r.status, r.texto).toBe(200);

  const conv = ok(await c.db.from("conversations").select("id, provider, contact_id").eq("phone_number", telefoneLead).single(), "conversa");
  expect(conv.provider).toBe("meta_official");
  expect(conv.contact_id).toBeTruthy();
  const msg = ok(await c.db.from("conversation_messages").select("direction, content").eq("conversation_id", conv.id).single(), "mensagem");
  expect(msg).toMatchObject({ direction: "inbound", content: "Olá pela Meta" });
});

test("mensagem sem assinatura ou assinada com outro segredo é recusada e nada é gravado", async () => {
  const telefone = telefoneUnico();
  limpeza.add(`telefone ${telefone}`, () => limparTelefone(telefone));
  const corpo = JSON.stringify(payloadMeta(telefone, "falsificada"));

  const sem = await postFunction(c, "meta-webhook", corpo);
  const outra = await postFunction(c, "meta-webhook", corpo, { "X-Hub-Signature-256": `sha256=${hmacHex("outro", corpo)}` });
  expect(sem.status).toBe(401);
  expect(outra.status).toBe(401);

  const convs = ok(await c.db.from("conversations").select("id").eq("phone_number", telefone), "ler");
  expect(convs).toHaveLength(0);
});

test("envio com token recusado pela Meta: erro visível e mensagem marcada como falha", async () => {
  const conv = ok(await c.db.from("conversations").select("id").eq("phone_number", telefoneLead).single(), "conversa");
  const texto = `Resposta Meta ${MARCADOR} ${uid().slice(0, 6)}`;

  const r = await invocar(c, "meta-send-message", { conversation_id: conv.id, content: texto });
  expect(r.status).toBe(400);
  expect(String(r.json?.error ?? ""), "o motivo tem que vir da Meta").toMatch(/token|OAuth|access/i);

  const msg = ok(await c.db.from("conversation_messages").select("status").eq("conversation_id", conv.id).eq("content", texto).single(), "mensagem");
  expect(msg.status).toBe("failed");
});

test("conectar conta com token inválido: a Meta recusa e nada é salvo", async () => {
  const r = await invocar(c, "meta-verify", {
    phone_number_id: `e2ehard${uid().slice(0, 8)}`,
    business_account_id: "WABA_E2E",
    access_token: "token-invalido",
    app_secret: "segredo",
  });
  expect(r.status).toBe(400);
  expect(r.json?.error).toBeTruthy();

  const semSecret = await invocar(c, "meta-verify", {
    phone_number_id: "x", business_account_id: "y", access_token: "z",
  });
  expect(semSecret.status).toBe(400);
  expect(String(semSecret.json?.error)).toContain("App Secret");
});

test("campanha com token recusado: cada destinatário fica com a falha e o motivo", async () => {
  const campanha = ok(await c.db.from("campaigns").insert({
    org_id: c.orgId,
    name: `Campanha ${MARCADOR} ${uid().slice(0, 6)}`,
    message_template: "Olá {{nome}}",
    provider: "meta_official",
    channel: "whatsapp",
    status: "draft",
    total_recipients: 1,
    created_by: c.userId,
  }).select("id").single(), "criar campanha");
  limpeza.add("campanha", async () => {
    ok(await c.db.from("campaign_recipients").delete().eq("campaign_id", campanha.id), "apagar destinatários");
    ok(await c.db.from("campaigns").delete().eq("id", campanha.id), "apagar campanha");
  });
  ok(await c.db.from("campaign_recipients").insert({
    org_id: c.orgId, campaign_id: campanha.id, phone_number: telefoneUnico(), status: "pending",
  }), "criar destinatário");

  const r = await invocar(c, "campaign-dispatcher", { campaign_id: campanha.id });
  expect(r.status, r.texto).toBe(200);
  expect(r.json).toMatchObject({ sent: 0, failed: 1 });

  const dest = ok(await c.db.from("campaign_recipients").select("status, error_msg").eq("campaign_id", campanha.id).single(), "destinatário");
  expect(dest.status).toBe("failed");
  expect(dest.error_msg, "o motivo da Meta tem que ficar registrado").toBeTruthy();
});

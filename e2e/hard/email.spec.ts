import { expect, test } from "@playwright/test";
import { abrirSandbox, capturas, ctx, esperar, invocar, Limpeza, MARCADOR, ok, rodarDispatcher, uid, type Ctx, type Sessao } from "./ctx";

/**
 * Hard smoke do e-mail de sistema (Sprint 12 B1).
 *
 * A integration-sandbox finge o Resend (POST /emails e GET /domains). A org
 * aponta `email_settings.api_base` para a sandbox e guarda uma chave falsa no
 * Vault. Cobre: teste pela tela (email-settings send_test), verificação de
 * domínio, ação send_email das automações e o sequence-dispatcher.
 */

test.describe.configure({ mode: "serial" });
test.skip(!process.env.HARD, "hard smoke: rode com npm run test:hard");

let c: Ctx;
let sandbox: Sessao;
const limpeza = new Limpeza();

test.beforeAll(async () => {
  c = await ctx();
  sandbox = await abrirSandbox(c, limpeza, "resend");

  const anterior = ok(await c.db.from("email_settings").select("*").eq("org_id", c.orgId).maybeSingle(), "config de e-mail");
  limpeza.add("restaurar e-mail", async () => {
    if (anterior) {
      ok(await c.db.from("email_settings").update({
        provider: anterior.provider, from_name: anterior.from_name, from_email: anterior.from_email,
        reply_to: anterior.reply_to, api_base: anterior.api_base,
      }).eq("org_id", c.orgId), "restaurar");
    } else {
      ok(await c.db.from("email_settings").delete().eq("org_id", c.orgId), "apagar config");
    }
  });
  ok(await c.db.from("email_settings").upsert({
    org_id: c.orgId, provider: "resend", from_name: `${MARCADOR} Empresa`, from_email: "teste@sandbox.viverdeia.ai",
    api_base: sandbox.base,
  }, { onConflict: "org_id" }), "apontar para a sandbox");

  const chave = await invocar(c, "store-api-key", { service_name: "resend", api_key: "re_sandbox_chave_falsa", label: "resend" });
  expect(chave.status, chave.texto).toBe(200);
});

test.afterAll(async () => {
  await limpeza.rodar();
});

test("teste pela tela: o e-mail sai pela sandbox do Resend em nome da empresa e fica registrado", async () => {
  const r = await invocar(c, "email-settings", { action: "send_test" });
  expect(r.status, r.texto).toBe(200);
  expect(r.json).toMatchObject({ ok: true, provider: "resend" });

  const envio = (await capturas(c, sandbox, "/emails")).at(-1);
  expect(envio, "o POST /emails tem que chegar na sandbox").toBeTruthy();
  expect(envio!.headers["authorization"]).toBe("Bearer re_sandbox_chave_falsa");
  expect(envio!.body?.from).toBe(`${MARCADOR} Empresa <teste@sandbox.viverdeia.ai>`);
  expect(envio!.body?.subject).toBe("Teste de e-mail do CRM");

  const registro = ok(await c.db.from("emails").select("provider, status, subject").eq("org_id", c.orgId)
    .eq("subject", "Teste de e-mail do CRM").order("created_at", { ascending: false }).limit(1), "emails")[0];
  expect(registro).toMatchObject({ provider: "resend", status: "sent" });
  limpeza.add("e-mail de teste", async () => ok(await c.db.from("emails").delete().eq("org_id", c.orgId).eq("subject", "Teste de e-mail do CRM"), "apagar"));
});

test("verificação de domínio lê o Resend e grava domain_verified", async () => {
  const r = await invocar(c, "email-settings", { action: "domain_status" });
  expect(r.status, r.texto).toBe(200);
  expect(r.json).toMatchObject({ domain: "sandbox.viverdeia.ai", verified: true });
  const cfg = ok(await c.db.from("email_settings").select("domain_verified").eq("org_id", c.orgId).single(), "config");
  expect(cfg.domain_verified).toBe(true);
});

test("automação send_email usa o provedor da org", async () => {
  const assunto = `Boas-vindas ${MARCADOR} ${uid().slice(0, 6)}`;
  const template = ok(await c.db.from("email_templates").insert({
    org_id: c.orgId, name: `Modelo ${MARCADOR}`, subject: assunto, body_html: "<p>Olá {{contact.first_name}}</p>",
  }).select("id").single(), "template");
  limpeza.add("template", async () => ok(await c.db.from("email_templates").delete().eq("id", template.id), "apagar template"));

  const origem = `e2e-hard-email-${uid().slice(0, 6)}`;
  const automacao = ok(await c.db.from("automations").insert({
    org_id: c.orgId, name: `E-mail ${MARCADOR}`, is_active: true,
    trigger: { type: "contact_created" }, conditions: [{ field: "source", op: "eq", value: origem }],
    actions: [{ type: "send_email", params: { template_id: template.id } }], created_by: c.userId,
  }).select("id").single(), "automação");
  limpeza.add("automação e-mail", async () => ok(await c.db.from("automations").delete().eq("id", automacao.id), "apagar automação"));

  const contato = ok(await c.db.from("contacts").insert({
    org_id: c.orgId, first_name: `${MARCADOR} Email`, email: `lead-${uid().slice(0, 8)}@exemplo.com.br`, source: origem,
  }).select("id, email").single(), "contato");
  limpeza.add("contato e-mail", async () => {
    ok(await c.db.from("emails").delete().eq("contact_id", contato.id), "apagar e-mails");
    ok(await c.db.from("contacts").delete().eq("id", contato.id), "apagar contato");
  });

  await rodarDispatcher(c, "automation-dispatcher");
  const log = await esperar("automação executada", async () => {
    const r = await c.db.from("automation_logs").select("status, error_msg").eq("automation_id", automacao.id);
    const l = r.data?.[0];
    return l && l.status !== "queued" && l.status !== "processing" ? l : null;
  }, { timeout: 90_000, intervalo: 3_000 });
  expect(log.status, JSON.stringify(log)).toBe("ok");

  const envio = (await capturas(c, sandbox, "/emails")).find((x) => x.body?.subject === assunto);
  expect(envio, "o e-mail da automação tem que sair pela sandbox").toBeTruthy();
  expect(envio!.body?.to).toEqual([contato.email]);
  expect(envio!.body?.html).toContain(`Olá ${MARCADOR} Email`);
});

test("sequência de e-mail: o dispatcher envia o 1º passo e conclui a inscrição", async () => {
  const assunto = `Sequência ${MARCADOR} ${uid().slice(0, 6)}`;
  const template = ok(await c.db.from("email_templates").insert({
    org_id: c.orgId, name: `Passo ${MARCADOR}`, subject: assunto, body_html: "<p>Passo 1</p>",
  }).select("id").single(), "template");
  limpeza.add("template seq", async () => ok(await c.db.from("email_templates").delete().eq("id", template.id), "apagar"));
  const seq = ok(await c.db.from("email_sequences").insert({ org_id: c.orgId, name: `Seq ${MARCADOR}`, is_active: true }).select("id").single(), "sequência");
  limpeza.add("sequência", async () => ok(await c.db.from("email_sequences").delete().eq("id", seq.id), "apagar sequência"));
  ok(await c.db.from("email_sequence_steps").insert({ org_id: c.orgId, sequence_id: seq.id, template_id: template.id, delay_days: 0, order: 0 }), "passo");

  const contato = ok(await c.db.from("contacts").insert({
    org_id: c.orgId, first_name: `${MARCADOR} Seq`, email: `seq-${uid().slice(0, 8)}@exemplo.com.br`,
  }).select("id").single(), "contato");
  limpeza.add("contato seq", async () => {
    ok(await c.db.from("emails").delete().eq("contact_id", contato.id), "apagar e-mails");
    ok(await c.db.from("contacts").delete().eq("id", contato.id), "apagar contato");
  });
  const insc = ok(await c.db.from("email_sequence_enrollments").insert({
    org_id: c.orgId, sequence_id: seq.id, contact_id: contato.id, status: "active", current_step: 0,
  }).select("id").single(), "inscrição");

  await rodarDispatcher(c, "sequence-dispatcher");
  const final = await esperar("inscrição concluída", async () => {
    const r = await c.db.from("email_sequence_enrollments").select("status, current_step, last_sent_at").eq("id", insc.id).single();
    return r.data?.status === "completed" ? r.data : null;
  }, { timeout: 90_000, intervalo: 3_000 });
  expect(final.current_step).toBe(1);
  const envio = (await capturas(c, sandbox, "/emails")).find((x) => x.body?.subject === assunto);
  expect(envio, "o passo da sequência tem que sair pela sandbox").toBeTruthy();
});

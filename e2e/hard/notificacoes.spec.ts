import { expect, test } from "@playwright/test";
import { abrirSandbox, capturas, ctx, esperar, invocar, Limpeza, MARCADOR, ok, postFunction, rodarDispatcher, tornarNumeroAtivo, uid, type Ctx, type Sessao } from "./ctx";

/**
 * Hard smoke das notificações reais (Sprint 12 B2).
 *
 * A atribuição do negócio vem pelo webhook de entrada (service role, sem
 * auth.uid()), como faria uma integração: `deal.update` com `owner_email`.
 * Cobre: evento negocio_atribuido, modelo personalizado da org, entrega por
 * e-mail (Resend na sandbox) e por WhatsApp (Evolution na sandbox) para o
 * telefone do próprio usuário.
 */

test.describe.configure({ mode: "serial" });
test.skip(!process.env.HARD, "hard smoke: rode com npm run test:hard");

let c: Ctx;
let sandbox: Sessao;
let chaveWebhook = "";
let emailUsuario = "";
const limpeza = new Limpeza();
const instancia = `e2e-hard-notif-${uid().slice(0, 8)}`;
const TELEFONE_USUARIO = "5548999990000";
const EVENTO = "negocio_atribuido";

test.beforeAll(async () => {
  c = await ctx();
  sandbox = await abrirSandbox(c, limpeza, "notificacoes");
  const { data: auth } = await c.db.auth.getUser();
  emailUsuario = auth.user?.email ?? "";
  expect(emailUsuario).toBeTruthy();

  const r = await invocar(c, "evolution-connect", {
    server_url: sandbox.base, api_key: "chave-sandbox", instance_name: instancia, display_name: `${MARCADOR} notif`, mode: "create",
  });
  expect(r.status, r.texto).toBe(200);
  limpeza.add("instância", async () => ok(await c.db.from("evolution_configs").delete().eq("instance_name", instancia), "apagar instância"));
  // Aviso por WhatsApp no automático só sai por número que inicia conversa.
  const inst = ok(await c.db.from("evolution_configs").select("id").eq("instance_name", instancia).single(), "instância");
  await tornarNumeroAtivo(c, { evolution_config_id: inst.id as string });

  const cfgAntes = ok(await c.db.from("email_settings").select("*").eq("org_id", c.orgId).maybeSingle(), "config e-mail");
  limpeza.add("restaurar e-mail", async () => {
    if (cfgAntes) ok(await c.db.from("email_settings").update({ provider: cfgAntes.provider, from_name: cfgAntes.from_name, from_email: cfgAntes.from_email, api_base: cfgAntes.api_base }).eq("org_id", c.orgId), "restaurar");
    else ok(await c.db.from("email_settings").delete().eq("org_id", c.orgId), "apagar");
  });
  ok(await c.db.from("email_settings").upsert({ org_id: c.orgId, provider: "resend", from_name: MARCADOR, from_email: "avisos@sandbox.viverdeia.ai", api_base: sandbox.base }, { onConflict: "org_id" }), "sandbox e-mail");
  const chave = await invocar(c, "store-api-key", { service_name: "resend", api_key: "re_sandbox_chave_falsa", label: "resend" });
  expect(chave.status, chave.texto).toBe(200);

  const perfil = ok(await c.db.from("profiles").select("phone").eq("id", c.userId).single(), "perfil");
  limpeza.add("telefone do perfil", async () => ok(await c.db.from("profiles").update({ phone: perfil.phone }).eq("id", c.userId), "restaurar telefone"));
  ok(await c.db.from("profiles").update({ phone: TELEFONE_USUARIO }).eq("id", c.userId), "telefone");

  const prefAntes = ok(await c.db.from("notification_preferences").select("*").eq("user_id", c.userId).eq("event_type", EVENTO).maybeSingle(), "pref");
  limpeza.add("preferência", async () => {
    if (prefAntes) ok(await c.db.from("notification_preferences").update({ channel_in_app: prefAntes.channel_in_app, channel_email: prefAntes.channel_email, channel_whatsapp: prefAntes.channel_whatsapp }).eq("id", prefAntes.id), "restaurar pref");
    else ok(await c.db.from("notification_preferences").delete().eq("user_id", c.userId).eq("event_type", EVENTO), "apagar pref");
  });
  ok(await c.db.from("notification_preferences").upsert({
    org_id: c.orgId, user_id: c.userId, event_type: EVENTO, channel_in_app: true, channel_email: true, channel_whatsapp: true,
  }, { onConflict: "user_id,org_id,event_type" }), "preferência");

  ok(await c.db.from("notification_templates").delete().eq("org_id", c.orgId).eq("event_type", EVENTO), "limpar modelo");
  limpeza.add("modelo", async () => ok(await c.db.from("notification_templates").delete().eq("org_id", c.orgId).eq("event_type", EVENTO), "apagar modelo"));
  ok(await c.db.from("notification_templates").insert({
    org_id: c.orgId, event_type: EVENTO,
    title_template: "Novo negócio para você, {{user.first_name}}", body_template: "{{body}}",
    email_subject: "[CRM] {{title}}", email_html: "<p>{{body}}</p><p>{{link}}</p>", whatsapp_text: "{{title}} {{link}}",
  }), "modelo");

  const k = ok(await c.db.rpc("criar_chave_webhook", { p_name: `${MARCADOR} notif ${uid().slice(0, 6)}` }), "criar chave") as { id: string; key: string };
  chaveWebhook = k.key;
  limpeza.add("chave webhook", async () => ok(await c.db.from("webhook_inbound_keys").delete().eq("id", k.id), "apagar chave"));
});

test.afterAll(async () => {
  await limpeza.rodar();
});

test("negócio atribuído por integração: notificação com o modelo da org, e-mail e WhatsApp entregues", async () => {
  test.setTimeout(150_000);
  const contato = ok(await c.db.from("contacts").insert({ org_id: c.orgId, first_name: `${MARCADOR} Notif` }).select("id").single(), "contato");
  const titulo = `${MARCADOR} negócio notif ${uid().slice(0, 6)}`;
  const deal = ok(await c.db.from("deals").insert({ org_id: c.orgId, contact_id: contato.id, title: titulo }).select("id").single(), "negócio");
  limpeza.add("contato notif", async () => {
    ok(await c.db.from("notifications").delete().eq("user_id", c.userId).eq("type", EVENTO).eq("entity_id", deal.id), "apagar notificação");
    ok(await c.db.from("deals").delete().eq("id", deal.id), "apagar negócio");
    ok(await c.db.from("contacts").delete().eq("id", contato.id), "apagar contato");
  });

  const r = await postFunction(c, "webhook-inbound", { action: "deal.update", data: { deal_id: deal.id, owner_email: emailUsuario } }, { Authorization: `Bearer ${chaveWebhook}` });
  expect(r.status, r.texto).toBe(200);

  const notif = await esperar("notificação negocio_atribuido", async () => {
    const q = await c.db.from("notifications").select("id, title, body").eq("user_id", c.userId).eq("type", EVENTO).eq("entity_id", deal.id);
    return q.data?.[0] ?? null;
  }, { timeout: 20_000, intervalo: 1_000 });
  expect(notif.title, "o modelo da org tem que valer").toMatch(/^Novo negócio para você, /);
  expect(notif.body).toContain(titulo);

  const entregas = ok(await c.db.from("notification_deliveries").select("channel, status").eq("notification_id", notif.id), "entregas");
  expect(entregas.map((e) => e.channel).sort()).toEqual(["email", "whatsapp"]);

  await rodarDispatcher(c, "notification-dispatcher");
  const enviadas = await esperar("entregas enviadas", async () => {
    const q = await c.db.from("notification_deliveries").select("channel, status, last_error").eq("notification_id", notif.id);
    return q.data && q.data.every((e) => e.status === "sent") ? q.data : null;
  }, { timeout: 90_000, intervalo: 3_000 }).catch(async () => {
    const q = await c.db.from("notification_deliveries").select("channel, status, last_error").eq("notification_id", notif.id);
    throw new Error(`entregas não enviadas: ${JSON.stringify(q.data)}`);
  });
  expect(enviadas).toHaveLength(2);

  const email = (await capturas(c, sandbox, "/emails")).find((x) => String(x.body?.subject).includes("Novo negócio para você"));
  expect(email, "o e-mail da notificação tem que sair pela sandbox do Resend").toBeTruthy();
  expect(email!.body?.to).toEqual([emailUsuario]);
  const whatsapp = (await capturas(c, sandbox, `/message/sendText/${instancia}`)).find((x) => x.body?.number === TELEFONE_USUARIO);
  expect(whatsapp, "o WhatsApp tem que ir para o telefone do usuário").toBeTruthy();
  expect(String(whatsapp!.body?.text)).toContain("Novo negócio para você");
});

import { expect, test } from "@playwright/test";
import { abrirSandbox, capturas, ctx, esperar, invocar, Limpeza, MARCADOR, ok, postFunction, rodarDispatcher, telefoneUnico, tornarNumeroAtivo, uid, type Ctx, type Sessao } from "./ctx";

/**
 * Hard smoke da agenda (Sprint 12 B11).
 *  1. OAuth do Nylas na sandbox: connect → callback → calendar_integrations.
 *  2. Reunião criada à mão sincroniza: a sandbox recebe o POST /events e o
 *     appointment ganha external_event_id e link da sala.
 *  3. IA: sem confirmação literal, recusa (agent_action_runs refused); com o
 *     lead confirmando, agenda e a reunião aparece com source 'ia'.
 *  4. Dispatcher: reunião perto do início recebe lembrete pelo Evolution da
 *     sandbox; reunião que já começou e não foi confirmada vira no_show, avisa
 *     o dono e enfileira a automação appointment_no_show.
 */

test.describe.configure({ mode: "serial" });
test.skip(!process.env.HARD, "hard smoke: rode com npm run test:hard");

let c: Ctx;
let sandbox: Sessao;
const limpeza = new Limpeza();
const instancia = `e2e-hard-agenda-${uid().slice(0, 8)}`;
let webhookToken = "";
let politicaOriginal: Record<string, unknown> | null = null;

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

/** Próxima terça às 10:00 no fuso de São Paulo (UTC-3), pelo menos 3 dias à frente. */
function proximaTerca10h(): { data: string; iso: string } {
  const agora = new Date();
  for (let d = 3; d < 12; d++) {
    const cand = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate() + d, 13, 0, 0));
    if (cand.getUTCDay() === 2) {
      return { data: cand.toISOString().slice(0, 10), iso: cand.toISOString() };
    }
  }
  throw new Error("sem terça");
}

async function limparTelefone(telefone: string) {
  const contatos = ok(await c.db.from("contacts").select("id").eq("whatsapp_phone", telefone), "contatos") ?? [];
  for (const ct of contatos) {
    ok(await c.db.from("appointments").delete().eq("contact_id", ct.id), "reuniões");
    ok(await c.db.from("activities").delete().eq("contact_id", ct.id), "atividades");
    const convs = ok(await c.db.from("conversations").select("id").eq("contact_id", ct.id), "conversas") ?? [];
    for (const conv of convs) {
      ok(await c.db.from("conversation_messages").delete().eq("conversation_id", conv.id), "mensagens");
      ok(await c.db.from("scheduled_messages").delete().eq("conversation_id", conv.id), "agendadas");
      ok(await c.db.from("conversations").delete().eq("id", conv.id), "conversa");
    }
    ok(await c.db.from("deals").delete().eq("contact_id", ct.id), "negócios");
    ok(await c.db.from("contacts").delete().eq("id", ct.id), "contato");
  }
}

test.beforeAll(async () => {
  c = await ctx();
  sandbox = await abrirSandbox(c, limpeza, "agenda");

  // Credenciais do Nylas da org (Vault) e política de agenda com IA ligada.
  for (const [servico, valor] of [["nylas_client_id", "nylas-client-e2e"], ["nylas_api_key", "nylas-key-e2e"]]) {
    const s = await invocar(c, "store-api-key", { service_name: servico, api_key: valor, label: servico });
    expect(s.status, s.texto).toBe(200);
  }
  politicaOriginal = ok(await c.db.from("scheduling_policies").select("*").eq("org_id", c.orgId).maybeSingle(), "política") as Record<string, unknown> | null;
  limpeza.add("política de agenda", async () => {
    if (politicaOriginal) ok(await c.db.from("scheduling_policies").upsert(politicaOriginal as never, { onConflict: "org_id" }), "restaurar política");
    else ok(await c.db.from("scheduling_policies").delete().eq("org_id", c.orgId), "apagar política");
  });
  ok(await c.db.from("scheduling_policies").upsert({
    org_id: c.orgId, ai_enabled: true, default_owner_id: c.userId, min_notice_minutes: 60, buffer_minutes: 0, weekdays: [1, 2, 3, 4, 5],
    start_time: "08:00", end_time: "20:00", reminder_minutes_before: 1440, no_show_after_minutes: 5, require_literal_confirmation: true,
  }, { onConflict: "org_id" }), "política e2e");
  limpeza.add("reuniões E2E", async () => ok(await c.db.from("appointments").delete().eq("org_id", c.orgId).like("title", `${MARCADOR}%`), "apagar reuniões"));

  // Canal de WhatsApp da org na sandbox: a IA responde por ele e o lembrete sai por ele.
  const r = await invocar(c, "evolution-connect", {
    server_url: sandbox.base, api_key: "chave-sandbox", instance_name: instancia, display_name: `${MARCADOR} Agenda`, mode: "create",
  });
  expect(r.status, r.texto).toBe(200);
  limpeza.add("instância evolution", async () => ok(await c.db.from("evolution_configs").delete().eq("instance_name", instancia), "apagar instância"));
  const inst = ok(await c.db.from("evolution_configs").select("id, webhook_token").eq("instance_name", instancia).single(), "instância");
  webhookToken = inst.webhook_token as string;
  // Lembrete e aviso de não comparecimento são mensagens que a empresa inicia.
  await tornarNumeroAtivo(c, { evolution_config_id: inst.id as string });
});

test.afterAll(async () => {
  await limpeza.rodar();
});

test("OAuth do Nylas (sandbox): conecta o calendário do usuário", async () => {
  const inicio = await invocar(c, "calendar", { action: "connect", app_origin: "http://localhost:5199", api_base: `${sandbox.base}/nylas` });
  expect(inicio.status, inicio.texto).toBe(200);
  const url = new URL(String(inicio.json?.url));
  expect(url.pathname).toContain("/nylas/v3/connect/auth");
  expect(url.searchParams.get("client_id")).toBe("nylas-client-e2e");
  const state = url.searchParams.get("state")!;

  const volta = await fetch(`${c.functions}/calendar-oauth-callback?code=code-e2e&state=${encodeURIComponent(state)}`, { redirect: "manual" });
  expect(volta.status).toBe(302);
  expect(volta.headers.get("location") ?? "").toContain("/settings/agenda?calendar_connected=nylas");
  limpeza.add("integração de calendário", async () => ok(await c.db.from("calendar_integrations").delete().eq("user_id", c.userId), "apagar integração"));

  const status = await invocar(c, "calendar", { action: "status" });
  expect(status.status, status.texto).toBe(200);
  expect(status.json?.credentials_ready).toBe(true);
  expect((status.json?.integration as { account_email: string }).account_email).toBe("agenda.e2e@exemplo.com.br");
  expect(JSON.stringify(status.json)).not.toContain("grant-e2e");
});

test("reunião criada à mão vai para o calendário: a sandbox recebe o evento e o link da sala volta", async () => {
  const { iso } = proximaTerca10h();
  const inicio = new Date(iso);
  const fim = new Date(inicio.getTime() + 30 * 60_000);
  const ap = ok(await c.db.from("appointments").insert({
    org_id: c.orgId, owner_id: c.userId, title: `${MARCADOR} reunião manual`, starts_at: inicio.toISOString(), ends_at: fim.toISOString(),
    timezone: "America/Sao_Paulo", source: "manual", calendar_sync_status: "pending", created_by: c.userId,
  }).select("id, activity_id").single(), "reunião");
  expect(ap.activity_id, "trigger cria a atividade meeting").toBeTruthy();
  const atividade = ok(await c.db.from("activities").select("type, title").eq("id", ap.activity_id!).single(), "atividade");
  expect(atividade.type).toBe("meeting");

  const r = await invocar(c, "calendar", { action: "sync_event", appointment_id: ap.id });
  expect(r.status, r.texto).toBe(200);
  expect(r.json?.calendar_sync_status).toBe("synced");
  expect(String(r.json?.meeting_url)).toContain("meet.google.com");
  const eventos = (await capturas(c, sandbox, "/nylas/v3/grants/")).filter((x) => x.path.includes("/events") && x.method === "POST");
  expect(eventos.length).toBeGreaterThanOrEqual(1);
  const corpo = eventos.at(-1)!.body as { title?: string; when?: { start_time?: number }; metadata?: { key1?: string } };
  expect(corpo.title).toBe(`${MARCADOR} reunião manual`);
  expect(corpo.when?.start_time).toBe(Math.floor(inicio.getTime() / 1000));
  expect(corpo.metadata?.key1).toBe(ap.id);

  // Cancelar apaga o evento lá.
  ok(await c.db.from("appointments").update({ status: "cancelled", cancel_reason: "teste", calendar_sync_status: "pending" }).eq("id", ap.id), "cancelar");
  const r2 = await invocar(c, "calendar", { action: "sync_event", appointment_id: ap.id });
  expect(r2.status, r2.texto).toBe(200);
  const apagados = (await capturas(c, sandbox, "/nylas/v3/grants/")).filter((x) => x.path.includes("/events/") && x.method === "DELETE");
  expect(apagados.length).toBeGreaterThanOrEqual(1);
});

test("IA na conversa: recusa sem confirmação literal e agenda quando o lead confirma", async () => {
  test.setTimeout(300_000);

  const original = ok(await c.db.from("ai_messaging_config").select("id, is_active, working_hours").eq("org_id", c.orgId).single(), "config da IA");
  limpeza.add("restaurar IA", async () => ok(await c.db.from("ai_messaging_config").update({ is_active: original.is_active, working_hours: original.working_hours }).eq("id", original.id), "restaurar"));
  ok(await c.db.from("ai_messaging_config").update({ is_active: true, working_hours: {} }).eq("id", original.id), "ligar IA");

  const telefone = telefoneUnico();
  limpeza.add(`telefone ${telefone}`, () => limparTelefone(telefone));
  const { data } = proximaTerca10h();
  const [ano, mes, dia] = data.split("-");

  const respostas = async (convId: string) => {
    const m = await c.db.from("conversation_messages").select("content").eq("conversation_id", convId).eq("is_from_ai", true).order("created_at");
    return (m.data ?? []).map((x) => x.content as string);
  };

  // 1ª mensagem: pergunta vaga, sem confirmar. A IA pode consultar disponibilidade, mas não pode agendar.
  const envio1 = await postFunction(c, `evolution-webhook?token=${webhookToken}`, mensagemTexto(telefone, `Oi! Queria marcar uma reunião. Tem horário no dia ${dia}/${mes} de manhã?`, `${MARCADOR} Agenda`));
  expect(envio1.status, envio1.texto).toBe(200);
  const conv = ok(await c.db.from("conversations").select("id, contact_id").eq("phone_number", telefone).single(), "conversa");
  await esperar("1ª resposta da IA", async () => ((await respostas(conv.id)).length >= 1 ? true : null), { timeout: 150_000, intervalo: 3_000 });
  const antes = ok(await c.db.from("appointments").select("id").eq("org_id", c.orgId).eq("contact_id", conv.contact_id!), "reuniões antes");
  expect(antes, "sem confirmação literal não pode existir reunião").toHaveLength(0);

  // 2ª mensagem: confirmação literal.
  const envio2 = await postFunction(c, `evolution-webhook?token=${webhookToken}`, mensagemTexto(telefone, `Perfeito, pode marcar dia ${dia}/${mes}/${ano} às 10:00. Confirmo esse horário.`, `${MARCADOR} Agenda`));
  expect(envio2.status, envio2.texto).toBe(200);
  await esperar("2ª resposta da IA", async () => ((await respostas(conv.id)).length >= 2 ? true : null), { timeout: 150_000, intervalo: 3_000 });

  let reuniao = await c.db.from("appointments").select("id, title, starts_at, source, owner_id, calendar_sync_status, external_event_id").eq("org_id", c.orgId).eq("contact_id", conv.contact_id!).maybeSingle();
  if (!reuniao.data) {
    // A decisão é do modelo: insiste uma vez com a frase mais explícita possível.
    const envio3 = await postFunction(c, `evolution-webhook?token=${webhookToken}`, mensagemTexto(telefone, `Sim, confirmo: terça dia ${dia}/${mes}/${ano} às 10:00. Pode agendar.`, `${MARCADOR} Agenda`));
    expect(envio3.status, envio3.texto).toBe(200);
    await esperar("3ª resposta da IA", async () => ((await respostas(conv.id)).length >= 3 ? true : null), { timeout: 150_000, intervalo: 3_000 });
    reuniao = await c.db.from("appointments").select("id, title, starts_at, source, owner_id, calendar_sync_status, external_event_id").eq("org_id", c.orgId).eq("contact_id", conv.contact_id!).maybeSingle();
  }
  const ultimas = (await respostas(conv.id)).join(" | ");
  expect(reuniao.data, `a IA precisa ter agendado. Respostas: ${ultimas}`).toBeTruthy();
  expect(reuniao.data!.source).toBe("ia");
  expect(reuniao.data!.starts_at).toBe(`${data}T13:00:00+00:00`);
  expect(reuniao.data!.owner_id).toBe(c.userId);
  expect(reuniao.data!.calendar_sync_status, "espelhada no calendário do dono").toBe("synced");

  const runs = ok(await c.db.from("agent_action_runs").select("action_key, status, error_code").eq("conversation_id", conv.id), "auditoria");
  expect(runs.some((x) => x.action_key === "agendar_reuniao" && x.status === "succeeded")).toBe(true);
  ok(await c.db.from("appointments").update({ title: `${MARCADOR} ${reuniao.data!.title}` }).eq("id", reuniao.data!.id), "marcar para limpeza");
});

test("dispatcher: lembrete perto do início e no-show depois do início sem confirmação", async () => {
  test.setTimeout(180_000);
  const telefone = telefoneUnico();
  limpeza.add(`telefone lembrete ${telefone}`, () => limparTelefone(telefone));
  const contato = ok(await c.db.from("contacts").insert({ org_id: c.orgId, first_name: `${MARCADOR} Lembrete`, whatsapp_phone: telefone }).select("id").single(), "contato");
  const agora = Date.now();
  const emBreve = ok(await c.db.from("appointments").insert({
    org_id: c.orgId, contact_id: contato.id, owner_id: null, title: `${MARCADOR} reunião em breve`, starts_at: new Date(agora + 2 * 3_600_000).toISOString(),
    ends_at: new Date(agora + 2.5 * 3_600_000).toISOString(), timezone: "America/Sao_Paulo", source: "manual",
  }).select("id").single(), "reunião em breve");
  const atrasada = ok(await c.db.from("appointments").insert({
    org_id: c.orgId, contact_id: contato.id, owner_id: c.userId, title: `${MARCADOR} reunião perdida`, starts_at: new Date(agora - 20 * 60_000).toISOString(),
    ends_at: new Date(agora + 10 * 60_000).toISOString(), timezone: "America/Sao_Paulo", source: "manual", reminder_sent_at: new Date(agora - 3_600_000).toISOString(),
  }).select("id").single(), "reunião perdida");

  const automacao = ok(await c.db.from("automations").insert({
    org_id: c.orgId, name: `${MARCADOR} no-show`, is_active: true, trigger: { type: "appointment_no_show" }, actions: [{ type: "add_tag", params: { tag_name: "no-show-e2e" } }],
  }).select("id").single(), "automação");
  limpeza.add("automação no-show", async () => {
    ok(await c.db.from("automation_logs").delete().eq("automation_id", automacao.id), "logs");
    ok(await c.db.from("automations").delete().eq("id", automacao.id), "automação");
    ok(await c.db.from("tags").delete().eq("org_id", c.orgId).eq("name", "no-show-e2e"), "tag");
  });

  await rodarDispatcher(c, "appointment-dispatcher");

  const lembrete = await esperar("lembrete enviado", async () => {
    const r = await c.db.from("appointments").select("reminder_sent_at, metadata").eq("id", emBreve.id).single();
    return r.data?.reminder_sent_at ? r.data : null;
  }, { timeout: 90_000, intervalo: 3_000 });
  expect((lembrete.metadata as { reminder?: { ok?: boolean; canal?: string } }).reminder).toMatchObject({ ok: true, canal: "whatsapp" });
  const enviados = await capturas(c, sandbox, "/message/sendText/");
  const texto = enviados.map((x) => JSON.stringify(x.body)).join("\n");
  expect(texto).toContain("reunião em breve");
  expect(texto).toContain(telefone);

  const perdida = await esperar("no-show marcado", async () => {
    const r = await c.db.from("appointments").select("status, no_show_marked_at").eq("id", atrasada.id).single();
    return r.data?.status === "no_show" ? r.data : null;
  }, { timeout: 90_000, intervalo: 3_000 });
  expect(perdida.no_show_marked_at).toBeTruthy();
  const aviso = ok(await c.db.from("notifications").select("id, type").eq("user_id", c.userId).eq("type", "reuniao_no_show").eq("entity_id", atrasada.id), "notificação");
  expect(aviso.length).toBeGreaterThanOrEqual(1);
  limpeza.add("notificações", async () => ok(await c.db.from("notifications").delete().eq("entity_id", atrasada.id), "apagar avisos"));
  const fila = ok(await c.db.from("automation_logs").select("status, trigger_data").eq("automation_id", automacao.id), "fila da automação");
  expect(fila.length, "automação appointment_no_show enfileirada").toBeGreaterThanOrEqual(1);
});

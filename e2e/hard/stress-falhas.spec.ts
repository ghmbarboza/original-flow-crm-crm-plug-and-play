import { expect, test } from "@playwright/test";
import { abrirSandbox, ctx, esperar, invocar, Limpeza, MARCADOR, ok, postFunction, telefoneUnico, uid, type Ctx, type Sessao } from "./ctx";

/**
 * Estresse de FALHAS (HARD=1 STRESS=1): cada provedor externo cai (500), volta,
 * e chegam corpos malformados. O que se prova: a plataforma responde com erro
 * claro (nunca 500 genérico nem sucesso falso), grava o erro e se recupera.
 */
test.describe.configure({ mode: "serial" });
test.skip(!process.env.HARD || !process.env.STRESS, "estresse: rode com HARD=1 STRESS=1");

let c: Ctx;
let sandbox: Sessao;
const limpeza = new Limpeza();
const marca = uid().slice(0, 6);
const instancia = `e2e-hard-falhas-${marca}`;
let webhookToken = "";

const derrubar = async () => ok(await c.db.from("integration_sandbox_sessions").update({ response_status: 500 }).eq("id", sandbox.id), "derrubar");
const religar = async () => ok(await c.db.from("integration_sandbox_sessions").update({ response_status: 200 }).eq("id", sandbox.id), "religar");

function mensagemTexto(telefone: string, texto: string, nome: string) {
  return {
    event: "messages.upsert", instance: instancia,
    data: { key: { remoteJid: `${telefone}@s.whatsapp.net`, fromMe: false, id: `E2E${uid().slice(0, 16).toUpperCase()}` }, pushName: nome, message: { conversation: texto }, messageType: "conversation", messageTimestamp: Math.floor(Date.now() / 1000) },
  };
}

async function limparTelefone(telefone: string) {
  const contatos = ok(await c.db.from("contacts").select("id").eq("whatsapp_phone", telefone), "contatos") ?? [];
  for (const ct of contatos) {
    ok(await c.db.from("activities").delete().eq("contact_id", ct.id), "atividades");
    const convs = ok(await c.db.from("conversations").select("id").eq("contact_id", ct.id), "conversas") ?? [];
    for (const conv of convs) {
      ok(await c.db.from("conversation_messages").delete().eq("conversation_id", conv.id), "mensagens");
      ok(await c.db.from("scheduled_messages").delete().eq("conversation_id", conv.id), "agendadas");
      ok(await c.db.from("conversations").delete().eq("id", conv.id), "conversa");
    }
    ok(await c.db.from("calls").delete().eq("contact_id", ct.id), "ligações");
    ok(await c.db.from("deals").delete().eq("contact_id", ct.id), "negócios");
    ok(await c.db.from("contacts").delete().eq("id", ct.id), "contato");
  }
}

test.beforeAll(async () => {
  c = await ctx();
  sandbox = await abrirSandbox(c, limpeza, "stress falhas");
  const r = await invocar(c, "evolution-connect", { server_url: sandbox.base, api_key: "chave-sandbox", instance_name: instancia, display_name: `${MARCADOR} Falhas`, mode: "create" });
  expect(r.status, r.texto).toBe(200);
  limpeza.add("instância evolution", async () => ok(await c.db.from("evolution_configs").delete().eq("instance_name", instancia), "apagar instância"));
  webhookToken = ok(await c.db.from("evolution_configs").select("webhook_token").eq("instance_name", instancia).single(), "instância").webhook_token as string;
  const cfg = ok(await c.db.from("ai_messaging_config").select("id, is_active").eq("org_id", c.orgId).single(), "config IA");
  limpeza.add("restaurar IA", async () => ok(await c.db.from("ai_messaging_config").update({ is_active: cfg.is_active }).eq("id", cfg.id), "restaurar"));
  ok(await c.db.from("ai_messaging_config").update({ is_active: false }).eq("id", cfg.id), "IA desligada (falhas não gastam IA)");
});
test.afterAll(async () => { await religar(); await limpeza.rodar(); });

test("Evolution fora do ar: envio humano falha com erro claro e volta quando o provedor volta", async () => {
  test.setTimeout(180_000);
  const telefone = telefoneUnico();
  limpeza.add(`telefone ${telefone}`, () => limparTelefone(telefone));
  const entrada = await postFunction(c, `evolution-webhook?token=${webhookToken}`, mensagemTexto(telefone, "Oi, quero saber o preço", `${MARCADOR} Falha`));
  expect(entrada.status).toBe(200);
  const conv = await esperar("conversa", async () => {
    const ct = ok(await c.db.from("contacts").select("id").eq("whatsapp_phone", telefone).maybeSingle(), "contato");
    if (!ct) return null;
    return ok(await c.db.from("conversations").select("id").eq("contact_id", ct.id).maybeSingle(), "conv");
  }, { timeout: 30_000, intervalo: 2_000 });

  await derrubar();
  const falhou = await invocar(c, "evolution-send-message", { conversation_id: conv!.id, content: `${MARCADOR} teste com provedor caído` });
  expect(falhou.status, "não pode ser 200 com o provedor caído").not.toBe(200);
  expect(falhou.status, "erro de provedor não é 500 genérico").not.toBe(500);
  expect(falhou.json?.error, "mensagem de erro presente").toBeTruthy();
  const { count: enviadas } = await c.db.from("conversation_messages").select("id", { count: "exact", head: true }).eq("conversation_id", conv!.id).eq("status", "sent").like("content", `${MARCADOR} teste com provedor caído%`);
  expect(enviadas ?? 0, "nada marcado como enviado").toBe(0);

  await religar();
  const voltou = await invocar(c, "evolution-send-message", { conversation_id: conv!.id, content: `${MARCADOR} teste com provedor de volta` });
  expect(voltou.status, voltou.texto).toBe(200);
});

test("ElevenLabs e Twilio fora do ar: sincronizar agente e importar número devolvem 502 e registram o erro", async () => {
  test.setTimeout(180_000);
  limpeza.add("agente de voz", async () => ok(await c.db.from("voice_agents").delete().eq("org_id", c.orgId), "apagar agente"));
  const numero = `+5548${Date.now().toString().slice(-8)}`;
  limpeza.add("número", async () => ok(await c.db.from("phone_numbers").delete().eq("org_id", c.orgId).eq("e164", numero), "apagar número"));
  await derrubar();
  const sync = await invocar(c, "voice", { action: "agent_sync", api_base: sandbox.base });
  expect(sync.status, sync.texto).toBe(502);
  expect(sync.json?.error).toBeTruthy();
  const agente = ok(await c.db.from("voice_agents").select("elevenlabs_agent_id, last_error").eq("org_id", c.orgId).single(), "agente");
  expect(agente.elevenlabs_agent_id).toBeNull();
  expect(agente.last_error, "erro guardado para a tela mostrar").toBeTruthy();

  const imp = await invocar(c, "voice", { action: "numbers_import", api_base: sandbox.base, phone_number: numero });
  expect([502, 404]).toContain(imp.status);
  const { count } = await c.db.from("phone_numbers").select("id", { count: "exact", head: true }).eq("org_id", c.orgId).eq("e164", numero).eq("status", "active");
  expect(count ?? 0, "número não fica ativo sem o provedor").toBe(0);

  await religar();
  const ok2 = await invocar(c, "voice", { action: "agent_sync", api_base: sandbox.base });
  expect(ok2.status, ok2.texto).toBe(200);
  const depois = ok(await c.db.from("voice_agents").select("last_error").eq("org_id", c.orgId).single(), "agente");
  expect(depois.last_error, "erro limpo depois do sucesso").toBeNull();
});

test("CRM externo fora do ar: conectar devolve erro e não cria conexão pela metade", async () => {
  await derrubar();
  const r = await invocar(c, "crm-connect", { action: "connect", provider: "hubspot", token: `tok-${marca}`, api_base: `${sandbox.base}/crm/hubspot` });
  expect(r.status).not.toBe(200);
  expect(r.status).not.toBe(500);
  expect(r.json?.error).toBeTruthy();
  const { count } = await c.db.from("crm_connections").select("id", { count: "exact", head: true }).eq("org_id", c.orgId).eq("provider", "hubspot").eq("status", "connected");
  expect(count ?? 0).toBe(0);
  await religar();
});

test("corpos malformados: nenhuma function responde 500", async () => {
  test.setTimeout(180_000);
  const casos: { nome: string; caminho: string; corpo: string; headers?: Record<string, string> }[] = [
    { nome: "evolution-webhook vazio", caminho: `evolution-webhook?token=${webhookToken}`, corpo: "{}" },
    { nome: "evolution-webhook não-JSON", caminho: `evolution-webhook?token=${webhookToken}`, corpo: "isto não é json" },
    { nome: "evolution-webhook tipos errados", caminho: `evolution-webhook?token=${webhookToken}`, corpo: JSON.stringify({ event: "messages.upsert", instance: instancia, data: { key: 42, message: "x" } }) },
    { nome: "evolution-webhook token errado", caminho: "evolution-webhook?token=nao-existe", corpo: JSON.stringify(mensagemTexto("5511999990000", "oi", "x")) },
    { nome: "voice-webhook não-JSON com assinatura falsa", caminho: `voice-webhook?org=${c.orgId}&tipo=fim`, corpo: "<<<", headers: { "elevenlabs-signature": "t=1,v0=abc" } },
    { nome: "voice-webhook org inválida", caminho: "voice-webhook?org=abc&tipo=inicio", corpo: "{}" },
    { nome: "submit-capture-form sem slug", caminho: "submit-capture-form", corpo: JSON.stringify({ action: "submit" }) },
    { nome: "submit-capture-form valor gigante", caminho: "submit-capture-form", corpo: JSON.stringify({ action: "submit", slug: "nao-existe", values: { name: "x".repeat(100_000) } }) },
    { nome: "api sem token", caminho: "api/contacts", corpo: "{}" },
    { nome: "api JSON inválido", caminho: "api/contacts", corpo: "{", headers: { Authorization: "Bearer nada" } },
    { nome: "calcom-webhook vazio", caminho: "calcom-webhook", corpo: "{}" },
    { nome: "webhook-inbound sem chave", caminho: "webhook-inbound", corpo: JSON.stringify({ action: "deal.update" }) },
  ];
  const resultados: string[] = [];
  for (const caso of casos) {
    const r = await postFunction(c, caso.caminho, caso.corpo, caso.headers);
    resultados.push(`${caso.nome}: ${r.status}`);
    expect(r.status, `${caso.nome} respondeu ${r.status}: ${r.texto.slice(0, 160)}`).toBeLessThan(500);
  }
  console.log(`[stress] malformados → ${resultados.join(" | ")}`);
});

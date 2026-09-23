import { expect, test } from "@playwright/test";
import { abrirSandbox, capturas, ctx, esperar, hmacHex, invocar, Limpeza, MARCADOR, ok, postFunction, rodarDispatcher, telefoneUnico, uid, type Ctx, type Sessao } from "./ctx";

/**
 * Hard smoke da voz (Sprint 12 B13), contra Twilio e ElevenLabs falsos na sandbox:
 * sincroniza o agente (prompt com fatos e ferramentas), importa um número, liga
 * pela IA, recebe as ferramentas e o pós-ligação assinados, e a ligação vira
 * transcrição, resumo, classificação, gravação, atividade e memória do lead.
 * Por fim uma campanha coloca uma ligação pelo dispatcher.
 */

test.describe.configure({ mode: "serial" });
test.skip(!process.env.HARD, "hard smoke: rode com npm run test:hard");

let c: Ctx;
let sandbox: Sessao;
const limpeza = new Limpeza();
const marca = uid().slice(0, 6);
const numeroE164 = `+5548${Date.now().toString().slice(-8)}`;
let segredoWebhook = "";
let contatoId = "";
let dealId = "";
let callId = "";
let conversationId = "";

async function garantirChave(servico: string, valor: string) {
  const existente = ok(await c.db.from("api_keys_registry").select("service_name").eq("org_id", c.orgId).eq("service_name", servico).limit(1).maybeSingle(), `chave ${servico}`);
  if (existente) return;
  const s = await invocar(c, "store-api-key", { service_name: servico, api_key: valor, label: servico });
  expect(s.status, s.texto).toBe(200);
  limpeza.add(`chave ${servico}`, async () => ok(await c.db.from("api_keys_registry").delete().eq("org_id", c.orgId).eq("service_name", servico), `apagar chave ${servico}`));
}

async function limparContato(id: string) {
  ok(await c.db.from("calls").delete().eq("contact_id", id), "ligações");
  ok(await c.db.from("activities").delete().eq("contact_id", id), "atividades");
  ok(await c.db.from("deals").delete().eq("contact_id", id), "negócios");
  ok(await c.db.from("contacts").delete().eq("id", id), "contato");
}

test.beforeAll(async () => {
  c = await ctx();
  sandbox = await abrirSandbox(c, limpeza, "voz");
  // A sandbox ignora os valores; só precisam existir no Vault.
  await garantirChave("elevenlabs", "el_sandbox_chave_falsa");
  await garantirChave("twilio_account_sid", "ACsandbox0000000000000000000000000");
  await garantirChave("twilio_auth_token", "token_sandbox_falso");
  // O agente da org aponta para a sandbox durante o teste; no fim a linha sai
  // para nada da sandbox (api_base, agente falso) sobrar na configuração real.
  limpeza.add("agente de voz", async () => ok(await c.db.from("voice_agents").delete().eq("org_id", c.orgId), "apagar agente de voz"));
  limpeza.add("número", async () => ok(await c.db.from("phone_numbers").delete().eq("org_id", c.orgId).eq("e164", numeroE164), "apagar número"));
});

test.afterAll(async () => {
  await limpeza.rodar();
});

test("agent_sync cria o agente no ElevenLabs com o prompt, os fatos e as ferramentas da org", async () => {
  test.setTimeout(120_000);
  const r = await invocar(c, "voice", { action: "agent_sync", api_base: sandbox.base });
  expect(r.status, r.texto).toBe(200);
  expect(r.json?.agent_id).toBe("agent_e2e_0001");

  const cap = (await capturas(c, sandbox, "/elevenlabs/v1/convai/agents/create")).at(-1);
  expect(cap, "captura da criação do agente").toBeTruthy();
  const corpo = cap!.body as { conversation_config: { agent: { prompt: { prompt: string; tools: { name: string; api_schema: { url: string; request_headers: Record<string, string> } }[] } } }; platform_settings: { webhook: { url: string; secret: string } } };
  expect(corpo.conversation_config.agent.prompt.prompt).toContain("REGRAS DE VERDADE");
  const nomes = corpo.conversation_config.agent.prompt.tools.map((t) => t.name);
  expect(nomes).toEqual(expect.arrayContaining(["buscar_conhecimento", "registrar_duvida", "qualificar_lead"]));
  expect(corpo.platform_settings.webhook.url).toContain(`org=${c.orgId}&tipo=fim`);
  segredoWebhook = corpo.platform_settings.webhook.secret;
  expect(segredoWebhook.length).toBeGreaterThan(20);
  expect(corpo.conversation_config.agent.prompt.tools[0].api_schema.request_headers["x-el-webhook-secret"]).toBe(segredoWebhook);

  const agente = ok(await c.db.from("voice_agents").select("elevenlabs_agent_id, synced_at, last_error").eq("org_id", c.orgId).single(), "agente");
  expect(agente.elevenlabs_agent_id).toBe("agent_e2e_0001");
  expect(agente.synced_at).toBeTruthy();
  expect(agente.last_error).toBeNull();
});

test("numbers_import traz o número do Twilio e conecta ao agente", async () => {
  const r = await invocar(c, "voice", { action: "numbers_import", api_base: sandbox.base, phone_number: numeroE164, label: `${MARCADOR} ${marca}` });
  expect(r.status, r.texto).toBe(200);
  expect(r.json?.elevenlabs_phone_number_id).toBe("phnum_e2e_0001");
  const numero = ok(await c.db.from("phone_numbers").select("*").eq("e164", numeroE164).single(), "número");
  expect(numero.status).toBe("active");
  expect(numero.twilio_sid).toBe("PNe2eimportado0001");
  expect(numero.elevenlabs_phone_number_id).toBe("phnum_e2e_0001");
  const vinculo = (await capturas(c, sandbox, "/elevenlabs/v1/convai/phone-numbers/phnum_e2e_0001")).at(-1);
  expect((vinculo?.body as { agent_id?: string } | null)?.agent_id).toBe("agent_e2e_0001");

  const u = await invocar(c, "voice", { action: "number_update", api_base: sandbox.base, phone_number_id: numero.id, outbound_enabled: true, inbound_behavior: "ai_answer" });
  expect(u.status, u.texto).toBe(200);
});

test("call_outbound liga pela IA com o id da ligação nas variáveis dinâmicas", async () => {
  const telefone = telefoneUnico();
  const contato = ok(await c.db.from("contacts").insert({ org_id: c.orgId, first_name: `${MARCADOR} Bruno`, last_name: marca, whatsapp_phone: telefone }).select("id").single(), "contato");
  contatoId = contato.id;
  limpeza.add("contato da ligação", () => limparContato(contatoId));
  const deal = ok(await c.db.from("deals").insert({ org_id: c.orgId, contact_id: contatoId, title: `${MARCADOR} Oficina ${marca}`, value: 0, status: "open" }).select("id").single(), "negócio");
  dealId = deal.id;

  const r = await invocar(c, "voice", { action: "call_outbound", api_base: sandbox.base, contact_id: contatoId, instruction: "entender a demora no atendimento" });
  expect(r.status, r.texto).toBe(200);
  callId = String(r.json?.call_id);
  conversationId = String(r.json?.conversation_id);
  expect(conversationId).toMatch(/^conv_e2e_/);

  const call = ok(await c.db.from("calls").select("*").eq("id", callId).single(), "ligação");
  expect(call.status).toBe("ringing");
  expect(call.deal_id).toBe(dealId);
  expect(call.to_number).toBe(`+${telefone}`);
  expect(call.provider_call_sid).toMatch(/^CA/);

  const cap = (await capturas(c, sandbox, "/elevenlabs/v1/convai/twilio/outbound-call")).at(-1);
  const vars = (cap?.body as { conversation_initiation_client_data: { dynamic_variables: Record<string, string> } }).conversation_initiation_client_data.dynamic_variables;
  expect(vars.flowcrm_call_id).toBe(callId);
  expect(vars.lead_name).toContain("Bruno");
  expect(vars.call_purpose).toBe("entender a demora no atendimento");
});

test("ferramentas durante a ligação exigem o segredo e registram a qualificação", async () => {
  const semSegredo = await postFunction(c, `voice-webhook?org=${c.orgId}&tipo=tool&tool=buscar_conhecimento`, { query: "garantia" });
  expect(semSegredo.status).toBe(401);

  const cabecalhos = { "x-el-webhook-secret": segredoWebhook, "x-voice-call-id": callId, "x-conversation-id": conversationId };
  const busca = await postFunction(c, `voice-webhook?org=${c.orgId}&tipo=tool&tool=buscar_conhecimento`, { query: "garantia do produto" }, cabecalhos);
  expect(busca.status, busca.texto).toBe(200);

  const q = await postFunction(c, `voice-webhook?org=${c.orgId}&tipo=tool&tool=qualificar_lead`, { temperatura: "quente", orcamento: "dois mil por mês", prazo: "este mês" }, cabecalhos);
  expect(q.status, q.texto).toBe(200);
  const call = ok(await c.db.from("calls").select("metadata").eq("id", callId).single(), "ligação");
  expect((call.metadata as { qualificacao?: { temperatura?: string } }).qualificacao?.temperatura).toBe("quente");
});

test("pós-ligação assinado finaliza: transcrição, resumo, classificação, gravação, atividade e memória do lead", async () => {
  test.setTimeout(180_000);
  const corpo = JSON.stringify({ type: "post_call_transcription", data: { conversation_id: conversationId, agent_id: "agent_e2e_0001" } });
  const t = Math.floor(Date.now() / 1000);
  const invalida = await postFunction(c, `voice-webhook?org=${c.orgId}&tipo=fim`, corpo, { "elevenlabs-signature": `t=${t},v0=${"0".repeat(64)}` });
  expect(invalida.status).toBe(401);

  const assinatura = `t=${t},v0=${hmacHex(segredoWebhook, `${t}.${corpo}`)}`;
  const fim = await postFunction(c, `voice-webhook?org=${c.orgId}&tipo=fim`, corpo, { "elevenlabs-signature": assinatura });
  expect(fim.status, fim.texto).toBe(200);

  const call = await esperar("ligação concluída", async () => {
    const r = ok(await c.db.from("calls").select("*").eq("id", callId).single(), "ligação");
    if (r.status !== "completed") throw new Error(`status ${r.status}`);
    return r;
  }, { timeout: 90_000, intervalo: 3_000 });
  expect((call.transcript as unknown[]).length).toBe(5);
  expect(call.duration_seconds).toBe(31);
  expect(call.summary).toBeTruthy();
  expect(call.recording_path).toMatch(new RegExp(`^${c.orgId}/`));
  const cls = call.classification as { category: string; score: number };
  expect(["qualified", "callback", "scheduled", "other"]).toContain(cls.category);

  const atividade = ok(await c.db.from("activities").select("type, title").eq("contact_id", contatoId).eq("type", "call").limit(1).maybeSingle(), "atividade");
  expect(atividade, "atividade de ligação").toBeTruthy();
  expect(call.activity_id).toBeTruthy();

  const contato = ok(await c.db.from("contacts").select("client_memory").eq("id", contatoId).single(), "contato");
  const memoria = contato.client_memory as { interaction_summary?: { analyses?: number; summary?: string }; company?: { value?: string } } | null;
  expect(memoria?.interaction_summary?.analyses ?? 0).toBeGreaterThanOrEqual(1);
  const deal = ok(await c.db.from("deals").select("qualification").eq("id", dealId).single(), "negócio");
  expect(deal.qualification, "BANT preenchido pela ligação").toBeTruthy();
});

test("campanha de ligações coloca a ligação pelo dispatcher e conta a colocação", async () => {
  test.setTimeout(180_000);
  const telefone = telefoneUnico();
  const contato = ok(await c.db.from("contacts").insert({ org_id: c.orgId, first_name: `${MARCADOR} Campanha`, last_name: marca, whatsapp_phone: telefone }).select("id").single(), "contato");
  limpeza.add("contato da campanha", () => limparContato(contato.id));
  // Segundo contato sem telefone: tem que contar como falha da campanha.
  const semTelefone = ok(await c.db.from("contacts").insert({ org_id: c.orgId, first_name: `${MARCADOR} SemFone`, last_name: marca }).select("id").single(), "contato sem fone");
  limpeza.add("contato sem telefone", () => limparContato(semTelefone.id));
  const campanha = ok(await c.db.from("voice_campaigns").insert({ org_id: c.orgId, name: `${MARCADOR} Campanha ${marca}`, instruction: "convidar para o evento", status: "running", total: 2, max_concurrent: 2, created_by: c.userId }).select("id").single(), "campanha");
  limpeza.add("campanha", async () => ok(await c.db.from("voice_campaigns").delete().eq("id", campanha.id), "apagar campanha"));
  ok(await c.db.from("voice_campaign_contacts").insert([
    { campaign_id: campanha.id, org_id: c.orgId, contact_id: contato.id },
    { campaign_id: campanha.id, org_id: c.orgId, contact_id: semTelefone.id },
  ]), "fila");

  await rodarDispatcher(c, "voice-campaign-dispatcher");
  const call = await esperar("ligação da campanha", async () => {
    const r = ok(await c.db.from("calls").select("*").eq("campaign_id", campanha.id).maybeSingle(), "ligação da campanha");
    if (!r) throw new Error("ainda sem ligação");
    return r;
  }, { timeout: 60_000, intervalo: 3_000 });
  expect(call.status).toBe("ringing");
  expect(call.purpose).toBe("campaign");
  expect(call.elevenlabs_conversation_id).toMatch(/^conv_e2e_/);
  const fila = ok(await c.db.from("voice_campaign_contacts").select("status, call_id, attempts").eq("campaign_id", campanha.id).eq("contact_id", contato.id).single(), "fila");
  expect(fila.status).toBe("placed");
  expect(fila.call_id).toBe(call.id);
  const falhou = ok(await c.db.from("voice_campaign_contacts").select("status, last_error").eq("campaign_id", campanha.id).eq("contact_id", semTelefone.id).single(), "fila sem fone");
  expect(falhou.status).toBe("failed");
  const camp = await esperar("contadores da campanha", async () => {
    const r = ok(await c.db.from("voice_campaigns").select("placed, failed").eq("id", campanha.id).single(), "campanha");
    if (r.placed < 1 || r.failed < 1) throw new Error(`placed ${r.placed} failed ${r.failed}`);
    return r;
  }, { timeout: 30_000, intervalo: 2_000 });
  expect(camp.placed).toBe(1);
  expect(camp.failed).toBe(1);
});

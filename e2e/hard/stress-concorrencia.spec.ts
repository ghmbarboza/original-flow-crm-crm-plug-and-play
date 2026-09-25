import { expect, test } from "@playwright/test";
import { abrirSandbox, ctx, garantirChavesVoz, esperar, hmacHex, invocar, Limpeza, MARCADOR, ok, postFunction, telefoneUnico, uid, type Ctx, type Sessao } from "./ctx";

/**
 * Estresse de CONCORRÊNCIA (HARD=1 STRESS=1): rajadas e eventos duplicados.
 * O que se prova: nada duplica, nada se perde, nada conta duas vezes.
 */
// Modo padrão (1 worker, ordem do arquivo): uma falha não pula os testes seguintes.
test.describe.configure({ mode: "default" });
test.skip(!process.env.HARD || !process.env.STRESS, "estresse: rode com HARD=1 STRESS=1");

let c: Ctx;
let sandbox: Sessao;
const limpeza = new Limpeza();
const marca = uid().slice(0, 6);
const instancia = `e2e-hard-stress-${marca}`;
let webhookToken = "";

function mensagemTexto(telefone: string, texto: string, nome: string) {
  return {
    event: "messages.upsert", instance: instancia,
    data: {
      key: { remoteJid: `${telefone}@s.whatsapp.net`, fromMe: false, id: `E2E${uid().slice(0, 16).toUpperCase()}` },
      pushName: nome, message: { conversation: texto }, messageType: "conversation", messageTimestamp: Math.floor(Date.now() / 1000),
    },
  };
}

async function limparTelefone(telefone: string) {
  const contatos = ok(await c.db.from("contacts").select("id").eq("whatsapp_phone", telefone), "contatos") ?? [];
  for (const ct of contatos) {
    ok(await c.db.from("activities").delete().eq("contact_id", ct.id), "atividades");
    ok(await c.db.from("lead_score_history").delete().eq("contact_id", ct.id), "score");
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
  sandbox = await abrirSandbox(c, limpeza, "stress concorrência");
  const r = await invocar(c, "evolution-connect", { server_url: sandbox.base, api_key: "chave-sandbox", instance_name: instancia, display_name: `${MARCADOR} Stress`, mode: "create" });
  expect(r.status, r.texto).toBe(200);
  limpeza.add("instância evolution", async () => ok(await c.db.from("evolution_configs").delete().eq("instance_name", instancia), "apagar instância"));
  webhookToken = ok(await c.db.from("evolution_configs").select("webhook_token").eq("instance_name", instancia).single(), "instância").webhook_token as string;
  const cfg = ok(await c.db.from("ai_messaging_config").select("id, is_active, working_hours").eq("org_id", c.orgId).single(), "config IA");
  limpeza.add("restaurar IA", async () => ok(await c.db.from("ai_messaging_config").update({ is_active: cfg.is_active, working_hours: cfg.working_hours }).eq("id", cfg.id), "restaurar"));
  ok(await c.db.from("ai_messaging_config").update({ is_active: true, working_hours: {} }).eq("id", cfg.id), "ligar IA");
});
test.afterAll(async () => { await limpeza.rodar(); });

test("50 mensagens do mesmo telefone em 2 s: um contato, uma conversa, 50 mensagens, IA agrupa", async () => {
  test.setTimeout(400_000);
  const telefone = telefoneUnico();
  limpeza.add(`telefone ${telefone}`, () => limparTelefone(telefone));
  const corpos = Array.from({ length: 50 }, (_, i) => mensagemTexto(telefone, `Mensagem ${i + 1} da rajada`, `${MARCADOR} Rajada`));
  const respostas = await Promise.all(corpos.map((corpo) => postFunction(c, `evolution-webhook?token=${webhookToken}`, corpo)));
  const codigos = respostas.map((r) => r.status);
  const falhas = respostas.filter((r) => r.status !== 200);
  if (falhas.length) console.log(`[stress] rajada: ${falhas.length} respostas != 200; exemplo: ${falhas[0].status} ${falhas[0].texto.slice(0, 300)}`);
  // A plataforma pode recusar (503) parte de uma rajada simultânea. O que não pode
  // é perder mensagem: o provedor reenvia o que não recebeu 200. Simula o reenvio.
  let pendentes = respostas.map((r, i) => ({ r, i })).filter((x) => x.r.status !== 200).map((x) => x.i);
  for (let tentativa = 0; tentativa < 5 && pendentes.length; tentativa++) {
    await new Promise((res) => setTimeout(res, 2_000));
    const novas = await Promise.all(pendentes.map((i) => postFunction(c, `evolution-webhook?token=${webhookToken}`, corpos[i])));
    pendentes = pendentes.filter((_, k) => novas[k].status !== 200);
  }
  expect(pendentes.length, "todas as mensagens aceitas depois do reenvio").toBe(0);

  await esperar("mensagens gravadas", async () => {
    const { count } = await c.db.from("conversation_messages").select("id", { count: "exact", head: true }).eq("is_from_ai", false).in("conversation_id", (ok(await c.db.from("conversations").select("id").eq("org_id", c.orgId).in("contact_id", (ok(await c.db.from("contacts").select("id").eq("whatsapp_phone", telefone), "c") ?? []).map((x) => x.id)), "conv") ?? []).map((x) => x.id));
    return (count ?? 0) >= 50 ? true : null;
  }, { timeout: 60_000, intervalo: 3_000 });

  const contatos = ok(await c.db.from("contacts").select("id").eq("whatsapp_phone", telefone), "contatos") ?? [];
  expect(contatos.length, "um único contato para o telefone").toBe(1);
  const conversas = ok(await c.db.from("conversations").select("id").eq("contact_id", contatos[0].id), "conversas") ?? [];
  expect(conversas.length, "uma única conversa").toBe(1);
  const { count: recebidas } = await c.db.from("conversation_messages").select("id", { count: "exact", head: true }).eq("conversation_id", conversas[0].id).eq("is_from_ai", false);
  expect(recebidas).toBe(50);

  await esperar("resposta da IA", async () => {
    const { count } = await c.db.from("conversation_messages").select("id", { count: "exact", head: true }).eq("conversation_id", conversas[0].id).eq("is_from_ai", true);
    return (count ?? 0) >= 1 ? true : null;
  }, { timeout: 180_000, intervalo: 5_000 });
  await new Promise((r) => setTimeout(r, 20_000));
  const { count: daIA } = await c.db.from("conversation_messages").select("id", { count: "exact", head: true }).eq("conversation_id", conversas[0].id).eq("is_from_ai", true);
  console.log(`[stress] rajada de 50: ${daIA} respostas da IA`);
  expect(daIA, "IA responde a rajada em poucas mensagens, não 50").toBeLessThanOrEqual(6);
});

test("20 envios simultâneos do formulário: 20 contatos; 5 iguais: 1 contato", async () => {
  test.setTimeout(300_000);
  const slug = `stress-${marca}`;
  const form = ok(await c.db.from("capture_forms").insert({
    org_id: c.orgId, name: `${MARCADOR} stress form ${marca}`, slug, is_active: true, source_default: "site", success_message: "Valeu!",
    fields: [{ key: "name", label: "Nome", type: "text", required: true }, { key: "email", label: "E-mail", type: "email", required: true }],
  }).select("id").single(), "form");
  limpeza.add("formulário", async () => {
    const contatos = ok(await c.db.from("contacts").select("id").eq("org_id", c.orgId).like("email", `stress-form-${marca}-%@exemplo.com.br`), "contatos") ?? [];
    for (const ct of contatos) {
      ok(await c.db.from("tracking_events").delete().eq("contact_id", ct.id), "tracking");
      ok(await c.db.from("activities").delete().eq("contact_id", ct.id), "atividades");
      ok(await c.db.from("deals").delete().eq("contact_id", ct.id), "negócios");
      ok(await c.db.from("contacts").delete().eq("id", ct.id), "contato");
    }
    ok(await c.db.from("capture_forms").delete().eq("id", form.id), "form");
  });
  const distintos = await Promise.all(Array.from({ length: 20 }, (_, i) => postFunction(c, "submit-capture-form", { action: "submit", slug, values: { name: `${MARCADOR} Form ${i}`, email: `stress-form-${marca}-${i}@exemplo.com.br` } })));
  expect(distintos.map((r) => r.status).every((s) => s === 200), distintos.map((r) => r.status).join(",")).toBe(true);
  const iguais = await Promise.all(Array.from({ length: 5 }, () => postFunction(c, "submit-capture-form", { action: "submit", slug, values: { name: `${MARCADOR} Form igual`, email: `stress-form-${marca}-igual@exemplo.com.br` } })));
  expect(iguais.map((r) => r.status).every((s) => s === 200), iguais.map((r) => r.status).join(",")).toBe(true);

  const { count: total } = await c.db.from("contacts").select("id", { count: "exact", head: true }).eq("org_id", c.orgId).like("email", `stress-form-${marca}-%@exemplo.com.br`);
  expect(total, "20 distintos + 1 repetido").toBe(21);
  const { count: repetido } = await c.db.from("contacts").select("id", { count: "exact", head: true }).eq("org_id", c.orgId).eq("email", `stress-form-${marca}-igual@exemplo.com.br`);
  expect(repetido, "5 envios iguais viram um contato").toBe(1);
});

test("três webhooks de fim de ligação idênticos ao mesmo tempo: uma finalização, uma atividade", async () => {
  test.setTimeout(300_000);
  const sandboxVoz = await abrirSandbox(c, limpeza, "stress voz dup");
  await garantirChavesVoz(c, limpeza);
  limpeza.add("agente de voz", async () => ok(await c.db.from("voice_agents").delete().eq("org_id", c.orgId), "apagar agente"));
  const numero = `+5548${Date.now().toString().slice(-8)}`;
  limpeza.add("número", async () => ok(await c.db.from("phone_numbers").delete().eq("org_id", c.orgId).eq("e164", numero), "apagar número"));
  expect((await invocar(c, "voice", { action: "agent_sync", api_base: sandboxVoz.base })).status).toBe(200);
  expect((await invocar(c, "voice", { action: "numbers_import", api_base: sandboxVoz.base, phone_number: numero })).status).toBe(200);
  const cap = ok(await c.db.from("integration_sandbox_captures").select("body").eq("session_id", sandboxVoz.id).like("path", "/elevenlabs/v1/convai/agents/create").order("created_at", { ascending: false }).limit(1).single(), "captura");
  const segredo = (cap.body as { platform_settings: { webhook: { secret: string } } }).platform_settings.webhook.secret;

  const telefone = telefoneUnico();
  limpeza.add(`telefone ${telefone}`, () => limparTelefone(telefone));
  const contato = ok(await c.db.from("contacts").insert({ org_id: c.orgId, first_name: `${MARCADOR} Dup`, last_name: marca, whatsapp_phone: telefone }).select("id").single(), "contato");
  const lig = await invocar(c, "voice", { action: "call_outbound", api_base: sandboxVoz.base, contact_id: contato.id });
  expect(lig.status, lig.texto).toBe(200);
  const convId = String(lig.json?.conversation_id);

  const corpo = JSON.stringify({ type: "post_call_transcription", data: { conversation_id: convId } });
  const t = Math.floor(Date.now() / 1000);
  const assinatura = `t=${t},v0=${hmacHex(segredo, `${t}.${corpo}`)}`;
  const tres = await Promise.all(Array.from({ length: 3 }, () => postFunction(c, `voice-webhook?org=${c.orgId}&tipo=fim`, corpo, { "elevenlabs-signature": assinatura })));
  expect(tres.map((r) => r.status)).toEqual([200, 200, 200]);

  await esperar("ligação concluída", async () => {
    const r = ok(await c.db.from("calls").select("status").eq("id", String(lig.json?.call_id)).single(), "call");
    return r.status === "completed" ? true : null;
  }, { timeout: 90_000, intervalo: 3_000 });
  await new Promise((r) => setTimeout(r, 10_000));
  const { count: atividades } = await c.db.from("activities").select("id", { count: "exact", head: true }).eq("contact_id", contato.id).eq("type", "call");
  expect(atividades, "uma atividade de ligação, não três").toBe(1);
  const memoria = ok(await c.db.from("contacts").select("client_memory").eq("id", contato.id).single(), "contato").client_memory as { interaction_summary?: { analyses?: number } } | null;
  expect(memoria?.interaction_summary?.analyses ?? 0, "memória fundida uma vez").toBeLessThanOrEqual(1);
});

test("a mesma importação disparada duas vezes ao mesmo tempo não duplica contatos", async () => {
  test.setTimeout(300_000);
  const imp = ok(await c.db.from("imports").insert({ org_id: c.orgId, kind: "contacts", source: "csv", file_name: `stress-dup-${marca}.csv`, created_by: c.userId }).select("id").single(), "import");
  limpeza.add("import dup", async () => {
    const contatos = ok(await c.db.from("contacts").select("id").eq("org_id", c.orgId).like("email", `stress-dup-${marca}-%@exemplo.com.br`), "contatos") ?? [];
    for (const ct of contatos) { ok(await c.db.from("activities").delete().eq("contact_id", ct.id), "a"); ok(await c.db.from("deals").delete().eq("contact_id", ct.id), "d"); ok(await c.db.from("contacts").delete().eq("id", ct.id), "c"); }
    ok(await c.db.from("import_rows").delete().eq("import_id", imp.id), "linhas"); ok(await c.db.from("imports").delete().eq("id", imp.id), "import");
  });
  const rows = Array.from({ length: 50 }, (_, i) => ({ row_number: i + 2, data: { name: `${MARCADOR} dup ${marca} ${i}`, email: `stress-dup-${marca}-${i}@exemplo.com.br` } }));
  const [a, b] = await Promise.all([invocar(c, "import-run", { import_id: imp.id, rows }), invocar(c, "import-run", { import_id: imp.id, rows })]);
  expect([a.status, b.status].every((s) => s === 200), `${a.texto.slice(0, 120)} | ${b.texto.slice(0, 120)}`).toBe(true);
  const { count } = await c.db.from("contacts").select("id", { count: "exact", head: true }).eq("org_id", c.orgId).like("email", `stress-dup-${marca}-%@exemplo.com.br`);
  console.log(`[stress] import duplo: A ${JSON.stringify(a.json)} B ${JSON.stringify(b.json)} → ${count} contatos`);
  expect(count, "50 e-mails distintos viram 50 contatos, não 100").toBe(50);
});

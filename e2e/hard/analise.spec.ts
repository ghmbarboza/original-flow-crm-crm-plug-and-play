import { expect, test } from "@playwright/test";
import { abrirSandbox, ctx, esperar, invocar, Limpeza, MARCADOR, ok, postFunction, telefoneUnico, uid, type Ctx, type Sessao } from "./ctx";

/**
 * Hard smoke da análise pós-conversa (Sprint 12 B12): o lead conta empresa,
 * cargo, orçamento e prazo em algumas mensagens; a IA responde e a análise
 * (a cada mensagem, para o teste) preenche contacts.client_memory, o BANT do
 * negócio aberto e pontua o lead. O que a equipe confirmou não é sobrescrito.
 */

test.describe.configure({ mode: "serial" });
test.skip(!process.env.HARD, "hard smoke: rode com npm run test:hard");

let c: Ctx;
let sandbox: Sessao;
const limpeza = new Limpeza();
const instancia = `e2e-hard-analise-${uid().slice(0, 8)}`;
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
    ok(await c.db.from("deals").delete().eq("contact_id", ct.id), "negócios");
    ok(await c.db.from("contacts").delete().eq("id", ct.id), "contato");
  }
}

test.beforeAll(async () => {
  c = await ctx();
  sandbox = await abrirSandbox(c, limpeza, "analise");
  const r = await invocar(c, "evolution-connect", {
    server_url: sandbox.base, api_key: "chave-sandbox", instance_name: instancia, display_name: `${MARCADOR} Análise`, mode: "create",
  });
  expect(r.status, r.texto).toBe(200);
  limpeza.add("instância evolution", async () => ok(await c.db.from("evolution_configs").delete().eq("instance_name", instancia), "apagar instância"));
  webhookToken = ok(await c.db.from("evolution_configs").select("webhook_token").eq("instance_name", instancia).single(), "instância").webhook_token as string;

  const original = ok(await c.db.from("ai_messaging_config").select("id, is_active, working_hours, analysis").eq("org_id", c.orgId).single(), "config da IA");
  limpeza.add("restaurar IA", async () => ok(await c.db.from("ai_messaging_config").update({ is_active: original.is_active, working_hours: original.working_hours, analysis: original.analysis }).eq("id", original.id), "restaurar"));
  ok(await c.db.from("ai_messaging_config").update({ is_active: true, working_hours: {}, analysis: { enabled: true, every_messages: 1, min_confidence: 70 } }).eq("id", original.id), "ligar análise a cada mensagem");
});

test.afterAll(async () => {
  await limpeza.rodar();
});

test("análise preenche a memória do lead, o BANT do negócio e pontua; campo confirmado pela equipe não muda", async () => {
  test.setTimeout(300_000);
  const telefone = telefoneUnico();
  limpeza.add(`telefone ${telefone}`, () => limparTelefone(telefone));
  const respostas = async (convId: string) => {
    const m = await c.db.from("conversation_messages").select("id").eq("conversation_id", convId).eq("is_from_ai", true);
    return m.data?.length ?? 0;
  };

  const envio1 = await postFunction(c, `evolution-webhook?token=${webhookToken}`, mensagemTexto(
    telefone, "Oi! Sou a Carla, diretora comercial da Padaria Solar. Estamos perdendo pedidos por WhatsApp e queria organizar isso.", `${MARCADOR} Carla`,
  ));
  expect(envio1.status, envio1.texto).toBe(200);
  const conv = ok(await c.db.from("conversations").select("id, contact_id, deal_id").eq("phone_number", telefone).single(), "conversa");
  expect(conv.deal_id).toBeTruthy();
  await esperar("1ª resposta", async () => ((await respostas(conv.id)) >= 1 ? true : null), { timeout: 150_000, intervalo: 3_000 });

  // A equipe confirma a empresa antes da próxima análise: a IA não pode sobrescrever.
  const memoria1 = await esperar("1ª análise", async () => {
    const r = await c.db.from("contacts").select("client_memory").eq("id", conv.contact_id!).single();
    const m = r.data?.client_memory as { interaction_summary?: { analyses?: number } } | null;
    return (m?.interaction_summary?.analyses ?? 0) >= 1 ? m : null;
  }, { timeout: 90_000, intervalo: 3_000 });
  const confirmada = { ...(memoria1 as Record<string, unknown>), lead_state: { ...((memoria1 as { lead_state?: Record<string, unknown> }).lead_state ?? {}), company: { value: "Padaria Solar Ltda", status: "confirmed", source: "equipe" } } };
  ok(await c.db.from("contacts").update({ client_memory: confirmada as never }).eq("id", conv.contact_id!), "confirmar empresa");

  const envio2 = await postFunction(c, `evolution-webhook?token=${webhookToken}`, mensagemTexto(
    telefone, "Temos orçamento de até R$ 1.500 por mês para isso e precisamos decidir até o fim do próximo mês, porque em dezembro a demanda dobra.", `${MARCADOR} Carla`,
  ));
  expect(envio2.status, envio2.texto).toBe(200);
  await esperar("2ª resposta", async () => ((await respostas(conv.id)) >= 2 ? true : null), { timeout: 150_000, intervalo: 3_000 });

  const memoria = await esperar("2ª análise", async () => {
    const r = await c.db.from("contacts").select("client_memory").eq("id", conv.contact_id!).single();
    const m = r.data?.client_memory as { interaction_summary?: { analyses?: number }; lead_state?: Record<string, { value: string | null; status: string }>; sales_intelligence?: { score?: number | null; summary?: string | null } } | null;
    return (m?.interaction_summary?.analyses ?? 0) >= 2 ? m : null;
  }, { timeout: 90_000, intervalo: 3_000 });

  expect(memoria.lead_state?.company, "confirmado pela equipe fica").toMatchObject({ value: "Padaria Solar Ltda", status: "confirmed" });
  expect(String(memoria.lead_state?.budget?.value ?? "")).toMatch(/1\.?500/);
  expect(memoria.lead_state?.budget?.status).toBe("inferred");
  expect(memoria.lead_state?.decision_timeline?.value, "prazo extraído").toBeTruthy();
  expect(memoria.lead_state?.role?.value ?? "").toMatch(/diretor/i);
  expect(memoria.sales_intelligence?.score).toBeGreaterThan(0);
  expect(memoria.sales_intelligence?.summary).toBeTruthy();

  const deal = ok(await c.db.from("deals").select("qualification").eq("id", conv.deal_id!).single(), "negócio");
  const q = deal.qualification as { budget?: string | null; timeline?: string | null };
  expect(q.budget ?? "", "BANT budget preenchido pela IA").toMatch(/1\.?500/);
  expect(q.timeline, "BANT timeline preenchido").toBeTruthy();
  expect(q.budget).toContain("(inferido pela IA)");
});

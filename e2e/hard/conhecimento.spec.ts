import { expect, test } from "@playwright/test";
import { abrirSandbox, ctx, esperar, invocar, Limpeza, MARCADOR, ok, postFunction, telefoneUnico, uid, type Ctx, type Sessao } from "./ctx";

/**
 * Hard smoke da base de conhecimento (Sprint 12 B10).
 *  1. Documento gravado pela RPC vira trechos; a busca híbrida acha com erro de
 *     digitação e sinônimo, e o fato canônico vem antes do trecho.
 *  2. Conversa real (Evolution na sandbox): o lead pergunta algo que só está no
 *     documento e a IA responde com o dado. Pergunta sem resposta vira pendência.
 */

test.describe.configure({ mode: "serial" });
test.skip(!process.env.HARD, "hard smoke: rode com npm run test:hard");

let c: Ctx;
let sandbox: Sessao;
const limpeza = new Limpeza();
const instancia = `e2e-hard-rag-${uid().slice(0, 8)}`;
let webhookToken = "";
const CODIGO = `ZX${uid().slice(0, 4).toUpperCase()}`;
const TITULO_DOC = `${MARCADOR} Manual de garantia ${CODIGO}`;

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
    ok(await c.db.from("unanswered_questions").delete().eq("contact_id", ct.id), "pendências");
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
  sandbox = await abrirSandbox(c, limpeza, "conhecimento");
  limpeza.add("documentos e fatos", async () => {
    ok(await c.db.from("knowledge_documents").delete().eq("org_id", c.orgId).like("title", `${MARCADOR}%`), "documentos");
    ok(await c.db.from("knowledge_facts").delete().eq("org_id", c.orgId).like("title", `${MARCADOR}%`), "fatos");
  });
});

test.afterAll(async () => {
  await limpeza.rodar();
});

test("documento vira trechos e a busca híbrida acha com erro de digitação; fato canônico vem primeiro", async () => {
  const conteudo = [
    `A garantia estendida ${CODIGO} cobre defeitos de fabricação por 37 meses a partir da entrega.`,
    "Para acionar a garantia, o cliente envia a nota fiscal e fotos do defeito pelo WhatsApp da loja.",
    "Trocas por arrependimento são aceitas em até 7 dias corridos, com o produto sem uso.",
  ].join("\n\n");
  const doc = ok(await c.db.rpc("gravar_documento_conhecimento", {
    p_document_id: null, p_title: TITULO_DOC, p_content: conteudo, p_doc_type: "texto", p_source_url: null, p_file_name: null,
    p_fingerprint: `e2e-${CODIGO}`, p_status: "approved", p_ingestion_report: {}, p_error_message: null, p_chunks: [conteudo],
  }), "gravar documento") as { id: string; chunk_count: number; status: string };
  expect(doc.chunk_count).toBe(1);
  expect(doc.status).toBe("approved");

  // Idempotente por fingerprint: mandar de novo devolve o mesmo documento.
  const deNovo = ok(await c.db.rpc("gravar_documento_conhecimento", {
    p_document_id: null, p_title: TITULO_DOC, p_content: conteudo, p_doc_type: "texto", p_source_url: null, p_file_name: null,
    p_fingerprint: `e2e-${CODIGO}`, p_status: "approved", p_ingestion_report: {}, p_error_message: null, p_chunks: [conteudo],
  }), "gravar de novo") as { id: string };
  expect(deNovo.id).toBe(doc.id);

  // Erro de digitação ("garantía extendida") e sinônimo ("devolução") ainda acham o trecho.
  const comErro = ok(await c.db.rpc("buscar_conhecimento", { p_org: c.orgId, p_consulta: "garantía extendida quantos meses", p_limite: 6 }), "busca") as { source_type: string; title: string; content: string }[];
  expect(comErro.some((r) => r.source_type === "chunk" && r.title === TITULO_DOC), JSON.stringify(comErro)).toBe(true);
  const arrependimento = ok(await c.db.rpc("buscar_conhecimento", { p_org: c.orgId, p_consulta: "posso devolver por arrependimento?", p_limite: 6 }), "busca 2") as { title: string }[];
  expect(arrependimento.some((r) => r.title === TITULO_DOC)).toBe(true);

  // Fato canônico sobre o mesmo tema fica na frente do trecho.
  ok(await c.db.from("knowledge_facts").insert({
    org_id: c.orgId, title: `${MARCADOR} Garantia ${CODIGO}`, category: "políticas", question: `Quantos meses tem a garantia ${CODIGO}?`,
    fact: `A garantia ${CODIGO} é de 37 meses.`, status: "confirmed", always_include: false,
  }), "fato");
  const ordenado = ok(await c.db.rpc("buscar_conhecimento", { p_org: c.orgId, p_consulta: `garantia ${CODIGO} meses`, p_limite: 6 }), "busca 3") as { source_type: string }[];
  expect(ordenado[0]?.source_type).toBe("fact");

  // Outra organização não enxerga: chamada com org diferente é recusada para usuário logado.
  const { error } = await c.db.rpc("buscar_conhecimento", { p_org: "00000000-0000-0000-0000-000000000001", p_consulta: "garantia", p_limite: 6 });
  expect(error?.message ?? "").toMatch(/permissão/);
});

test("na conversa, a IA responde com o que só está no documento e registra o que não sabe", async () => {
  test.setTimeout(240_000);
  const r = await invocar(c, "evolution-connect", {
    server_url: sandbox.base, api_key: "chave-sandbox", instance_name: instancia, display_name: `${MARCADOR} RAG`, mode: "create",
  });
  expect(r.status, r.texto).toBe(200);
  limpeza.add("instância evolution", async () => ok(await c.db.from("evolution_configs").delete().eq("instance_name", instancia), "apagar instância"));
  webhookToken = ok(await c.db.from("evolution_configs").select("webhook_token").eq("instance_name", instancia).single(), "instância").webhook_token as string;

  const original = ok(await c.db.from("ai_messaging_config").select("id, is_active, working_hours").eq("org_id", c.orgId).single(), "config da IA");
  limpeza.add("restaurar IA", async () => ok(await c.db.from("ai_messaging_config").update({ is_active: original.is_active, working_hours: original.working_hours }).eq("id", original.id), "restaurar"));
  ok(await c.db.from("ai_messaging_config").update({ is_active: true, working_hours: {} }).eq("id", original.id), "ligar IA");

  const telefone = telefoneUnico();
  limpeza.add(`telefone ${telefone}`, () => limparTelefone(telefone));
  const envio = await postFunction(c, `evolution-webhook?token=${webhookToken}`, mensagemTexto(
    telefone, `Oi! Quantos meses de cobertura tem a garantia estendida ${CODIGO}?`, `${MARCADOR} RAG`,
  ));
  expect(envio.status, envio.texto).toBe(200);

  const conv = ok(await c.db.from("conversations").select("id, contact_id").eq("phone_number", telefone).single(), "conversa");
  const resposta = await esperar("resposta da IA", async () => {
    const m = await c.db.from("conversation_messages").select("content").eq("conversation_id", conv.id).eq("is_from_ai", true).order("created_at", { ascending: false }).limit(1);
    return m.data?.[0]?.content ?? null;
  }, { timeout: 150_000, intervalo: 3_000 });
  expect(resposta, "a IA precisa citar os 37 meses do documento").toMatch(/37/);

  // Pergunta que não está em lugar nenhum: a IA não inventa e registra a pendência.
  const envio2 = await postFunction(c, `evolution-webhook?token=${webhookToken}`, mensagemTexto(
    telefone, `E vocês têm loja física em Balneário Camboriú? Qual o endereço e o horário aos domingos?`, `${MARCADOR} RAG`,
  ));
  expect(envio2.status, envio2.texto).toBe(200);
  await esperar("pendência registrada", async () => {
    const p = await c.db.from("unanswered_questions").select("id, question").eq("org_id", c.orgId).eq("conversation_id", conv.id);
    return p.data?.length ? p.data[0] : null;
  }, { timeout: 150_000, intervalo: 3_000 });
});

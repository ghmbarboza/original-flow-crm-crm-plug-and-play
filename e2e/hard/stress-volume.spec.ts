import { expect, test } from "@playwright/test";
import { abrirSandbox, ctx, garantirChavesVoz, invocar, Limpeza, MARCADOR, ok, rodarDispatcher, uid, type Ctx, type Sessao } from "./ctx";

/**
 * Estresse de VOLUME (roda só com HARD=1 STRESS=1): mede o que a plataforma
 * aguenta em produção com marcador E2E e limpeza no fim. Cada teste registra os
 * tempos no console para o relatório.
 */
// Modo padrão (1 worker, ordem do arquivo): uma falha não pula os testes seguintes.
test.describe.configure({ mode: "default" });
test.skip(!process.env.HARD || !process.env.STRESS, "estresse: rode com HARD=1 STRESS=1");

let c: Ctx;
const limpeza = new Limpeza();
const marca = uid().slice(0, 6);
const cronometro = (rotulo: string) => { const t = Date.now(); return () => { const ms = Date.now() - t; console.log(`[stress] ${rotulo}: ${ms} ms`); return ms; }; };

async function limparContatosStress() {
  for (let i = 0; i < 20; i++) {
    const lote = ok(await c.db.from("contacts").select("id").eq("org_id", c.orgId).like("email", `stress-${marca}-%@exemplo.com.br`).limit(500), "contatos") ?? [];
    if (!lote.length) break;
    const ids = lote.map((x) => x.id);
    ok(await c.db.from("calls").delete().in("contact_id", ids), "ligações");
    ok(await c.db.from("activities").delete().in("contact_id", ids), "atividades");
    ok(await c.db.from("deals").delete().in("contact_id", ids), "negócios");
    ok(await c.db.from("contacts").delete().in("id", ids), "contatos");
  }
}

test.beforeAll(async () => {
  c = await ctx();
  limpeza.add("contatos do estresse", limparContatosStress);
});
test.afterAll(async () => { await limpeza.rodar(); });

test("importa 2.000 contatos em lotes e reimporta sem duplicar", async () => {
  test.setTimeout(900_000);
  const TOTAL = 2000, LOTE = 50; // mesmo lote da tela (useImportacao)
  const imp = ok(await c.db.from("imports").insert({ org_id: c.orgId, kind: "contacts", source: "csv", file_name: `stress-${marca}.csv`, created_by: c.userId }).select("id").single(), "import");
  limpeza.add("import", async () => { ok(await c.db.from("import_rows").delete().eq("import_id", imp.id), "linhas"); ok(await c.db.from("imports").delete().eq("id", imp.id), "import"); });
  const linha = (n: number) => ({ row_number: n + 2, data: { name: `${MARCADOR} stress ${marca} ${n}`, email: `stress-${marca}-${n}@exemplo.com.br`, phone: `(48) 9${String(10000000 + n).slice(-8)}`, tags: `stress-${marca}` } });
  const inicioImport = new Date().toISOString();
  const fim = cronometro(`import ${TOTAL} contatos`);
  let criados = 0, erros = 0;
  for (let i = 0; i < TOTAL; i += LOTE) {
    const r = await invocar(c, "import-run", { import_id: imp.id, rows: Array.from({ length: LOTE }, (_, k) => linha(i + k)) });
    expect(r.status, `lote ${i}: ${r.texto.slice(0, 200)}`).toBe(200);
    criados += Number(r.json?.created ?? 0); erros += Number(r.json?.error ?? 0);
  }
  const ms = fim();
  expect(criados).toBe(TOTAL);
  expect(erros).toBe(0);
  const { count } = await c.db.from("contacts").select("id", { count: "exact", head: true }).eq("org_id", c.orgId).like("email", `stress-${marca}-%@exemplo.com.br`);
  expect(count).toBe(TOTAL);
  expect(ms, "2.000 contatos em menos de 5 min").toBeLessThan(300_000);
  // Importar não avisa "novo lead" um a um (estresse de 25/09 gerou 2.459 avisos).
  const { count: avisos } = await c.db.from("notifications").select("id", { count: "exact", head: true }).eq("org_id", c.orgId).eq("type", "novo_lead").gte("created_at", inicioImport);
  expect(avisos ?? 0, "nenhum aviso de novo lead por contato importado").toBe(0);

  // Reimporta os 200 primeiros: atualiza, não duplica.
  const r2 = await invocar(c, "import-run", { import_id: imp.id, rows: Array.from({ length: LOTE }, (_, k) => ({ ...linha(k), data: { ...linha(k).data, title: "Reimportado" } })) });
  expect(r2.status, r2.texto).toBe(200);
  expect(r2.json).toMatchObject({ created: 0, updated: LOTE });
  const { count: depois } = await c.db.from("contacts").select("id", { count: "exact", head: true }).eq("org_id", c.orgId).like("email", `stress-${marca}-%@exemplo.com.br`);
  expect(depois).toBe(TOTAL);
});

test("500 negócios abertos: consulta do kanban e da lista continuam rápidas", async () => {
  test.setTimeout(300_000);
  const contatos = ok(await c.db.from("contacts").select("id").eq("org_id", c.orgId).like("email", `stress-${marca}-%@exemplo.com.br`).limit(500), "contatos") ?? [];
  expect(contatos.length).toBe(500);
  const etapa = ok(await c.db.from("pipeline_stages").select("id").eq("org_id", c.orgId).order("order").limit(1).maybeSingle(), "etapa");
  expect(etapa, "org sem etapa de funil").toBeTruthy();
  const fim = cronometro("insert 500 negócios");
  for (let i = 0; i < 500; i += 100) {
    ok(await c.db.from("deals").insert(contatos.slice(i, i + 100).map((ct, k) => ({ org_id: c.orgId, contact_id: ct.id, title: `${MARCADOR} stress negócio ${marca} ${i + k}`, value: 1000 + i + k, status: "open", stage_id: etapa!.id }))), `lote ${i}`);
  }
  fim();
  const t1 = cronometro("consulta kanban (negócios abertos com contato e etapa)");
  const { data, error } = await c.db.from("deals").select("id, title, value, stage_id, contacts(first_name, last_name)").eq("org_id", c.orgId).eq("status", "open").order("created_at", { ascending: false }).limit(1000);
  const ms = t1();
  expect(error).toBeNull();
  expect((data ?? []).length).toBeGreaterThanOrEqual(500);
  expect(ms, "kanban em menos de 3 s").toBeLessThan(3_000);
});

test("300 documentos na base de conhecimento: busca continua abaixo de 1,5 s", async () => {
  test.setTimeout(900_000);
  const TOTAL = 300;
  limpeza.add("documentos", async () => ok(await c.db.from("knowledge_documents").delete().eq("org_id", c.orgId).like("title", `${MARCADOR} stress doc ${marca}%`), "apagar docs"));
  const fim = cronometro(`gravar ${TOTAL} documentos`);
  for (let i = 0; i < TOTAL; i++) {
    const chunks = [
      `O plano Estrela ${i} custa R$ ${100 + i} por mês e inclui ${i % 7 + 1} usuários.`,
      `A garantia do produto ${i} é de ${12 + (i % 24)} meses e cobre defeitos de fabricação.`,
      `Entregas para a região ${i % 27} levam ${1 + (i % 9)} dias úteis após a confirmação do pagamento.`,
    ];
    ok(await c.db.rpc("gravar_documento_conhecimento", {
      p_document_id: null, p_title: `${MARCADOR} stress doc ${marca} ${i}`, p_content: chunks.join("\n\n"), p_doc_type: "texto", p_source_url: null, p_file_name: null,
      p_fingerprint: `stress-${marca}-${i}`, p_status: "approved", p_ingestion_report: {}, p_error_message: null, p_chunks: chunks,
    }), `doc ${i}`);
  }
  fim();
  const tempos: number[] = [];
  for (let q = 0; q < 30; q++) {
    const n = (q * 37) % TOTAL;
    const t = Date.now();
    const r = ok(await c.db.rpc("buscar_conhecimento", { p_org: c.orgId, p_consulta: `quanto custa o plano Estrela ${n}`, p_limite: 6 }), "busca") as { content: string }[];
    tempos.push(Date.now() - t);
    expect(r.length).toBeGreaterThan(0);
    expect(r.some((x) => x.content.includes(`Estrela ${n} `)), `busca ${n} acha o documento certo`).toBe(true);
  }
  tempos.sort((a, b) => a - b);
  const p50 = tempos[15], p95 = tempos[28];
  console.log(`[stress] busca RAG com ${TOTAL} docs: p50 ${p50} ms, p95 ${p95} ms`);
  expect(p95).toBeLessThan(1_500);
});

test("API pública: 300 chamadas, escopo errado e limite por minuto", async () => {
  test.setTimeout(600_000);
  const k = ok(await c.db.rpc("criar_chave_api", { p_name: `${MARCADOR} stress ${marca}`, p_scopes: ["contacts:read", "contacts:write"], p_rate_limit: 1000 }), "chave") as { id: string; key: string };
  const kEscopo = ok(await c.db.rpc("criar_chave_api", { p_name: `${MARCADOR} stress escopo ${marca}`, p_scopes: ["pipelines:read"], p_rate_limit: 1000 }), "chave escopo") as { id: string; key: string };
  const kLimite = ok(await c.db.rpc("criar_chave_api", { p_name: `${MARCADOR} stress limite ${marca}`, p_scopes: ["contacts:read"], p_rate_limit: 10 }), "chave limite") as { id: string; key: string };
  limpeza.add("chaves api", async () => ok(await c.db.from("api_keys").delete().in("id", [k.id, kEscopo.id, kLimite.id]), "apagar chaves"));
  const api = async (metodo: string, caminho: string, token: string, corpo?: object) => {
    const resp = await fetch(`${c.functions}/api${caminho}`, { method: metodo, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, ...(corpo ? { body: JSON.stringify(corpo) } : {}) });
    return { status: resp.status, texto: await resp.text() };
  };
  const fim = cronometro("300 GET /contacts (10 em paralelo)");
  const status: number[] = [];
  for (let i = 0; i < 300; i += 10) {
    const lote = await Promise.all(Array.from({ length: 10 }, () => api("GET", "/contacts?limit=20", k.key)));
    status.push(...lote.map((x) => x.status));
  }
  const ms = fim();
  expect(status.filter((s) => s === 200).length, `códigos: ${[...new Set(status)].join(",")}`).toBe(300);
  expect(ms / 300, "média por chamada abaixo de 800 ms").toBeLessThan(800);

  const errado = await api("GET", "/contacts", kEscopo.key);
  expect(errado.status, errado.texto).toBe(403);
  const invalida = await api("GET", "/contacts", "chave-inexistente");
  expect(invalida.status).toBe(401);

  const codigos: number[] = [];
  for (let i = 0; i < 15; i++) codigos.push((await api("GET", "/contacts?limit=1", kLimite.key)).status);
  expect(codigos, `limite de 10/min: ${codigos.join(",")}`).toContain(429);
  expect(codigos.slice(0, 10).every((s) => s === 200)).toBe(true);
});

test("campanha de ligação com 150 contatos respeita o limite de simultâneas", async () => {
  test.setTimeout(600_000);
  const sandbox: Sessao = await abrirSandbox(c, limpeza, "stress voz");
  await garantirChavesVoz(c, limpeza);
  limpeza.add("agente de voz", async () => ok(await c.db.from("voice_agents").delete().eq("org_id", c.orgId), "apagar agente"));
  const numero = `+5548${Date.now().toString().slice(-8)}`;
  limpeza.add("número", async () => ok(await c.db.from("phone_numbers").delete().eq("org_id", c.orgId).eq("e164", numero), "apagar número"));
  const s = await invocar(c, "voice", { action: "agent_sync", api_base: sandbox.base });
  expect(s.status, s.texto).toBe(200);
  const n = await invocar(c, "voice", { action: "numbers_import", api_base: sandbox.base, phone_number: numero });
  expect(n.status, n.texto).toBe(200);

  const contatos = ok(await c.db.from("contacts").select("id").eq("org_id", c.orgId).like("email", `stress-${marca}-%@exemplo.com.br`).limit(150), "contatos") ?? [];
  expect(contatos.length).toBe(150);
  const campanha = ok(await c.db.from("voice_campaigns").insert({ org_id: c.orgId, name: `${MARCADOR} stress campanha ${marca}`, instruction: "convidar", status: "running", total: 150, max_concurrent: 10, created_by: c.userId }).select("id").single(), "campanha");
  limpeza.add("campanha", async () => ok(await c.db.from("voice_campaigns").delete().eq("id", campanha.id), "apagar campanha"));
  ok(await c.db.from("voice_campaign_contacts").insert(contatos.map((ct) => ({ campaign_id: campanha.id, org_id: c.orgId, contact_id: ct.id }))), "fila");

  for (let i = 0; i < 3; i++) await rodarDispatcher(c, "voice-campaign-dispatcher");
  await new Promise((r) => setTimeout(r, 8_000));
  const { count: vivas } = await c.db.from("calls").select("id", { count: "exact", head: true }).eq("campaign_id", campanha.id).in("status", ["queued", "ringing", "in_progress"]);
  const camp = ok(await c.db.from("voice_campaigns").select("placed, failed, status").eq("id", campanha.id).single(), "campanha");
  console.log(`[stress] campanha: vivas ${vivas}, placed ${camp.placed}, failed ${camp.failed}`);
  expect(vivas, "nunca mais que max_concurrent em andamento").toBeLessThanOrEqual(10);
  expect(camp.placed).toBeLessThanOrEqual(10);
  expect(camp.placed).toBeGreaterThan(0);
  ok(await c.db.from("voice_campaigns").update({ status: "canceled" }).eq("id", campanha.id), "cancelar");
});

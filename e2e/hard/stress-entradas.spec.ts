import { expect, test } from "@playwright/test";
import { ctx, invocar, Limpeza, MARCADOR, ok, uid, type Ctx } from "./ctx";

/**
 * Estresse de ENTRADAS (HARD=1 STRESS=1): dados que um usuário real digita
 * errado ou de propósito. O que se prova: erro claro, nada gravado pela metade,
 * nada quebra a tela nem a busca.
 */
// Modo padrão (1 worker, ordem do arquivo): uma falha não pula os testes seguintes.
test.describe.configure({ mode: "default" });
test.skip(!process.env.HARD || !process.env.STRESS, "estresse: rode com HARD=1 STRESS=1");

let c: Ctx;
const limpeza = new Limpeza();
const marca = uid().slice(0, 6);

test.beforeAll(async () => { c = await ctx(); });
test.afterAll(async () => { await limpeza.rodar(); });

test("ligar para contato sem telefone ou com telefone inválido: 400 com motivo", async () => {
  const semFone = ok(await c.db.from("contacts").insert({ org_id: c.orgId, first_name: `${MARCADOR} SemFone`, last_name: marca }).select("id").single(), "contato");
  const foneRuim = ok(await c.db.from("contacts").insert({ org_id: c.orgId, first_name: `${MARCADOR} FoneRuim`, last_name: marca, whatsapp_phone: "abc123" }).select("id").single(), "contato");
  limpeza.add("contatos", async () => ok(await c.db.from("contacts").delete().in("id", [semFone.id, foneRuim.id]), "apagar"));
  for (const id of [semFone.id, foneRuim.id]) {
    const r = await invocar(c, "voice", { action: "call_outbound", contact_id: id });
    expect(r.status, r.texto).toBe(400);
    expect(String(r.json?.error)).toMatch(/telefone|credenciais|número/i);
  }
  const inexistente = await invocar(c, "voice", { action: "call_outbound", contact_id: "00000000-0000-0000-0000-000000000000" });
  expect(inexistente.status).toBe(404);
});

test("importação com 300 linhas de lixo: cada linha ganha um motivo, nada quebra", async () => {
  test.setTimeout(300_000);
  const imp = ok(await c.db.from("imports").insert({ org_id: c.orgId, kind: "contacts", source: "csv", file_name: `lixo-${marca}.csv`, created_by: c.userId }).select("id").single(), "import");
  limpeza.add("import lixo", async () => {
    const contatos = ok(await c.db.from("contacts").select("id").eq("org_id", c.orgId).like("first_name", `${MARCADOR} lixo ${marca}%`), "contatos") ?? [];
    for (const ct of contatos) { ok(await c.db.from("activities").delete().eq("contact_id", ct.id), "a"); ok(await c.db.from("deals").delete().eq("contact_id", ct.id), "d"); ok(await c.db.from("contacts").delete().eq("id", ct.id), "c"); }
    ok(await c.db.from("import_rows").delete().eq("import_id", imp.id), "linhas"); ok(await c.db.from("imports").delete().eq("id", imp.id), "import");
  });
  const lixo = (i: number) => {
    const tipos = [
      {},
      { email: "sem-arroba" },
      { name: "", email: "" },
      { email: `lixo-${marca}-${i}@exemplo.com.br`, name: "🔥🔥🔥 <script>alert(1)</script>", phone: "não é telefone" },
      { name: `${MARCADOR} lixo ${marca} ${i}`, email: `LIXO-${marca}-${i}@EXEMPLO.COM.BR`, phone: "+++" },
      { name: "x".repeat(5000), email: `lixo-${marca}-longo-${i}@exemplo.com.br` },
    ];
    return { row_number: i + 2, data: tipos[i % tipos.length] };
  };
  const r = await invocar(c, "import-run", { import_id: imp.id, rows: Array.from({ length: 300 }, (_, i) => lixo(i)) });
  expect(r.status, r.texto.slice(0, 200)).toBe(200);
  const linhas = ok(await c.db.from("import_rows").select("status, error").eq("import_id", imp.id), "linhas") ?? [];
  const comErro = linhas.filter((l) => l.status === "error");
  console.log(`[stress] lixo: ${JSON.stringify(r.json)}; ${comErro.length} linhas com erro`);
  expect(comErro.every((l) => !!l.error), "toda linha com erro tem motivo").toBe(true);
  expect(comErro.length).toBeGreaterThanOrEqual(150);
  // Nome com HTML e emoji entra como texto (a tela escapa), nunca como tag executável.
  const html = ok(await c.db.from("contacts").select("first_name").eq("org_id", c.orgId).eq("email", `lixo-${marca}-3@exemplo.com.br`).maybeSingle(), "html");
  if (html) expect(html.first_name).toContain("🔥");
  limpeza.add("contatos lixo por e-mail", async () => {
    const cts = ok(await c.db.from("contacts").select("id").eq("org_id", c.orgId).like("email", `lixo-${marca}-%@exemplo.com.br`), "cts") ?? [];
    for (const ct of cts) { ok(await c.db.from("activities").delete().eq("contact_id", ct.id), "a"); ok(await c.db.from("deals").delete().eq("contact_id", ct.id), "d"); ok(await c.db.from("contacts").delete().eq("id", ct.id), "c"); }
  });
});

test("fato canônico de 50 mil caracteres e documento vazio: a base continua respondendo", async () => {
  test.setTimeout(180_000);
  const gigante = "Política de preços. ".repeat(2500);
  const { data: fato, error } = await c.db.from("knowledge_facts").insert({ org_id: c.orgId, title: `${MARCADOR} fato gigante ${marca}`, question: "Qual é a política de preços?", fact: gigante, always_include: true }).select("id").single();
  console.log(`[stress] fato de ${gigante.length} chars: ${error ? `recusado (${error.message.slice(0, 80)})` : "aceito"}`);
  if (fato) limpeza.add("fato gigante", async () => ok(await c.db.from("knowledge_facts").delete().eq("id", fato.id), "apagar fato"));

  const { data: vazio, error: erroVazio } = await c.db.rpc("gravar_documento_conhecimento", {
    p_document_id: null, p_title: `${MARCADOR} doc vazio ${marca}`, p_content: "", p_doc_type: "texto", p_source_url: null, p_file_name: null,
    p_fingerprint: `vazio-${marca}`, p_status: "approved", p_ingestion_report: {}, p_error_message: null, p_chunks: [],
  });
  console.log(`[stress] doc vazio: ${erroVazio ? `recusado (${erroVazio.message.slice(0, 80)})` : `aceito ${JSON.stringify(vazio)}`}`);
  limpeza.add("doc vazio", async () => ok(await c.db.from("knowledge_documents").delete().eq("org_id", c.orgId).like("title", `${MARCADOR} doc vazio ${marca}%`), "apagar doc"));

  const busca = await c.db.rpc("buscar_conhecimento", { p_org: c.orgId, p_consulta: "política de preços", p_limite: 6 });
  expect(busca.error, "busca segue funcionando").toBeNull();
  const injecao = await c.db.rpc("buscar_conhecimento", { p_org: c.orgId, p_consulta: "'); DROP TABLE contacts; -- & | ! ( ) : * <>", p_limite: 6 });
  expect(injecao.error, "consulta com caracteres especiais não derruba a busca").toBeNull();
});

test("agenda: reunião com fim antes do início e duas no mesmo horário do mesmo dono são recusadas", async () => {
  const inicio = new Date(Date.now() + 48 * 3600_000); inicio.setMinutes(0, 0, 0);
  const fim = new Date(inicio.getTime() + 30 * 60_000);
  const invertida = await c.db.from("appointments").insert({ org_id: c.orgId, title: `${MARCADOR} invertida ${marca}`, starts_at: fim.toISOString(), ends_at: inicio.toISOString(), owner_id: c.userId, created_by: c.userId });
  expect(invertida.error, "fim antes do início é recusado pelo banco").toBeTruthy();
  const { data: a, error: e1 } = await c.db.from("appointments").insert({ org_id: c.orgId, title: `${MARCADOR} choque A ${marca}`, starts_at: inicio.toISOString(), ends_at: fim.toISOString(), owner_id: c.userId, created_by: c.userId }).select("id").single();
  expect(e1).toBeNull();
  if (a) limpeza.add("reunião", async () => ok(await c.db.from("appointments").delete().eq("id", a.id), "apagar"));
  const b = await c.db.from("appointments").insert({ org_id: c.orgId, title: `${MARCADOR} choque B ${marca}`, starts_at: new Date(inicio.getTime() + 10 * 60_000).toISOString(), ends_at: new Date(fim.getTime() + 10 * 60_000).toISOString(), owner_id: c.userId, created_by: c.userId });
  expect(b.error, "sobreposição do mesmo dono é recusada").toBeTruthy();
  const semDono = await c.db.from("appointments").insert({ org_id: c.orgId, title: `${MARCADOR} inválida ${marca}`, starts_at: "2026-02-30T10:00:00Z", ends_at: "2026-02-30T11:00:00Z", owner_id: c.userId, created_by: c.userId });
  expect(semDono.error, "data impossível é recusada").toBeTruthy();
});

test("nomes com emoji, HTML e 10 mil caracteres: gravados como texto, sem quebrar a listagem", async () => {
  const nomes = ["🔥 Cliente <b>VIP</b>", "'; DROP TABLE contacts; --", "Nome\ncom\nquebras", "x".repeat(10_000)];
  const ids: string[] = [];
  for (const nome of nomes) {
    const { data, error } = await c.db.from("contacts").insert({ org_id: c.orgId, first_name: `${MARCADOR} ${nome}`.slice(0, 10_000), last_name: marca, email: `entrada-${marca}-${ids.length}@exemplo.com.br` }).select("id, first_name").single();
    console.log(`[stress] nome ${JSON.stringify(nome.slice(0, 30))}: ${error ? `recusado (${error.message.slice(0, 60)})` : "aceito"}`);
    if (data) ids.push(data.id);
  }
  limpeza.add("contatos de entrada", async () => ok(await c.db.from("contacts").delete().in("id", ids), "apagar"));
  const lista = ok(await c.db.from("contacts").select("id, first_name").eq("org_id", c.orgId).eq("last_name", marca).order("created_at"), "lista") ?? [];
  expect(lista.length).toBe(ids.length);
  expect(lista.some((x) => x.first_name.includes("DROP TABLE")), "SQL vira texto, não comando").toBe(true);
  const { count } = await c.db.from("contacts").select("id", { count: "exact", head: true }).eq("org_id", c.orgId);
  expect(count ?? 0, "tabela continua existindo").toBeGreaterThan(0);
});

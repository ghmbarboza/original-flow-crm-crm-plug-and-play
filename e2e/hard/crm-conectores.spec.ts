import { expect, test } from "@playwright/test";
import { abrirSandbox, ctx, invocar, Limpeza, ok, type Ctx, type Sessao } from "./ctx";

/**
 * Hard smoke dos conectores de CRM (Sprint 12 B9). A integration-sandbox
 * imita HubSpot, Pipedrive, RD Station, Agendor, Kommo e Salesforce em
 * /crm/<provedor>/...; a function crm-connect lê a estrutura, guarda o token
 * no Vault e sincroniza empresas, contatos e negócios pelo mesmo núcleo do
 * CSV. O Salesforce passa pelo OAuth completo (oauth_start → callback).
 */

test.describe.configure({ mode: "serial" });
test.skip(!process.env.HARD, "hard smoke: rode com npm run test:hard");

const TOKEN_PROVEDORES = ["hubspot", "pipedrive", "rdstation", "agendor", "kommo"] as const;
const EMAIL_ANA = "e2e.ana.conector@exemplo.com.br";
const TITULO_PROPOSTA = "E2E Proposta conector";
const TITULO_FECHADO = "E2E Fechado conector";

let c: Ctx;
let sandbox: Sessao;
let etapaProposta = "";
const limpeza = new Limpeza();

test.beforeAll(async () => {
  c = await ctx();
  sandbox = await abrirSandbox(c, limpeza, "crm conectores");
  const etapas = ok(await c.db.from("pipeline_stages").select("id, name").eq("org_id", c.orgId).order("order"), "etapas");
  etapaProposta = etapas[1].id;
  limpeza.add("conexões", async () => ok(await c.db.from("crm_connections").delete().eq("org_id", c.orgId), "apagar conexões"));
  limpeza.add("registros sincronizados", async () => {
    ok(await c.db.from("deals").delete().eq("org_id", c.orgId).in("title", [TITULO_PROPOSTA, TITULO_FECHADO]), "negócios");
    ok(await c.db.from("contacts").delete().eq("org_id", c.orgId).in("email", [EMAIL_ANA, "e2e.bruno.conector@exemplo.com.br"]), "contatos");
    ok(await c.db.from("companies").delete().eq("org_id", c.orgId).eq("name", "E2E Conector Ltda"), "empresa");
    ok(await c.db.from("imports").delete().eq("org_id", c.orgId).in("source", [...TOKEN_PROVEDORES, "salesforce"]), "importações");
  });
});

test.afterAll(async () => {
  await limpeza.rodar();
});

async function sincronizarTudo(connectionId: string) {
  const totais: Record<string, { created: number; updated: number; error: number }> = {};
  for (const kind of ["companies", "contacts", "deals"] as const) {
    const r = await invocar(c, "crm-connect", { action: "sync", connection_id: connectionId, kind, stage_map: { "Proposta enviada": etapaProposta } });
    expect(r.status, `${kind}: ${r.texto}`).toBe(200);
    expect(r.json?.done).toBe(true);
    totais[kind] = { created: Number(r.json?.created), updated: Number(r.json?.updated), error: Number(r.json?.error) };
  }
  return totais;
}

async function conferirRegistros(provider: string) {
  const empresa = ok(await c.db.from("companies").select("id, industry").eq("org_id", c.orgId).eq("name", "E2E Conector Ltda").single(), "empresa");
  const ana = ok(await c.db.from("contacts").select("id, first_name, last_name, title, company_id, owner_id, custom_fields").eq("org_id", c.orgId).eq("email", EMAIL_ANA).single(), "Ana");
  expect(`${ana.first_name} ${ana.last_name}`).toBe("E2E Ana Conector");
  expect(ana.title).toBe("Diretora");
  expect(ana.company_id).toBe(empresa.id);
  expect(ana.owner_id, "dono pelo e-mail do usuário").toBe(c.userId);
  const proposta = ok(await c.db.from("deals").select("id, value, status, stage_id, contact_id, company_id").eq("org_id", c.orgId).eq("title", TITULO_PROPOSTA).single(), `proposta ${provider}`);
  expect(Number(proposta.value)).toBe(4900);
  expect(proposta.status).toBe("open");
  expect(proposta.stage_id, "etapa pelo de/para").toBe(etapaProposta);
  expect(proposta.contact_id, "contato vinculado").toBe(ana.id);
  expect(proposta.company_id, "empresa vinculada").toBe(empresa.id);
  const fechado = ok(await c.db.from("deals").select("status, probability").eq("org_id", c.orgId).eq("title", TITULO_FECHADO).single(), "fechado");
  expect(fechado.status).toBe("won");
  expect(fechado.probability).toBe(100);
}

for (const provider of TOKEN_PROVEDORES) {
  test(`${provider}: conecta por token, lê a estrutura, sincroniza e desconecta`, async () => {
    test.setTimeout(120_000);
    const r = await invocar(c, "crm-connect", { action: "connect", provider, token: `token-${provider}`, domain: "e2e-conector", api_base: `${sandbox.base}/crm/${provider}` });
    expect(r.status, r.texto).toBe(200);
    const conexao = r.json?.connection as { id: string; structure: { pipelines: { stages: { name: string }[] }[]; users: unknown[] } };
    const nomes = conexao.structure.pipelines[0].stages.map((s) => s.name);
    expect(nomes).toContain("Proposta enviada");
    expect(conexao.structure.users.length).toBe(2);

    // O token não vaza: a linha lida pelo front só tem o id do segredo.
    const linha = ok(await c.db.from("crm_connections").select("vault_secret_id, structure, status").eq("id", conexao.id).single(), "conexão");
    expect(linha.vault_secret_id).toBeTruthy();
    expect(JSON.stringify(linha)).not.toContain(`token-${provider}`);

    const totais = await sincronizarTudo(conexao.id);
    expect(totais.companies.created + totais.companies.updated).toBe(1);
    expect(totais.contacts.created + totais.contacts.updated).toBe(2);
    expect(totais.deals.created + totais.deals.updated).toBe(2);
    expect(totais.deals.error).toBe(0);
    await conferirRegistros(provider);

    const imp = ok(await c.db.from("imports").select("status, source, connection_id, stats").eq("org_id", c.orgId).eq("source", provider).eq("kind", "deals").order("created_at", { ascending: false }).limit(1).single(), "import");
    expect(imp.status).toBe("completed");
    expect(imp.connection_id).toBe(conexao.id);

    const d = await invocar(c, "crm-connect", { action: "disconnect", connection_id: conexao.id });
    expect(d.status, d.texto).toBe(200);
    const restantes = ok(await c.db.from("crm_connections").select("id").eq("id", conexao.id), "restantes");
    expect(restantes).toHaveLength(0);
  });
}

test("token recusado pelo CRM de origem devolve erro legível e não cria conexão", async () => {
  const r = await invocar(c, "crm-connect", { action: "connect", provider: "hubspot", token: "x", api_base: `${sandbox.base}/crm/hubspot/inexistente` });
  expect(r.status).toBeGreaterThanOrEqual(400);
  expect(String(r.json?.error)).toMatch(/CRM de origem/);
  const linhas = ok(await c.db.from("crm_connections").select("id").eq("org_id", c.orgId).eq("provider", "hubspot"), "conexões hubspot");
  expect(linhas).toHaveLength(0);
});

test("salesforce: OAuth completo (oauth_start → callback), sincroniza pelo refresh token e desconecta", async () => {
  test.setTimeout(120_000);
  for (const [servico, valor] of [["salesforce_client_id", "sf-key-e2e"], ["salesforce_client_secret", "sf-secret-e2e"]]) {
    const s = await invocar(c, "store-api-key", { service_name: servico, api_key: valor, label: servico });
    expect(s.status, s.texto).toBe(200);
  }
  const inicio = await invocar(c, "crm-connect", { action: "oauth_start", provider: "salesforce", app_origin: "http://localhost:5199", api_base: `${sandbox.base}/crm/salesforce` });
  expect(inicio.status, inicio.texto).toBe(200);
  const url = new URL(String(inicio.json?.url));
  expect(url.pathname).toBe(`/functions/v1/integration-sandbox/${sandbox.token}/crm/salesforce/services/oauth2/authorize`);
  expect(url.searchParams.get("client_id")).toBe("sf-key-e2e");
  const state = url.searchParams.get("state")!;

  const volta = await fetch(`${c.functions}/crm-oauth-callback?code=code-e2e&state=${encodeURIComponent(state)}`, { redirect: "manual" });
  expect(volta.status).toBe(302);
  const location = volta.headers.get("location") ?? "";
  expect(location).toContain("http://localhost:5199/settings/importacao?secao=crm");
  expect(location).toContain("crm_connected=salesforce");

  // State é de uso único.
  const repetida = await fetch(`${c.functions}/crm-oauth-callback?code=code-e2e&state=${encodeURIComponent(state)}`, { redirect: "manual" });
  expect(repetida.headers.get("location") ?? "").toContain("crm_error=estado_invalido");

  const conexao = ok(await c.db.from("crm_connections").select("id, auth_type, structure").eq("org_id", c.orgId).eq("provider", "salesforce").single(), "conexão salesforce");
  expect(conexao.auth_type).toBe("oauth");
  const estrutura = conexao.structure as { pipelines: { stages: { name: string; won?: boolean }[] }[] };
  expect(estrutura.pipelines[0].stages.map((s) => s.name)).toEqual(["Contato inicial", "Proposta enviada", "Fechado ganho"]);
  expect(estrutura.pipelines[0].stages[2].won).toBe(true);

  const totais = await sincronizarTudo(conexao.id);
  expect(totais.contacts.created + totais.contacts.updated).toBe(2);
  expect(totais.deals.error).toBe(0);
  await conferirRegistros("salesforce");

  const d = await invocar(c, "crm-connect", { action: "disconnect", connection_id: conexao.id });
  expect(d.status, d.texto).toBe(200);
});

import { expect, test } from "@playwright/test";
import { ctx, invocar, Limpeza, MARCADOR, ok, uid, type Ctx } from "./ctx";

/**
 * Hard smoke da importação universal (Sprint 12 B8): contatos (criar e
 * atualizar por e-mail, empresa pelo nome, tag), negócios (etapa pelo de/para,
 * contato por e-mail, dono por e-mail) e desfazer (apaga só o que foi criado).
 */

test.describe.configure({ mode: "serial" });
test.skip(!process.env.HARD, "hard smoke: rode com npm run test:hard");

let c: Ctx;
let emailUsuario = "";
const limpeza = new Limpeza();
const sufixo = uid().slice(0, 6);
const emailNovo = `import-${sufixo}@exemplo.com.br`;
const emailExistente = `import-existente-${sufixo}@exemplo.com.br`;
const empresa = `${MARCADOR} Importada ${sufixo}`;
let importContatos = "";
let importNegocios = "";

test.beforeAll(async () => {
  c = await ctx();
  emailUsuario = (await c.db.auth.getUser()).data.user?.email ?? "";
  const existente = ok(await c.db.from("contacts").insert({ org_id: c.orgId, first_name: `${MARCADOR} Antes`, email: emailExistente }).select("id").single(), "contato existente");
  limpeza.add("contato existente", async () => {
    ok(await c.db.from("contact_tags").delete().eq("contact_id", existente.id), "tags");
    ok(await c.db.from("deals").delete().eq("contact_id", existente.id), "negócios");
    ok(await c.db.from("contacts").delete().eq("id", existente.id), "contato");
    ok(await c.db.from("tags").delete().eq("org_id", c.orgId).eq("name", `tag-${sufixo}`), "tag");
    ok(await c.db.from("companies").delete().eq("org_id", c.orgId).eq("name", empresa), "empresa");
  });
});

test.afterAll(async () => {
  await limpeza.rodar();
});

test("contatos: cria o novo, atualiza o existente pelo e-mail, liga empresa e tag", async () => {
  const imp = ok(await c.db.from("imports").insert({ org_id: c.orgId, kind: "contacts", source: "csv", file_name: "hard.csv", created_by: c.userId }).select("id").single(), "import");
  importContatos = imp.id;
  const r = await invocar(c, "import-run", {
    import_id: imp.id,
    rows: [
      { row_number: 2, data: { name: `${MARCADOR} Novo Import`, email: emailNovo, phone: "(48) 99999-1111", company: empresa, tags: `tag-${sufixo}`, "custom:plano": "anual" } },
      { row_number: 3, data: { email: emailExistente, title: "Diretora", status: "customer" } },
      { row_number: 4, data: { title: "sem nada" } },
    ],
  });
  expect(r.status, r.texto).toBe(200);
  expect(r.json).toMatchObject({ created: 1, updated: 1, error: 1 });

  const novo = ok(await c.db.from("contacts").select("id, first_name, last_name, company_id, custom_fields, source").eq("org_id", c.orgId).eq("email", emailNovo).single(), "novo");
  expect(`${novo.first_name} ${novo.last_name}`).toBe(`${MARCADOR} Novo Import`);
  expect(novo.company_id).toBeTruthy();
  expect(novo.custom_fields).toMatchObject({ plano: "anual" });
  const atualizado = ok(await c.db.from("contacts").select("title, status").eq("email", emailExistente).single(), "atualizado");
  expect(atualizado).toMatchObject({ title: "Diretora", status: "customer" });
  const linhas = ok(await c.db.from("import_rows").select("row_number, status, error").eq("import_id", imp.id).order("row_number"), "linhas");
  expect(linhas.map((l) => l.status)).toEqual(["created", "updated", "error"]);
  const def = ok(await c.db.from("custom_field_definitions").select("field_key").eq("org_id", c.orgId).eq("entity_type", "contact").eq("field_key", "plano"), "definição");
  expect(def.length).toBe(1);
});

test("negócios: etapa pelo de/para, contato por e-mail, dono por e-mail, ganho pelo status", async () => {
  const etapas = ok(await c.db.from("pipeline_stages").select("id, name").eq("org_id", c.orgId).order("order"), "etapas");
  const imp = ok(await c.db.from("imports").insert({
    org_id: c.orgId, kind: "deals", source: "pipedrive", file_name: "deals.csv", created_by: c.userId,
    mapping: { stages: { "Proposal Sent": etapas[1].id } },
  }).select("id").single(), "import negócios");
  importNegocios = imp.id;
  const r = await invocar(c, "import-run", {
    import_id: imp.id,
    rows: [
      { row_number: 2, data: { external_id: `pd-${sufixo}-1`, title: `${MARCADOR} negócio importado`, value: "R$ 4.900,00", stage: "Proposal Sent", contact_email: emailNovo, owner_email: emailUsuario, close_date: "31/12/2026" } },
      { row_number: 3, data: { external_id: `pd-${sufixo}-2`, title: `${MARCADOR} negócio ganho`, value: "1200", status: "Won", contact_email: emailExistente } },
    ],
  });
  expect(r.status, r.texto).toBe(200);
  expect(r.json).toMatchObject({ created: 2, error: 0 });
  const d1 = ok(await c.db.from("deals").select("stage_id, value, owner_id, close_date, contact_id").eq("org_id", c.orgId).eq("custom_fields->>external_id", `pd-${sufixo}-1`).single(), "negócio 1");
  expect(d1.stage_id).toBe(etapas[1].id);
  expect(Number(d1.value)).toBe(4900);
  expect(d1.owner_id).toBe(c.userId);
  expect(d1.close_date).toBe("2026-12-31");
  const d2 = ok(await c.db.from("deals").select("status, probability").eq("org_id", c.orgId).eq("custom_fields->>external_id", `pd-${sufixo}-2`).single(), "negócio 2");
  expect(d2).toMatchObject({ status: "won", probability: 100 });

  // Reimportar o mesmo external_id atualiza em vez de duplicar.
  const r2 = await invocar(c, "import-run", { import_id: imp.id, rows: [{ row_number: 4, data: { external_id: `pd-${sufixo}-1`, value: "5000" } }] });
  expect(r2.json).toMatchObject({ updated: 1 });
});

test("desfazer apaga o que foi criado e mantém o que foi atualizado", async () => {
  for (const id of [importNegocios, importContatos]) {
    ok(await c.db.from("imports").update({ status: "completed" }).eq("id", id), "concluir");
    const { data, error } = await c.db.rpc("desfazer_importacao", { p_import: id });
    expect(error, error?.message).toBeNull();
    expect(data).toBeTruthy();
  }
  const negocios = ok(await c.db.from("deals").select("id").eq("org_id", c.orgId).like("custom_fields->>external_id", `pd-${sufixo}-%`), "negócios");
  expect(negocios).toHaveLength(0);
  const novo = ok(await c.db.from("contacts").select("id").eq("email", emailNovo), "novo");
  expect(novo).toHaveLength(0);
  const existente = ok(await c.db.from("contacts").select("title").eq("email", emailExistente).single(), "existente");
  expect(existente.title, "o atualizado continua").toBe("Diretora");
  const status = ok(await c.db.from("imports").select("status").eq("id", importContatos).single(), "status");
  expect(status.status).toBe("undone");
});

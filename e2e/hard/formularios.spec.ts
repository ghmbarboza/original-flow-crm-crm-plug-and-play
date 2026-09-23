import { expect, test } from "@playwright/test";
import { ctx, Limpeza, MARCADOR, ok, postFunction, uid, type Ctx } from "./ctx";

/**
 * Hard smoke dos formulários (Sprint 12 B3): a function pública recebe o envio
 * com rastreamento, valida a regra condicional, grava origem por UTM, campos
 * extras, evento de rastreamento e contagem; o embed devolve JavaScript.
 */

test.describe.configure({ mode: "serial" });
test.skip(!process.env.HARD, "hard smoke: rode com npm run test:hard");

let c: Ctx;
const limpeza = new Limpeza();
const slug = `e2e-hard-form-${uid().slice(0, 8)}`;
let formId = "";

test.beforeAll(async () => {
  c = await ctx();
  const form = ok(await c.db.from("capture_forms").insert({
    org_id: c.orgId, name: `${MARCADOR} form`, slug, is_active: true, source_default: "site",
    success_message: "Valeu!", consent_text: "Ao enviar você aceita contato.",
    fields: [
      { key: "name", label: "Nome", type: "text", required: true },
      { key: "email", label: "E-mail", type: "email", required: true },
      { key: "interesse", label: "Interesse", type: "select", required: true, options: ["Plano mensal", "Plano anual"] },
      { key: "usuarios", label: "Usuários", type: "number", required: true, show_when: { field: "interesse", op: "eq", value: "Plano anual" } },
      { key: "aceite", label: "Aceito", type: "checkbox", required: false },
      { key: "campanha_interna", label: "Campanha", type: "hidden", value: "lp-setembro" },
    ],
  }).select("id").single(), "criar formulário");
  formId = form.id;
  limpeza.add("formulário", async () => {
    const contatos = ok(await c.db.from("contacts").select("id").eq("org_id", c.orgId).like("email", `hard-form-%@exemplo.com.br`), "contatos") ?? [];
    for (const ct of contatos) {
      ok(await c.db.from("tracking_events").delete().eq("contact_id", ct.id), "apagar tracking");
      ok(await c.db.from("deals").delete().eq("contact_id", ct.id), "apagar negócios");
      ok(await c.db.from("contacts").delete().eq("id", ct.id), "apagar contato");
    }
    ok(await c.db.from("capture_forms").delete().eq("id", formId), "apagar formulário");
  });
});

test.afterAll(async () => {
  await limpeza.rodar();
});

test("get devolve o schema público com mensagem e consentimento", async () => {
  const r = await postFunction(c, "submit-capture-form", { action: "get", slug });
  expect(r.status, r.texto).toBe(200);
  expect(r.json).toMatchObject({ success_message: "Valeu!", consent_text: "Ao enviar você aceita contato." });
  expect((r.json!.fields as unknown[]).length).toBe(6);
});

test("campo condicional exigido só quando a regra bate", async () => {
  const base = { name: "Hard Form", email: `hard-form-${uid().slice(0, 6)}@exemplo.com.br` };
  const semUsuarios = await postFunction(c, "submit-capture-form", { action: "submit", slug, values: { ...base, interesse: "Plano anual" } });
  expect(semUsuarios.status).toBe(400);
  expect(semUsuarios.json?.error).toContain("Usuários");
  const mensal = await postFunction(c, "submit-capture-form", { action: "submit", slug, values: { ...base, interesse: "Plano mensal" } });
  expect(mensal.status, mensal.texto).toBe(200);
});

test("envio com UTM grava origem, campos extras, rastreamento e contagem", async () => {
  const email = `hard-form-${uid().slice(0, 6)}@exemplo.com.br`;
  const r = await postFunction(c, "submit-capture-form", {
    action: "submit", slug,
    values: { name: "Hard Utm", email, interesse: "Plano anual", usuarios: "12", aceite: "true", campanha_interna: "tentativa-de-sobrescrever" },
    tracking: { utm_source: "Google Ads", utm_campaign: "setembro", gclid: "abc123", referrer: "https://google.com/", page_url: "https://site.com.br/lp" },
  });
  expect(r.status, r.texto).toBe(200);
  expect(r.json).toMatchObject({ ok: true, success_message: "Valeu!" });

  const contato = ok(await c.db.from("contacts").select("id, source, custom_fields").eq("org_id", c.orgId).eq("email", email).single(), "contato");
  expect(contato.source).toBe("google_ads");
  expect(contato.custom_fields).toMatchObject({
    interesse: "Plano anual", usuarios: 12, aceite: true, campanha_interna: "lp-setembro",
    utm_source: "Google Ads", utm_campaign: "setembro", gclid: "abc123", landing_page: "https://site.com.br/lp", referrer: "https://google.com/",
  });

  const evento = ok(await c.db.from("tracking_events").select("event_type, page_url, meta").eq("contact_id", contato.id), "tracking")[0];
  expect(evento).toMatchObject({ event_type: "form_submitted", page_url: "https://site.com.br/lp" });
  expect(evento.meta).toMatchObject({ form_id: formId, source: "google_ads" });

  const form = ok(await c.db.from("capture_forms").select("submissions_count").eq("id", formId).single(), "form");
  expect(form.submissions_count).toBeGreaterThanOrEqual(2);
});

test("embed devolve JavaScript que aponta para /f/<slug>", async () => {
  const resp = await fetch(`${c.functions}/capture-form-embed?form=${slug}`);
  expect(resp.status).toBe(200);
  expect(resp.headers.get("content-type")).toContain("javascript");
  const js = await resp.text();
  expect(js).toContain(`"/f/" + slug`);
  expect(js).toContain("flowcrm:form-height");
});

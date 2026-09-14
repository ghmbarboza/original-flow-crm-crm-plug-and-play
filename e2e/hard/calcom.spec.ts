import { expect, test } from "@playwright/test";
import { ctx, hmacHex, Limpeza, MARCADOR, ok, postFunction, uid, type Ctx } from "./ctx";

/**
 * Agendamento pelo Cal.com: BOOKING_CREATED assinado com o secret da empresa
 * (x-cal-signature-256, HMAC-SHA256 hex do corpo) vira reunião no CRM, ligada ao
 * contato e ao negócio aberto dele.
 */

test.describe.configure({ mode: "serial" });
test.skip(!process.env.HARD, "hard smoke: rode com npm run test:hard");

let c: Ctx;
const limpeza = new Limpeza();
const secret = uid();
const email = `e2ehard.${uid().slice(0, 8)}@exemplo.com`;
let contatoId = "";
let dealId = "";

function booking(trigger: string, titulo: string) {
  return JSON.stringify({
    triggerEvent: trigger,
    createdAt: new Date().toISOString(),
    payload: {
      title: titulo,
      startTime: new Date(Date.now() + 86_400_000).toISOString(),
      endTime: new Date(Date.now() + 88_200_000).toISOString(),
      attendees: [{ email, name: `${MARCADOR} Cal`, timeZone: "America/Sao_Paulo" }],
      organizer: { email: "consultoria@exemplo.com", name: "Consultoria" },
    },
  });
}

test.beforeAll(async () => {
  c = await ctx();

  const original = ok(await c.db.from("integration_configs").select("id, config, is_active").eq("org_id", c.orgId).eq("provider", "calcom").maybeSingle(), "ler Cal.com");
  if (original) {
    limpeza.add("restaurar Cal.com", async () =>
      ok(await c.db.from("integration_configs").update({ config: original.config, is_active: original.is_active }).eq("id", original.id), "restaurar Cal.com"));
    ok(await c.db.from("integration_configs").update({
      config: { ...(original.config as object), scheduling_link: "https://cal.com/e2e/30min", webhook_secret: secret },
      is_active: true,
    }).eq("id", original.id), "ativar Cal.com");
  } else {
    const row = ok(await c.db.from("integration_configs").insert({
      org_id: c.orgId, provider: "calcom", is_active: true,
      config: { scheduling_link: "https://cal.com/e2e/30min", webhook_secret: secret, create_activity: true, link_deal: true, notify_agent: true },
    }).select("id").single(), "criar Cal.com");
    limpeza.add("apagar Cal.com", async () => ok(await c.db.from("integration_configs").delete().eq("id", row.id), "apagar Cal.com"));
  }

  const contato = ok(await c.db.from("contacts").insert({ org_id: c.orgId, first_name: `${MARCADOR} Cal`, email }).select("id").single(), "contato");
  contatoId = contato.id;
  const deal = ok(await c.db.from("deals").insert({ org_id: c.orgId, title: `Negócio ${MARCADOR} Cal`, contact_id: contatoId, status: "open" }).select("id").single(), "negócio");
  dealId = deal.id;
  limpeza.add("contato Cal.com", async () => {
    ok(await c.db.from("activities").delete().eq("contact_id", contatoId), "apagar atividades");
    ok(await c.db.from("deals").delete().eq("contact_id", contatoId), "apagar negócios");
    ok(await c.db.from("contacts").delete().eq("id", contatoId), "apagar contato");
  });
});

test.afterAll(async () => {
  await limpeza.rodar();
});

test("BOOKING_CREATED assinado vira reunião ligada ao contato e ao negócio", async () => {
  const titulo = `Reunião ${MARCADOR} ${uid().slice(0, 6)}`;
  const corpo = booking("BOOKING_CREATED", titulo);
  const r = await postFunction(c, `calcom-webhook?org=${c.orgId}`, corpo, { "x-cal-signature-256": hmacHex(secret, corpo) });
  expect(r.status, r.texto).toBe(200);

  const atividade = ok(await c.db.from("activities").select("type, contact_id, deal_id, due_date").eq("title", titulo).single(), "atividade");
  expect(atividade).toMatchObject({ type: "meeting", contact_id: contatoId, deal_id: dealId });
  expect(atividade.due_date).toBeTruthy();
});

test("sem assinatura, com assinatura errada ou com org errada: nada é criado", async () => {
  const titulo = `Falsa ${MARCADOR} ${uid().slice(0, 6)}`;
  const corpo = booking("BOOKING_CREATED", titulo);
  expect((await postFunction(c, `calcom-webhook?org=${c.orgId}`, corpo)).status).toBe(401);
  expect((await postFunction(c, `calcom-webhook?org=${c.orgId}`, corpo, { "x-cal-signature-256": hmacHex("outro", corpo) })).status).toBe(401);
  const outraOrg = await postFunction(c, "calcom-webhook?org=00000000-0000-0000-0000-000000000000", corpo, { "x-cal-signature-256": hmacHex(secret, corpo) });
  expect(outraOrg.json?.skipped).toBeTruthy();

  const atividades = ok(await c.db.from("activities").select("id").eq("title", titulo), "ler");
  expect(atividades).toHaveLength(0);
});

test("outros eventos do Cal.com são ignorados sem erro", async () => {
  const titulo = `Cancelada ${MARCADOR} ${uid().slice(0, 6)}`;
  const corpo = booking("BOOKING_CANCELLED", titulo);
  const r = await postFunction(c, `calcom-webhook?org=${c.orgId}`, corpo, { "x-cal-signature-256": hmacHex(secret, corpo) });
  expect(r.status).toBe(200);
  expect(r.json?.skipped).toBeTruthy();
});

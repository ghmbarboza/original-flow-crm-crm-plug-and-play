import { expect, test } from "@playwright/test";
import { ctx, invocar, type Ctx } from "./ctx";

/**
 * Hard smoke do kit inicial (Sprint 12 B7): a function gera um kit válido para
 * a org de teste (normalizado no servidor). Nada é gravado: a aplicação é
 * decisão do usuário no wizard.
 */

test.skip(!process.env.HARD, "hard smoke: rode com npm run test:hard");

let c: Ctx;

test.beforeAll(async () => {
  c = await ctx();
});

test("generate-starter-kit devolve automações, follow-up, sequência, modelos, templates e respostas rápidas", async () => {
  test.setTimeout(180_000);
  const r = await invocar(c, "generate-starter-kit", {});
  expect(r.status, r.texto).toBe(200);
  const kit = r.json!.kit as {
    automations: { name: string; trigger: { type: string }; actions: { type: string }[] }[];
    followup: { steps: unknown[] } | null;
    sequences: { steps: unknown[] }[];
    email_templates: unknown[];
    whatsapp_templates: { name: string; body_text: string; example_params: string[] }[];
    quick_replies: { shortcut: string }[];
  };
  expect(kit.automations.length).toBeGreaterThanOrEqual(1);
  for (const a of kit.automations) {
    expect(["contact_created", "form_submitted", "deal_stage_changed", "tag_added", "message_received"]).toContain(a.trigger.type);
    expect(a.actions.length).toBeGreaterThan(0);
  }
  expect(kit.followup?.steps.length ?? 0).toBeGreaterThanOrEqual(1);
  expect(kit.sequences.length).toBeGreaterThanOrEqual(1);
  expect(kit.email_templates.length).toBeGreaterThanOrEqual(1);
  expect(kit.whatsapp_templates.length).toBeGreaterThanOrEqual(1);
  for (const t of kit.whatsapp_templates) {
    expect(t.name).toMatch(/^[a-z][a-z0-9_]*$/);
    const variaveis = [...t.body_text.matchAll(/\{\{(\d+)\}\}/g)].length;
    expect(t.example_params.length).toBe(Math.max(...[0, ...[...t.body_text.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]))]));
    void variaveis;
  }
  expect(kit.quick_replies.length).toBeGreaterThanOrEqual(1);
  expect(JSON.stringify(kit)).not.toMatch(/\[(empresa|produto|problema|setor)\]/i);
});

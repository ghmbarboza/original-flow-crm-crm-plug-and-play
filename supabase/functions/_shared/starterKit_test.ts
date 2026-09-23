// deno test supabase/functions/_shared/starterKit_test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { contarVariaveis, nomeDeTemplate, normalizarKit } from "./starterKit.ts";

Deno.test("descarta automação com gatilho ou ação desconhecidos e mantém a válida", () => {
  const kit = normalizarKit({
    automations: [
      { name: "Ruim", trigger: { type: "deal_deleted" }, actions: [{ type: "send_email", params: {} }] },
      { name: "Sem ação válida", trigger: { type: "contact_created" }, actions: [{ type: "explodir" }] },
      { name: "Boas-vindas", trigger: { type: "form_submitted" }, conditions: [{ field: "source", op: "eq", value: "capture_form" }], actions: [{ type: "ai_outreach", params: { instruction: "Cumprimente" } }] },
    ],
  });
  assertEquals(kit.automations.length, 1);
  assertEquals(kit.automations[0].actions[0].type, "ai_outreach");
  assertEquals(kit.automations[0].conditions[0].op, "eq");
});

Deno.test("follow-up limita tentativas e usa 'notify' quando o limite vem inválido", () => {
  const kit = normalizarKit({ followup: { max_attempts: 99, on_limit_reached: "xyz", steps: [{ delay_hours: 0, message: "Oi" }, { delay_hours: 48, message: "" }] } });
  assertEquals(kit.followup?.max_attempts, 10);
  assertEquals(kit.followup?.on_limit_reached, "notify_agent");
  assertEquals(kit.followup?.steps, [{ delay_hours: 1, message: "Oi" }]);
});

Deno.test("template do WhatsApp: nome no formato da Meta e exemplos na quantidade das variáveis", () => {
  const kit = normalizarKit({ whatsapp_templates: [{ name: "Primeiro Contato!", category: "utility", body_text: "Olá {{1}}, aqui é a {{2}}.", example_params: ["Ana"] }] });
  assertEquals(kit.whatsapp_templates[0].name, "primeiro_contato");
  assertEquals(kit.whatsapp_templates[0].category, "UTILITY");
  assertEquals(kit.whatsapp_templates[0].example_params.length, 2);
  assertEquals(nomeDeTemplate("123 abc"), "t_123_abc");
  assertEquals(contarVariaveis("sem variável"), 0);
});

Deno.test("respostas rápidas normalizam o atalho", () => {
  const kit = normalizarKit({ quick_replies: [{ shortcut: "/Bom Dia", content: "Bom dia!" }, { shortcut: "", content: "x" }] });
  assertEquals(kit.quick_replies, [{ shortcut: "bom-dia", title: "bom-dia", content: "Bom dia!" }]);
});

import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { blocoDoLead, fundirAnalise, lerMemoria, memoriaVazia } from "./leadState.ts";

Deno.test("fundirAnalise: confirmado fica, vazio não apaga, inferido atualiza e listas unem sem repetir", () => {
  const atual = lerMemoria({
    lead_state: { company: { value: "Padaria Sol", status: "confirmed", source: "equipe" }, role: { value: "gerente", status: "inferred" } },
    sales_intelligence: { interests: ["plano anual"], pains: [], objections: [], score: 40, summary: null },
  });
  const nova = fundirAnalise(atual, { company: "Outra Ltda", role: "", budget: "até 2 mil por mês", interests: ["Plano Anual", "suporte"], score: 72, summary: "Quer fechar este mês." });
  assertEquals(nova.lead_state.company?.value, "Padaria Sol");
  assertEquals(nova.lead_state.company?.status, "confirmed");
  assertEquals(nova.lead_state.role?.value, "gerente");
  assertEquals(nova.lead_state.budget?.value, "até 2 mil por mês");
  assertEquals(nova.lead_state.budget?.status, "inferred");
  assertEquals(nova.lead_state.urgency?.status, "unknown");
  assertEquals(nova.sales_intelligence.interests, ["plano anual", "suporte"]);
  assertEquals(nova.sales_intelligence.score, 72);
  assertEquals(nova.interaction_summary.analyses, 1);
});

Deno.test("lerMemoria tolera JSON vazio ou antigo e limita o score", () => {
  assertEquals(lerMemoria(null).sales_intelligence.score, null);
  assertEquals(lerMemoria({ sales_intelligence: { score: 250 } }).sales_intelligence.score, 100);
  assertEquals(lerMemoria("lixo").lead_state, {});
});

Deno.test("blocoDoLead marca inferido e confirmado, escapa tags e some quando não há nada", () => {
  assertEquals(blocoDoLead(memoriaVazia(), null), "");
  const m = fundirAnalise(memoriaVazia(), { company: "ACME <script>", pains: ["atraso na entrega"] });
  m.lead_state.role = { value: "diretora", status: "confirmed", source: "equipe" };
  const bloco = blocoDoLead(m, "Ana");
  assertStringIncludes(bloco, "- Nome: Ana");
  assertStringIncludes(bloco, "Empresa: ACME ‹script› [inferido");
  assertStringIncludes(bloco, "Cargo ou papel: diretora [confirmado pela equipe]");
  assertStringIncludes(bloco, "Dores percebidas: atraso na entrega");
  assertStringIncludes(bloco, "<contexto_do_lead");
});

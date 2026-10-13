// deno test supabase/functions/_shared/negocio_test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { primeiraEtapaDoFunil, resolverEtapaPorNome, type EtapaDoFunil } from "./negocio.ts";

// Dois funis com etapas de mesmo nome e mesma posição: o caso que misturava tudo.
const etapas: EtapaDoFunil[] = [
  { id: "v0", name: "Lead", order: 0, pipeline_id: "vendas" },
  { id: "p0", name: "Lead", order: 0, pipeline_id: "pos" },
  { id: "v1", name: "Proposta", order: 1, pipeline_id: "vendas" },
  { id: "p1", name: "Onboarding", order: 1, pipeline_id: "pos" },
  { id: "r0", name: "Proposta", order: 0, pipeline_id: "renovacao" },
];

Deno.test("primeira etapa é a de menor ordem do funil pedido, não da organização", () => {
  assertEquals(primeiraEtapaDoFunil(etapas, "pos")?.id, "p0");
  assertEquals(primeiraEtapaDoFunil(etapas, "renovacao")?.id, "r0");
  assertEquals(primeiraEtapaDoFunil(etapas, "inexistente"), null);
});

Deno.test("nome repetido em dois funis: vale o do funil preferido", () => {
  assertEquals(resolverEtapaPorNome(etapas, " lead ", "pos"), { etapa: etapas[1] });
  assertEquals(resolverEtapaPorNome(etapas, "LEAD", "vendas"), { etapa: etapas[0] });
});

Deno.test("nome que só existe em outro funil: usa quando é único", () => {
  assertEquals(resolverEtapaPorNome(etapas, "Onboarding", "vendas"), { etapa: etapas[3] });
});

Deno.test("nome fora do funil preferido e repetido nos outros: ambíguo, não escolhe", () => {
  assertEquals(resolverEtapaPorNome(etapas, "Proposta", "pos"), { erro: "ambigua" });
});

Deno.test("restrito ao funil: não sai dele nem quando o nome é único fora", () => {
  assertEquals(resolverEtapaPorNome(etapas, "Onboarding", "vendas", { soNoFunil: true }), { erro: "inexistente" });
  assertEquals(resolverEtapaPorNome(etapas, "Proposta", "vendas", { soNoFunil: true }), { etapa: etapas[2] });
});

Deno.test("nome que não existe em funil nenhum", () => {
  assertEquals(resolverEtapaPorNome(etapas, "Fechamento", "vendas"), { erro: "inexistente" });
});

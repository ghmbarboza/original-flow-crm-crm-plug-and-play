import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { abertosPorEtapa, ajudaPlataforma, rotaValida } from "./ferramentas.ts";

Deno.test("ajuda acha o guia pelo verbo conjugado (importo → importar)", () => {
  assertEquals(ajudaPlataforma({ tema: "Como importo contatos?" }).guias[0]?.guia_completo, "/help?guia=importacao");
});

Deno.test("ajuda acha o guia pelo verbo conjugado (conecto → conectar)", () => {
  assertEquals(ajudaPlataforma({ tema: "como eu conecto o whatsapp" }).guias[0]?.guia_completo, "/help?guia=whatsapp");
});

Deno.test("ajuda: guia citado pelo assunto vem antes do guia geral que cita tudo", () => {
  const primeiro = (tema: string) => ajudaPlataforma({ tema }).guias[0]?.guia_completo;
  assertEquals(primeiro("quero ligar para os leads"), "/help?guia=voz");
  assertEquals(primeiro("trazer meus dados do pipedrive"), "/help?guia=importacao");
  assertEquals(primeiro("como crio uma automação"), "/help?guia=automacoes");
  assertEquals(primeiro("como mudo as etapas do funil"), "/help?guia=funil");
});

Deno.test("funil lista todas as etapas, inclusive as vazias, na ordem", () => {
  const etapas = [
    { id: "a", name: "Lead", order: 0 },
    { id: "b", name: "Demo", order: 1 },
    { id: "c", name: "Fechamento", order: 2 },
  ];
  const r = abertosPorEtapa(etapas, [{ stage_id: "a", value: 100 }, { stage_id: "a", value: 50 }, { stage_id: "c", value: 10 }]);
  assertEquals(r.map((e) => [e.etapa, e.quantidade]), [["Lead", 2], ["Demo", 0], ["Fechamento", 1]]);
  assertEquals(r[1].valor, 0);
});

Deno.test("funil mostra negócio sem etapa conhecida no fim", () => {
  const r = abertosPorEtapa([{ id: "a", name: "Lead", order: 0 }], [{ stage_id: "x", value: 5 }]);
  assertEquals(r.map((e) => e.etapa), ["Lead", "Sem etapa"]);
});

Deno.test("tela do app: aceita rota interna, recusa outro site e rota inventada", () => {
  assertEquals(rotaValida("/settings/ia?aba=knowledge"), true);
  assertEquals(rotaValida("/deals/123"), true);
  assertEquals(rotaValida("//site-externo.com/roubo"), false);
  assertEquals(rotaValida("https://site-externo.com"), false);
  assertEquals(rotaValida("/faturamento"), false);
});

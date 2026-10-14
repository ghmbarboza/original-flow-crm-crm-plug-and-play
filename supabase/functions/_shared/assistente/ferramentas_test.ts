import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { ajudaPlataforma, rotaValida } from "./ferramentas.ts";
import { abertosPorEtapa, acharFunil, periodoPedido } from "./gestao.ts";

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

Deno.test("ajuda conhece as funções novas: metas, vários funis, template de 24h e chave própria de IA", () => {
  const primeiro = (tema: string) => ajudaPlataforma({ tema }).guias[0]?.guia_completo;
  assertEquals(primeiro("como crio uma meta de conversão por vendedor"), "/help?guia=metas");
  assertEquals(primeiro("quero ter mais de um funil"), "/help?guia=funil");
  assertEquals(primeiro("passou 24 horas e não consigo responder o cliente"), "/help?guia=whatsapp");
  assertEquals(primeiro("usar minha própria chave da openai"), "/help?guia=ia-provedor");
});

Deno.test("funil pelo nome: exato, parcial, sem acento; nome inexistente vira erro com a lista", () => {
  const funis = [{ id: "1", name: "Vendas", is_default: true }, { id: "2", name: "Pós-venda", is_default: false }];
  assertEquals(acharFunil(funis, ""), null);
  assertEquals((acharFunil(funis, "pos venda") as { id: string }).id, "2");
  assertEquals((acharFunil(funis, "pós") as { id: string }).id, "2");
  assertEquals((acharFunil(funis, "VENDAS") as { id: string }).id, "1");
  assertEquals("erro" in (acharFunil(funis, "suporte") as object), true);
});

Deno.test("período das metas: mês atual por padrão, tipo com referência e datas livres", () => {
  assertEquals(periodoPedido({}, "2026-10-14"), { tipo: "mes", inicio: "2026-10-01", fim: "2026-10-31" });
  assertEquals(periodoPedido({ periodo: "trimestre", referencia: "2026-05-02" }, "2026-10-14"), { tipo: "trimestre", inicio: "2026-04-01", fim: "2026-06-30" });
  assertEquals(periodoPedido({ de: "2026-10-06", ate: "2026-10-12" }, "2026-10-14"), { tipo: "personalizado", inicio: "2026-10-06", fim: "2026-10-12" });
  // Datas invertidas não valem: volta ao padrão.
  assertEquals(periodoPedido({ de: "2026-10-12", ate: "2026-10-06" }, "2026-10-14").tipo, "mes");
});
